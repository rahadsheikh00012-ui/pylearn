from decimal import Decimal
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Avg, Q
from django.http import FileResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from .models import (
    AIProviderConfig, ActivityLog, Course,
    CourseCategory, EmailNotification, Enrollment, LearningMaterial, MaterialProgress,
    Question, Quiz, QuizAnswer, QuizAttempt, StudyPlan, User,
)
from .permissions import IsAdminRole
from .serializers import (
    ActivitySerializer, AdminNotificationSerializer, AdminUserSerializer,
    CategorySerializer, CourseSerializer, EnrollmentSerializer, file_url,
    MaterialSerializer, NotificationSerializer, QuestionAttemptSerializer,
    QuizAttemptSerializer, QuizReadSerializer, QuizSerializer, RegistrationSerializer, StudyPlanSerializer,
    UserSerializer,
)
from .services import (
    AIProviderError, encrypt_key, generate_study_plan, log_activity, masked_key, normalize_ai_model, queue_email,
    retry_email, generate_assessment_recommendations,
)
from .throttles import AuthRateThrottle, PasswordResetRateThrottle
from .advisor.analysis import analyze_attempt


def is_admin(user):
    return user.is_authenticated and user.role == User.Role.ADMIN


def initial_assessment_recommendations(request, attempt):
    answers = list(
        attempt.answers.select_related("question").order_by("question__order", "question_id")
    )
    correct_topics = [
        answer.question.topic.strip()
        for answer in answers
        if answer.is_correct and answer.question.topic and answer.question.topic.strip()
    ]

    performance = {
        "score": str(attempt.score),
        "max_score": str(attempt.max_score),
        "percentage": str(attempt.percentage),
        "passed": attempt.passed,
        "answers": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
                "is_correct": answer.is_correct,
            }
            for answer in answers
        ],
        "correct": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
            }
            for answer in answers
            if answer.is_correct
        ],
        "incorrect": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
            }
            for answer in answers
            if not answer.is_correct
        ],
    }

    available = (
        Course.objects.filter(status=Course.Status.PUBLISHED)
        .exclude(enrollments__student=request.user)
        .select_related("category")
        .prefetch_related("materials", "enrollments")
        .distinct()
    )
    available_courses = [
        {
            "id": course.pk,
            "title": course.title,
            "description": course.description,
            "category": course.category.name if course.category else "",
            "level": course.level,
        }
        for course in available
    ]
    courses_by_id = {course.pk: course for course in available}

    try:
        raw_recommendations = generate_assessment_recommendations(request.user, performance, available_courses)
    except Exception:
        raw_recommendations = []

    recommendations = []
    for rec in raw_recommendations:
        if not isinstance(rec, dict):
            continue
        try:
            course_id = int(rec.get("course_id"))
        except (TypeError, ValueError):
            continue
        if course_id not in courses_by_id:
            continue
        recommendations.append({
            "course_id": course_id,
            "reason": str(rec.get("reason") or "Best match for your initial assessment results.")[:500],
        })
        break

    attempt.recommended_courses = recommendations
    attempt.save(update_fields=["recommended_courses", "updated_at"])

    rec_courses_data = []
    for rec in recommendations:
        course_id = rec.get("course_id")
        if course_id in courses_by_id:
            course_data = CourseSerializer(courses_by_id[course_id], context={"request": request}).data
            course_data["recommendation_reason"] = rec.get("reason")
            rec_courses_data.append(course_data)

    return correct_topics, rec_courses_data


@api_view(["GET"])
@permission_classes([AllowAny])
def question_type_choices(request):
    return Response([
        {"value": value, "label": label}
        for value, label in Question.QuestionType.choices
    ])


def schedule_item_title(item):
    return str(item.get("topic") or item.get("title") or item.get("task") or "Study session").strip()


