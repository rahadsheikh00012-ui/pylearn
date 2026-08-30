import json
from datetime import timedelta
from urllib.parse import quote
import httpx
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from .models import AIProviderConfig, EmailNotification, StudyPlan


class AIProviderError(ValueError):
    pass


def log_activity(actor, action, entity, entity_id="", details=""):
    from .models import ActivityLog
    return ActivityLog.objects.create(actor=actor, action=action, entity=entity, entity_id=str(entity_id or ""), details=details)


def queue_email(recipient, event_type, subject, summary):
    record = EmailNotification.objects.create(
        recipient=recipient, event_type=event_type, subject=subject, summary=summary
    )

    def deliver():
        try:
            send_mail(subject, summary, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False)
            record.status = EmailNotification.Status.SENT
            record.error_message = ""
        except Exception as exc:
            record.status = EmailNotification.Status.FAILED
            record.error_message = str(exc)[:2000]
        record.attempted_at = timezone.now()
        record.save(update_fields=["status", "error_message", "attempted_at", "updated_at"])

    transaction.on_commit(deliver)
    return record


def retry_email(record):
    record.status = EmailNotification.Status.PENDING
    record.error_message = ""
    record.save(update_fields=["status", "error_message", "updated_at"])
    try:
        send_mail(record.subject, record.summary, settings.DEFAULT_FROM_EMAIL, [record.recipient.email], fail_silently=False)
        record.status = EmailNotification.Status.SENT
    except Exception as exc:
        record.status = EmailNotification.Status.FAILED
        record.error_message = str(exc)[:2000]
    record.attempted_at = timezone.now()
    record.save(update_fields=["status", "error_message", "attempted_at", "updated_at"])
    return record


def _fernet():
    if not settings.AI_CONFIG_ENCRYPTION_KEY:
        raise ValueError("AI_CONFIG_ENCRYPTION_KEY is not configured.")
    return Fernet(settings.AI_CONFIG_ENCRYPTION_KEY.encode())


def encrypt_key(value):
    return _fernet().encrypt(value.encode()).decode()


def decrypt_key(value):
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("The configured AI key cannot be decrypted.") from exc


def masked_key(config):
    try:
        key = decrypt_key(config.encrypted_api_key)
        return f"{key[:3]}...{key[-4:]}" if len(key) > 8 else "********"
    except ValueError:
        return "unavailable"


def normalize_ai_model(provider, model):
    value = str(model or "").strip()
    generic_aliases = {
        "gpt-oss-20b": "openai/gpt-oss-20b",
        "gpt-oss-120b": "openai/gpt-oss-120b",
    }
    if provider == AIProviderConfig.Provider.GENERIC:
        return generic_aliases.get(value.casefold(), value)
    if provider == AIProviderConfig.Provider.GEMINI:
        gemini_aliases = {
            "gemini 2.5 flash": "gemini-2.5-flash",
            "gemini 2.5 flash-lite": "gemini-2.5-flash-lite",
            "gemini 2.5 pro": "gemini-2.5-pro",
        }
        return gemini_aliases.get(value.casefold(), value)
    return value


def _extract_json(text):
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise
        data = json.loads(cleaned[start:end + 1])
    required = {"summary", "weak_topics", "recommendations", "schedule"}
    if not isinstance(data, dict) or not required.issubset(data):
        raise ValueError("AI response is missing required study-plan fields.")
    if not isinstance(data["weak_topics"], list) or not isinstance(data["recommendations"], list) or not isinstance(data["schedule"], list):
        raise ValueError("AI response contains invalid study-plan fields.")
    return data


WEEKDAY_LOOKUP = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "tues": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}


