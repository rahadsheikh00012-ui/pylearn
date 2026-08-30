import json
from decimal import Decimal
from urllib.parse import quote

import httpx
from django.db import transaction
from django.utils import timezone

from ..models import AIProviderConfig, Course, QuizAnswer, QuizAttempt
from ..services import decrypt_key
from .models import AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, LearningField


def level_for(percentage):
    value = Decimal(str(percentage))
    if value >= 80:
        return AdvisorAnalysis.Level.ADVANCED
    if value >= 50:
        return AdvisorAnalysis.Level.INTERMEDIATE
    return AdvisorAnalysis.Level.BEGINNER


def _provider_json(prompt):
    config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
    if not config:
        raise ValueError("An Admin must configure an active AI provider.")
    key = decrypt_key(config.encrypted_api_key)
    timeout = httpx.Timeout(45.0)
    if config.provider == AIProviderConfig.Provider.GEMINI:
        url = config.base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{quote(config.model)}:generateContent"
        response = httpx.post(url, params={"key": key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=timeout)
        response.raise_for_status()
        raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    else:
        base = config.base_url or "https://api.openai.com/v1"
        response = httpx.post(f"{base.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": config.model, "messages": [{"role": "system", "content": "You grade PyLearn advisor assessments. Return one valid JSON object only."}, {"role": "user", "content": prompt}], "temperature": 0.1, "response_format": {"type": "json_object"}}, timeout=timeout)
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


def _payload(attempt):
    answers = list(attempt.answers.select_related("question", "question__learning_field", "question__advisor_skill"))
    courses = Course.objects.filter(status=Course.Status.PUBLISHED).exclude(enrollments__student=attempt.student).prefetch_related("advisor_skill_mappings__skill")
    fields = LearningField.objects.filter(is_active=True).prefetch_related("skills")
    return {
        "quiz": {"id": attempt.quiz_id, "type": attempt.quiz.quiz_type, "target_field_id": attempt.quiz.target_field_id},
        "learning_fields": [{"field_id": f.id, "name": f.name, "skills": [{"skill_id": s.id, "name": s.name} for s in f.skills.filter(is_active=True)]} for f in fields],
        "answers": [{"answer_id": a.id, "question": a.question.prompt, "type": a.question.question_type, "answer": a.answer, "correct_answer": a.question.correct_answer, "rubric": a.question.grading_rubric, "max_points": a.question.points, "objective_correct": a.is_correct, "field_id": a.question.learning_field_id, "skill_id": a.question.advisor_skill_id} for a in answers],
        "courses": [{"course_id": c.id, "title": c.title, "level": c.level, "skills": [m.skill_id for m in c.advisor_skill_mappings.all()]} for c in courses],
    }