def schedule_entries(schedule):
    for position, item in enumerate(schedule):
        if not isinstance(item, dict):
            continue
        tasks = item.get("tasks")
        if not isinstance(tasks, list):
            yield [position], item
            continue
        for task_position, task in enumerate(tasks):
            if not isinstance(task, dict):
                continue
            yield [position, task_position], {
                **task,
                "day": task.get("day") or item.get("day"),
                "date": task.get("date") or item.get("date"),
            }


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request, user)
    log_activity(user, "REGISTER", "user", user.pk, "Student registered")
    return Response({"user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login_view(request):
    user = authenticate(request, username=str(request.data.get("email", "")).lower(), password=request.data.get("password"))
    if not user:
        return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)
    login(request, user)
    log_activity(user, "LOGIN", "session", details="User signed in")
    return Response({"user": UserSerializer(user).data})


@api_view(["POST"])
def logout_view(request):
    actor = request.user
    logout(request)
    log_activity(actor, "LOGOUT", "session", details="User signed out")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def me(request):
    if not request.user.is_authenticated:
        if request.method == "GET":
            return Response({"user": None})
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, "UPDATE", "profile", request.user.pk, "Profile updated")
    if request.method == "DELETE":
        log_activity(request.user, "DELETE", "account", request.user.pk, "User requested account deletion")
        request.user.delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({"user": UserSerializer(request.user).data})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_request(request):
    user = User.objects.filter(email=str(request.data.get("email", "")).lower(), is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        queue_email(user, "PASSWORD_RESET", "Reset your PyLearn password", f"Use this link to reset your password: {link}")
    return Response({"detail": "If the account exists, reset instructions have been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_confirm(request):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get("uid", ""))))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return Response({"detail": "Invalid reset link."}, status=status.HTTP_400_BAD_REQUEST)
    if not default_token_generator.check_token(user, request.data.get("token", "")):
        return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)
    password = request.data.get("password", "")
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"detail": "Password updated."})


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminRole]
    serializer_class = AdminUserSerializer
    queryset = User.objects.all().order_by("-date_joined")
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def perform_update(self, serializer):
        old_active = serializer.instance.is_active
        user = serializer.save()
        log_activity(self.request.user, "UPDATE", "user", user.pk, f"Updated {user.email}")
        if old_active != user.is_active:
            queue_email(user, "ACCOUNT_STATUS", "Your PyLearn account status changed", f"Your account is now {'active' if user.is_active else 'inactive'}.")

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("You cannot delete your own account.")
        log_activity(self.request.user, "DELETE", "user", instance.pk, instance.email)
        instance.delete()


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = CourseCategory.objects.all().order_by("name")
    serializer_class = CategorySerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve"] else [IsAdminRole()]


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer

    def get_queryset(self):
        qs = Course.objects.select_related("category").prefetch_related("materials", "enrollments")
        if not is_admin(self.request.user):
            qs = qs.filter(status=Course.Status.PUBLISHED)
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        if category:
            qs = qs.filter(category_id=category)
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        return qs.order_by("-created_at")

    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve"] else [IsAdminRole()]

    def perform_create(self, serializer):
        course = serializer.save()
        log_activity(self.request.user, "CREATE", "course", course.pk, course.title)

    def perform_update(self, serializer):
        course = serializer.save()
        log_activity(self.request.user, "UPDATE", "course", course.pk, course.title)


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_scope = "uploads"

    def get_queryset(self):
        qs = LearningMaterial.objects.select_related("course")
        if not is_admin(self.request.user):
            qs = qs.filter(course__status=Course.Status.PUBLISHED, course__enrollments__student=self.request.user)
        course = self.request.query_params.get("course")
        return qs.filter(course_id=course) if course else qs

    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve", "download", "complete"] else [IsAdminRole()]

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        material = self.get_object()
        if not material.file:
            return Response({"detail": "This material has no downloadable file."}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(material.file.open("rb"), as_attachment=True, filename=material.file.name.rsplit("/", 1)[-1])

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        if is_admin(request.user):
            return Response({"detail": "Only Students track material completion."}, status=status.HTTP_403_FORBIDDEN)
        material = self.get_object()
        enrollment = get_object_or_404(Enrollment, student=request.user, course=material.course)
        progress, created = MaterialProgress.objects.get_or_create(enrollment=enrollment, material=material)
        if request.data.get("completed") is False:
            progress.delete()
        return Response({"completed": created or request.data.get("completed") is not False})


class EnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = EnrollmentSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = Enrollment.objects.select_related("student", "course", "course__category").prefetch_related("course__materials", "course__enrollments", "material_progress")
        return qs if is_admin(self.request.user) else qs.filter(student=self.request.user)

    def perform_create(self, serializer):
        if is_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only Students enroll themselves.")
        course = serializer.validated_data["course"]
        if course.status != Course.Status.PUBLISHED:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Only published courses are available.")
        enrollment = serializer.save(student=self.request.user)
        log_activity(self.request.user, "ENROLL", "course", course.pk, course.title)
        queue_email(self.request.user, "ENROLLMENT", "Course enrollment confirmed", f"You enrolled in {course.title}.")


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer if self.action in ["create", "update", "partial_update"] else QuizReadSerializer

    def get_queryset(self):
        qs = Quiz.objects.select_related("course").prefetch_related("questions")
        if not is_admin(self.request.user):
            qs = qs.filter(
                Q(is_initial_assessment=True) | Q(quiz_type=Quiz.QuizType.SKILL_DEVELOPMENT) | Q(course__enrollments__student=self.request.user),
                is_published=True,
            ).distinct()
        return qs.order_by("-created_at")

    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve", "attempt", "results"] else [IsAdminRole()]

    def create(self, request, *args, **kwargs):
        serializer = QuizSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quiz = serializer.save()
        return Response(QuizReadSerializer(quiz, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        quiz = self.get_object()
        if quiz.results_published:
            raise ValidationError("Published quiz results lock this quiz from editing.")
        serializer = QuizSerializer(quiz, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        quiz = serializer.save()
        return Response(QuizReadSerializer(quiz, context={"request": request}).data)

    def retrieve(self, request, *args, **kwargs):
        quiz = self.get_object()
        if is_admin(request.user):
            return Response(QuizReadSerializer(quiz, context={"request": request}).data)
        data = QuizReadSerializer(quiz, context={"request": request}).data
        data["questions"] = QuestionAttemptSerializer(quiz.questions.all(), many=True).data
        return Response(data)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if not is_admin(request.user):
            rows = response.data.get("results", []) if isinstance(response.data, dict) else response.data
            for row, quiz in zip(rows, self.filter_queryset(self.get_queryset())):
                row["questions"] = QuestionAttemptSerializer(quiz.questions.all(), many=True).data
        return response

    @action(detail=True, methods=["post"])
    def attempt(self, request, pk=None):
        quiz = self.get_object()
        if is_admin(request.user):
            return Response({"detail": "Only Students submit quiz attempts."}, status=status.HTTP_403_FORBIDDEN)
        is_advisor = quiz.is_initial_assessment or quiz.quiz_type == Quiz.QuizType.SKILL_DEVELOPMENT
        if not is_advisor:
            get_object_or_404(Enrollment, student=request.user, course=quiz.course)
        if quiz.attempts.filter(student=request.user).exists():
            return Response({"detail": "You have already attempted this quiz."}, status=status.HTTP_400_BAD_REQUEST)
        submitted = request.data.get("answers", {})
        with transaction.atomic():
            attempt = QuizAttempt.objects.create(quiz=quiz, student=request.user, analysis_status=QuizAttempt.AnalysisStatus.SUBMITTED if is_advisor else QuizAttempt.AnalysisStatus.NOT_REQUIRED)
            score, maximum = Decimal("0"), Decimal("0")
            for question in quiz.questions.all():
                answer = str(submitted.get(str(question.pk), submitted.get(question.pk, ""))).strip()

                maximum += Decimal(question.points)
                if question.question_type == Question.QuestionType.LONG_ANSWER:
                    QuizAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=False, awarded_points=Decimal("0"))
                    continue

                if question.question_type in [Question.QuestionType.MULTIPLE_CHOICE, Question.QuestionType.SHORT_ANSWER]:
                    normalized_answer = " ".join(answer.split()).casefold()
                    allowed_answers = [" ".join(item.split()).casefold() for item in str(question.correct_answer).split("|") if item.strip()]
                    correct = normalized_answer in allowed_answers
                elif question.question_type == Question.QuestionType.TRUE_FALSE:
                    correct = answer.casefold() == str(question.correct_answer or "").strip().casefold()
                else:
                    correct = answer.casefold() == question.correct_answer.strip().casefold()

                points = Decimal(question.points if correct else 0)
                score += points
                QuizAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=correct, awarded_points=points)

            percentage = (score / maximum * 100).quantize(Decimal("0.01")) if maximum else Decimal("0")
            attempt.score, attempt.max_score, attempt.percentage = score, maximum, percentage
            attempt.passed = percentage >= quiz.passing_score
            attempt.save(update_fields=["score", "max_score", "percentage", "passed", "updated_at"])
        if is_advisor:
            try:
                analyze_attempt(attempt.pk, request.user)
            except Exception:
                # The analysis service stores a safe failure state. The attempt
                # remains available for an Admin to retry after configuration.
                pass
            attempt.refresh_from_db()
            data = QuizAttemptSerializer(attempt).data
        else:
            data = QuizAttemptSerializer(attempt).data
            detailed_results = {}
            for ans in attempt.answers.all():
                detailed_results[str(ans.question_id)] = {
                    "is_correct": ans.is_correct,
                    "correct_answer": ans.question.correct_answer,
                    "submitted_answer": ans.answer
                }
            data["detailed_results"] = detailed_results
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reveal_answers(self, request, pk=None):
        quiz = self.get_object()
        password = request.data.get("password", "")
        user = authenticate(request, username=request.user.email, password=password)
        if user is None or user.pk != request.user.pk or not is_admin(user):
            return Response({"detail": "Admin password is required to reveal answers."}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            "questions": [
                {"id": question.pk, "correct_answer": question.correct_answer}
                for question in quiz.questions.all()
            ]
        })

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        quiz = self.get_object()
        qs = quiz.attempts.select_related("student")
        if not is_admin(request.user):
            if not quiz.results_published:
                return Response({"detail": "Results have not been published."}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(student=request.user)
        return Response(QuizAttemptSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def publish_results(self, request, pk=None):
        quiz = self.get_object()
        if quiz.is_initial_assessment or quiz.quiz_type != Quiz.QuizType.COURSE:
            return Response({"detail": "Advisor results are reviewed and published per attempt."}, status=status.HTTP_400_BAD_REQUEST)
        quiz.results_published = True
        quiz.save(update_fields=["results_published", "updated_at"])
        for attempt in quiz.attempts.select_related("student"):
            queue_email(attempt.student, "QUIZ_RESULT", f"Quiz result published: {quiz.title}", f"Your score is {attempt.percentage}%.")
        return Response(QuizReadSerializer(quiz, context={"request": request}).data)


class SearchView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        category = request.query_params.get("category")
        courses = Course.objects.filter(status=Course.Status.PUBLISHED).prefetch_related("materials", "enrollments")
        materials = LearningMaterial.objects.filter(course__status=Course.Status.PUBLISHED)
        if not is_admin(request.user):
            materials = materials.filter(course__enrollments__student=request.user)
        if category:
            courses = courses.filter(category_id=category)
            materials = materials.filter(course__category_id=category)
        if query:
            normalized_query = "".join(ch for ch in query.upper() if ch.isalnum())

            def acronym(value):
                return "".join(word[0] for word in value.split() if word).upper()

            def course_matches(course):
                searchable = " ".join([
                    course.title,
                    course.description,
                    course.category.name,
                    course.course_code or "",
                ]).lower()
                normalized_code = "".join(ch for ch in (course.course_code or "").upper() if ch.isalnum())
                return (
                    query.lower() in searchable
                    or normalized_query in normalized_code
                    or normalized_code.startswith(normalized_query)
                    or acronym(course.title).startswith(normalized_query)
                )

            matched_courses = [course for course in courses.select_related("category") if course_matches(course)]
            matched_course_ids = [course.pk for course in matched_courses]
            material_query = Q(title__icontains=query) | Q(note_content__icontains=query) | Q(course__title__icontains=query) | Q(course__course_code__icontains=query)
            materials = materials.filter(material_query | Q(course_id__in=matched_course_ids))
            courses = matched_courses
        else:
            courses = courses[:25]
        return Response({
            "courses": CourseSerializer(courses[:25], many=True, context={"request": request}).data,
            "materials": MaterialSerializer(materials[:25], many=True, context={"request": request}).data,
        })


def progress_payload(student):
    enrollments = Enrollment.objects.filter(student=student).select_related("course").prefetch_related("course__materials", "material_progress")
    quiz_attempts = (
        QuizAttempt.objects.filter(student=student, quiz__results_published=True)
        .select_related("quiz", "quiz__course")
        .prefetch_related("answers__question")
    )
    courses = []
    for enrollment in enrollments:
        total = enrollment.course.materials.count()
        completed = enrollment.material_progress.count()
        courses.append({
            "course_id": enrollment.course_id,
            "course_code": enrollment.course.course_code,
            "title": enrollment.course.title,
            "completed_materials": completed,
            "total_materials": total,
            "completion": round(completed / total * 100, 2) if total else 0,
        })
    weak_topics = []
    for attempt in quiz_attempts.order_by("-completed_at", "-id"):
        incorrect_answers = [
            answer
            for answer in attempt.answers.all()
            if not answer.is_correct
        ]
        if not incorrect_answers:
            continue
        weak_topics.append({
            "attempt_id": attempt.pk,
            "quiz_id": attempt.quiz_id,
            "quiz_title": attempt.quiz.title,
            "course_title": attempt.quiz.course.title if attempt.quiz.course_id else "",
            "incorrect_count": len(incorrect_answers),
            "questions": [
                {
                    "question_id": answer.question_id,
                    "prompt": answer.question.prompt,
                    "topic": answer.question.topic,
                    "submitted_answer": answer.answer,
                    "correct_answer": answer.question.correct_answer,
                }
                for answer in incorrect_answers
            ],
        })
        if len(weak_topics) >= 10:
            break
    return {
        "student": UserSerializer(student).data,
        "courses": courses,
        "quiz_average": round(quiz_attempts.aggregate(value=Avg("percentage"))["value"] or 0),
        "weak_topics": weak_topics,
    }


def student_dashboard_payload(request):
    enrollments = (
        Enrollment.objects.filter(student=request.user)
        .select_related("course__category")
        .prefetch_related("course__materials", "material_progress")
        .order_by("-enrolled_at")
    )
    courses = []
    completed_materials = 0
    for enrollment in enrollments:
        materials = list(enrollment.course.materials.all())
        completed = len(enrollment.material_progress.all())
        total = len(materials)
        completed_materials += completed
        thumbnail = file_url(enrollment.course.thumbnail) or ""
        if thumbnail.startswith("/"):
            thumbnail = request.build_absolute_uri(thumbnail)
        courses.append({
            "course_id": enrollment.course_id,
            "course_code": enrollment.course.course_code,
            "title": enrollment.course.title,
            "description": enrollment.course.description,
            "category": enrollment.course.category.name,
            "level": enrollment.course.get_level_display(),
            "thumbnail": thumbnail,
            "completed_materials": completed,
            "total_materials": total,
            "completion": round(completed / total * 100, 2) if total else 0,
        })

    published_attempts = QuizAttempt.objects.filter(
        student=request.user,
        quiz__results_published=True,
    )
    quiz_average = round(published_attempts.aggregate(value=Avg("percentage"))["value"] or 0)
    recent_results = [
        {
            "id": attempt.pk,
            "quiz_id": attempt.quiz_id,
            "quiz_title": attempt.quiz.title,
            "course_title": attempt.quiz.course.title,
            "percentage": attempt.percentage,
            "passed": attempt.passed,
            "completed_at": attempt.completed_at,
        }
        for attempt in published_attempts.select_related("quiz__course").order_by("-completed_at")[:3]
    ]

    latest_plan = StudyPlan.objects.filter(student=request.user).order_by("-created_at").first()
    today = timezone.localdate()
    today_labels = {
        today.isoformat().casefold(),
        today.strftime("%A").casefold(),
        today.strftime("%a").casefold(),
    }
    today_tasks = []
    if latest_plan:
        for path, item in schedule_entries(latest_plan.schedule):
            task_day = str(item.get("date") or item.get("day") or "").strip().casefold()
            if task_day not in today_labels:
                continue
            today_tasks.append({
                "id": ".".join(str(value) for value in path),
                "title": schedule_item_title(item),
                "minutes": item.get("minutes"),
                "day": item.get("day") or item.get("date") or today.strftime("%A"),
                "completed": item.get("completed") is True,
            })

    return {
        "statistics": {
            "enrolled_courses": len(courses),
            "completed_materials": completed_materials,
            "quiz_average": quiz_average,
            "today_tasks": len(today_tasks),
        },
        "courses": courses,
        "today_study_plan": {
            "summary": latest_plan.summary,
            "tasks": today_tasks,
            "created_at": latest_plan.created_at,
        } if latest_plan else None,
        "recent_results": recent_results,
    }


class ProgressView(APIView):
    def get(self, request):
        if is_admin(request.user) and request.query_params.get("student"):
            student = get_object_or_404(User, pk=request.query_params["student"], role=User.Role.STUDENT)
        else:
            student = request.user
        return Response(progress_payload(student))


class DashboardView(APIView):
    def get(self, request):
        if not is_admin(request.user):
            return Response(student_dashboard_payload(request))
        return Response({
            "statistics": {
                "users": User.objects.count(), "students": User.objects.filter(role=User.Role.STUDENT).count(),
                "courses": Course.objects.count(), "enrollments": Enrollment.objects.count(),
                "quizzes": Quiz.objects.count(),
            },
            "recent_activities": ActivitySerializer(ActivityLog.objects.select_related("actor")[:20], many=True).data,
        })


class AIConfigView(APIView):
    permission_classes = [IsAdminRole]
    throttle_scope = "ai"

    def get(self, request):
        config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if not config:
            return Response(None)
        return Response({"id": config.pk, "provider": config.provider, "model": config.model, "base_url": config.base_url, "api_key": masked_key(config), "is_active": config.is_active})

    def post(self, request):
        provider = request.data.get("provider")
        if provider not in AIProviderConfig.Provider.values:
            return Response({"detail": "Unsupported AI provider."}, status=status.HTTP_400_BAD_REQUEST)
        active_config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        api_key = str(request.data.get("api_key", "")).strip()
        model = normalize_ai_model(provider, request.data.get("model", ""))
        if not api_key and not active_config:
            return Response({"detail": "API key is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not model:
            return Response({"detail": "Model is required."}, status=status.HTTP_400_BAD_REQUEST)
        base_url = str(request.data.get("base_url", "")).strip()
        if provider == AIProviderConfig.Provider.GENERIC and not base_url:
            return Response({"detail": "A base URL is required for a generic provider."}, status=status.HTTP_400_BAD_REQUEST)
        if api_key:
            try:
                encrypted_key = encrypt_key(api_key)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        else:
            encrypted_key = active_config.encrypted_api_key

        if active_config:
            active_config.provider = provider
            active_config.model = model
            active_config.base_url = base_url
            active_config.encrypted_api_key = encrypted_key
            active_config.is_active = True
            active_config.save(update_fields=["provider", "model", "base_url", "encrypted_api_key", "is_active", "updated_at"])
            config = active_config
            response_status = status.HTTP_200_OK
        else:
            AIProviderConfig.objects.update(is_active=False)
            config = AIProviderConfig.objects.create(
                provider=provider, model=model, base_url=base_url, encrypted_api_key=encrypted_key, is_active=True
            )
            response_status = status.HTTP_201_CREATED
        log_activity(request.user, "CONFIGURE", "ai_provider", config.pk, provider)
        return Response(
            {"id": config.pk, "provider": provider, "model": config.model, "base_url": config.base_url, "api_key": masked_key(config), "is_active": True},
            status=response_status,
        )


class StudyPlanView(APIView):
    throttle_scope = "ai"
    def get(self, request):
        return Response(StudyPlanSerializer(StudyPlan.objects.filter(student=request.user).order_by("-created_at")[:10], many=True).data)

    def post(self, request, plan_id=None):
        if plan_id is not None:
            return self.complete_schedule_item(request, plan_id)
        if is_admin(request.user):
            return Response({"detail": "Only Students generate study plans."}, status=status.HTTP_403_FORBIDDEN)
        has_enrollment = Enrollment.objects.filter(student=request.user).exists()
        has_course_quiz_attempt = QuizAttempt.objects.filter(
            student=request.user,
            quiz__is_initial_assessment=False,
        ).exists()
        missing_requirements = []
        if not has_enrollment:
            missing_requirements.append("Enroll in at least one course.")
        if not has_course_quiz_attempt:
            missing_requirements.append("Complete at least one course quiz.")
        if missing_requirements:
            return Response(
                {
                    "detail": "AI study plan needs course activity first: " + " ".join(missing_requirements),
                    "requirements": missing_requirements,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        performance = progress_payload(request.user)
        performance["quiz_results"] = list(QuizAttempt.objects.filter(student=request.user, quiz__results_published=True).values("quiz__title", "percentage", "passed"))
        try:
            plan = generate_study_plan(request.user, performance)
        except (AIProviderError, ValueError) as exc:
            return Response({"detail": f"Study plan is unavailable: {exc}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            return Response({"detail": "Study plan is unavailable: the provider request failed."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        queue_email(request.user, "STUDY_PLAN", "Your PyLearn study plan is ready", plan.summary)
        return Response(StudyPlanSerializer(plan).data, status=status.HTTP_201_CREATED)

    def delete(self, request, plan_id=None):
        plans = StudyPlan.objects.filter(student=request.user)
        if plan_id is not None:
            plan = get_object_or_404(plans, pk=plan_id)
            log_activity(request.user, "DELETE", "study_plan", plan.pk, "Deleted study plan")
            plan.delete()
        else:
            count = plans.count()
            plans.delete()
            log_activity(request.user, "DELETE", "study_plan", "", f"Cleared {count} study plans")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def complete_schedule_item(self, request, plan_id):
        if is_admin(request.user):
            return Response({"detail": "Only Students update study-plan progress."}, status=status.HTTP_403_FORBIDDEN)
        plan = get_object_or_404(StudyPlan.objects.filter(student=request.user), pk=plan_id)
        item_path = request.data.get("path")
        if (
            not isinstance(item_path, list)
            or len(item_path) not in [1, 2]
            or not all(isinstance(value, int) for value in item_path)
        ):
            return Response({"detail": "A schedule item path is required."}, status=status.HTTP_400_BAD_REQUEST)

        schedule = list(plan.schedule)
        try:
            if len(item_path) == 1:
                item = schedule[item_path[0]]
            else:
                item = schedule[item_path[0]].get("tasks")[item_path[1]]
        except (IndexError, TypeError, AttributeError):
            return Response({"detail": "Schedule item was not found."}, status=status.HTTP_404_NOT_FOUND)
        if not isinstance(item, dict):
            return Response({"detail": "Schedule item cannot be completed."}, status=status.HTTP_400_BAD_REQUEST)

        item["completed"] = request.data.get("completed") is not False
        plan.schedule = schedule
        plan.save(update_fields=["schedule", "updated_at"])
        log_activity(request.user, "UPDATE", "study_plan", plan.pk, "Updated study-plan task completion")
        return Response({
            "path": item_path,
            "completed": item["completed"],
            "schedule": plan.schedule,
        })


class NotificationView(APIView):
    def get(self, request):
        qs = EmailNotification.objects.filter(recipient=request.user)
        return Response(NotificationSerializer(qs, many=True).data)


class AdminNotificationView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(AdminNotificationSerializer(EmailNotification.objects.select_related("recipient")[:200], many=True).data)

    def post(self, request, notification_id):
        record = get_object_or_404(EmailNotification, pk=notification_id, status=EmailNotification.Status.FAILED)
        retry_email(record)
        return Response(AdminNotificationSerializer(record).data)