def _valid_iso_date(value):
    if not isinstance(value, str):
        return ""
    try:
        return timezone.datetime.strptime(value.strip(), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


def _next_weekday_date(start_date, day):
    weekday = WEEKDAY_LOOKUP.get(str(day or "").strip().casefold())
    if weekday is None:
        return ""
    days_ahead = (weekday - start_date.weekday()) % 7
    return (start_date + timedelta(days=days_ahead)).isoformat()


def _normalize_schedule_item_dates(item, start_date):
    if not isinstance(item, dict):
        return item
    normalized = {**item}
    date = _valid_iso_date(normalized.get("date"))
    if date:
        normalized["date"] = date
    else:
        fallback_date = _next_weekday_date(start_date, normalized.get("day"))
        if fallback_date:
            normalized["date"] = fallback_date

    tasks = normalized.get("tasks")
    if isinstance(tasks, list):
        normalized_tasks = []
        for task in tasks:
            if not isinstance(task, dict):
                normalized_tasks.append(task)
                continue
            task_data = {**task, "day": task.get("day") or normalized.get("day")}
            if task.get("date"):
                task_data["date"] = task.get("date")
            elif not task.get("day") and normalized.get("date"):
                task_data["date"] = normalized.get("date")
            normalized_tasks.append(_normalize_schedule_item_dates(task_data, start_date))
        normalized["tasks"] = normalized_tasks
    return normalized


def _normalize_study_plan_dates(data, start_date):
    return {
        **data,
        "schedule": [_normalize_schedule_item_dates(item, start_date) for item in data["schedule"]],
    }


def _provider_error(config, exc):
    provider = config.get_provider_display()
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        return AIProviderError(
            f"{provider} request failed with HTTP {status_code}. Check the configured model, base URL, and API key."
        )
    if isinstance(exc, httpx.RequestError):
        return AIProviderError(f"{provider} request failed before a response was received. Check network access and provider settings.")
    if isinstance(exc, (KeyError, IndexError, TypeError, json.JSONDecodeError)):
        return AIProviderError(f"{provider} returned an unexpected study-plan response.")
    return AIProviderError(f"{provider} could not generate a study plan.")


def generate_study_plan(student, performance):
    config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
    if not config:
        raise ValueError("An Admin must configure an active AI provider.")
    api_key = decrypt_key(config.encrypted_api_key)
    plan_start_date = timezone.localdate()
    prompt = (
        "Create a personalized learning plan from this performance data. Return only a valid JSON object with "
        "these exact keys: summary (string), weak_topics (string array), recommendations (array), and schedule "
        "(array). Build the schedule starting from "
        f"{plan_start_date.isoformat()} and assign exact dates for the planned sessions. Every schedule item must "
        "include date in YYYY-MM-DD format and day as the weekday label. If you reference a course, use its "
        "course_code and title. Do not expose numeric internal course_id values in the student-facing plan. "
        "Do not include markdown, prose, or code fences.\n"
        + json.dumps(performance, default=str)
    )
    timeout = httpx.Timeout(45.0)
    try:
        if config.provider == AIProviderConfig.Provider.GEMINI:
            url = config.base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{quote(config.model)}:generateContent"
            response = httpx.post(url, params={"key": api_key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=timeout)
            response.raise_for_status()
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        else:
            base = config.base_url or "https://api.openai.com/v1"
            response = httpx.post(
                f"{base.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": config.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are PyLearn's study-plan engine. You only return valid JSON objects.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
                timeout=timeout,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
        data = _normalize_study_plan_dates(_extract_json(text), plan_start_date)
    except Exception as exc:
        raise _provider_error(config, exc) from exc
    return StudyPlan.objects.create(student=student, provider=config.provider, **data)


def generate_assessment_recommendations(student, performance, available_courses):
    config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
    if not config:
        raise ValueError("An Admin must configure an active AI provider.")
    api_key = decrypt_key(config.encrypted_api_key)
    prompt = (
        "Analyze the following student's initial assessment quiz performance, including every question, selected answer, "
        "correct answer, correctness, and topic. Determine the single knowledge or skill area where the student performed "
        "best, then match that strongest area against the provided list of available courses.\n"
        "Return ONLY a valid JSON object with a single key 'recommendations'. The value should be a JSON array of objects. "
        "The array must contain exactly one object for the one best-matching course, or an empty array if no course matches. "
        "The object must have exactly two keys: 'course_id' (the integer ID of the recommended course) and 'reason' "
        "(a short, personalized explanation of the strongest area the student demonstrated and why this course is the best database match). "
        "For passed attempts, the reason must be positive and strength-based. Do not say the student lacks, needs basics, "
        "has not demonstrated knowledge, or should start over unless the submitted answers actually show that weakness. "
        "Do not recommend every related course. Do not choose a course only because it relates to one question.\n"
        "Do not include markdown, prose, or code fences.\n\n"
        "Student Performance:\n" + json.dumps(performance, default=str) + "\n\n"
        "Available Courses:\n" + json.dumps(available_courses, default=str)
    )
    timeout = httpx.Timeout(30.0)
    try:
        if config.provider == AIProviderConfig.Provider.GEMINI:
            url = config.base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{quote(config.model)}:generateContent"
            response = httpx.post(url, params={"key": api_key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=timeout)
            response.raise_for_status()
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        else:
            base = config.base_url or "https://api.openai.com/v1"
            response = httpx.post(
                f"{base.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": config.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are PyLearn's course recommendation engine. You only return valid JSON objects.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
                timeout=timeout,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
        
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        
        try:
            dict_data = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("Unexpected JSON structure")
            dict_data = json.loads(cleaned[start:end + 1])
            
        if "recommendations" in dict_data and isinstance(dict_data["recommendations"], list):
            data = dict_data["recommendations"]
        else:
            raise ValueError("Unexpected JSON structure, missing 'recommendations' key")
            
        return data
    except Exception as exc:
        raise _provider_error(config, exc) from exc