def analyze_attempt(attempt_id, actor):
    with transaction.atomic():
        attempt = QuizAttempt.objects.select_for_update().select_related("quiz", "student").get(pk=attempt_id)
        if attempt.quiz.quiz_type == attempt.quiz.QuizType.COURSE:
            raise ValueError("Course quizzes do not use Advisor analysis.")
        if attempt.analysis_status == QuizAttempt.AnalysisStatus.ANALYZING:
            raise ValueError("This attempt is already being analyzed.")
        attempt.analysis_status = QuizAttempt.AnalysisStatus.ANALYZING
        attempt.analysis_error = ""
        attempt.save(update_fields=["analysis_status", "analysis_error", "updated_at"])
    prompt = "Analyze the complete Advisor attempt below. Grade SHORT_ANSWER and LONG_ANSWER items. Return keys answer_grades (answer_id, awarded_points, feedback), summary, strongest_field_id, strongest_skill_ids, field_scores, strengths, gaps, recommendations (course_id, match_type ADVANCED|EXACT_MATCH|BEST_RELATED, reason). Use only supplied IDs.\n" + json.dumps(_payload(attempt), default=str)
    try:
        data = _provider_json(prompt)
        with transaction.atomic():
            attempt = QuizAttempt.objects.select_for_update().select_related("quiz").get(pk=attempt_id)
            answers = {a.id: a for a in attempt.answers.select_related("question")}
            for grade in data.get("answer_grades", []):
                answer = answers.get(int(grade.get("answer_id", 0)))
                if not answer or answer.question.question_type not in {answer.question.QuestionType.SHORT_ANSWER, answer.question.QuestionType.LONG_ANSWER}:
                    continue
                awarded = max(Decimal("0"), min(Decimal(str(grade.get("awarded_points", 0))), Decimal(answer.question.points)))
                answer.awarded_points = awarded
                answer.ai_feedback = str(grade.get("feedback", ""))[:2000]
                answer.save(update_fields=["awarded_points", "ai_feedback"])
            score = sum((a.awarded_points for a in attempt.answers.all()), Decimal("0"))
            maximum = sum((Decimal(a.question.points) for a in attempt.answers.select_related("question")), Decimal("0"))
            percentage = (score / maximum * 100).quantize(Decimal("0.01")) if maximum else Decimal("0")
            strongest_id = data.get("strongest_field_id")
            strongest = LearningField.objects.filter(pk=strongest_id).first() if strongest_id else None
            reviewer = actor if getattr(actor, "role", None) == "ADMIN" else None
            analysis, _ = AdvisorAnalysis.objects.update_or_create(attempt=attempt, defaults={"summary": str(data.get("summary", "")), "strongest_field": strongest, "strongest_skills": data.get("strongest_skill_ids", []), "field_scores": data.get("field_scores", []), "strengths": data.get("strengths", []), "gaps": data.get("gaps", []), "level": level_for(percentage), "ai_payload": data, "reviewed_by": reviewer})
            analysis.recommendations.all().delete()
            eligible = {c.id: c for c in Course.objects.filter(status=Course.Status.PUBLISHED).exclude(enrollments__student=attempt.student).prefetch_related("advisor_skill_mappings")}
            gap_skill_ids = {int(g["skill_id"]) for g in data.get("gaps", []) if isinstance(g, dict) and str(g.get("skill_id", "")).isdigit()}
            exact_available = any(gap_skill_ids.intersection({m.skill_id for m in c.advisor_skill_mappings.all()}) for c in eligible.values())
            for rec in data.get("recommendations", []):
                course = eligible.get(int(rec.get("course_id", 0)))
                kind = rec.get("match_type")
                covered = {m.skill_id for m in course.advisor_skill_mappings.all()} if course else set()
                valid = bool(course and kind in AdvisorRecommendation.MatchType.values)
                if kind == AdvisorRecommendation.MatchType.ADVANCED:
                    valid = valid and course.level == Course.Level.ADVANCED
                if attempt.quiz.quiz_type == attempt.quiz.QuizType.SKILL_DEVELOPMENT and kind == AdvisorRecommendation.MatchType.EXACT_MATCH:
                    valid = valid and bool(gap_skill_ids.intersection(covered))
                if attempt.quiz.quiz_type == attempt.quiz.QuizType.SKILL_DEVELOPMENT and kind == AdvisorRecommendation.MatchType.BEST_RELATED:
                    valid = valid and not exact_available
                if valid:
                    AdvisorRecommendation.objects.create(analysis=analysis, course=course, match_type=kind, reason=str(rec.get("reason", ""))[:2000])
            attempt.score, attempt.max_score, attempt.percentage = score, maximum, percentage
            attempt.passed = percentage >= attempt.quiz.passing_score
            attempt.analysis_status = QuizAttempt.AnalysisStatus.DRAFT_READY
            attempt.analyzed_at = timezone.now()
            attempt.save(update_fields=["score", "max_score", "percentage", "passed", "analysis_status", "analyzed_at", "updated_at"])
            AdvisorAuditLog.objects.create(analysis=analysis, actor=actor, action="AI_ANALYZED", changes={"result": data})
            return analysis
    except Exception as exc:
        QuizAttempt.objects.filter(pk=attempt_id).update(analysis_status=QuizAttempt.AnalysisStatus.ANALYSIS_FAILED, analysis_error=str(exc)[:2000])
        raise
