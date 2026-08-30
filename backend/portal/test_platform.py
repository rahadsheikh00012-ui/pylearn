from datetime import date
from io import BytesIO
import base64
import json
from unittest.mock import patch
from django.test import override_settings
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from .models import Certificate, Course, CourseCategory, Enrollment, InstructorApplication, LearningMaterial, MaterialProgress, Payment, Quiz, QuizAttempt, User


def proof_image():
    stream = BytesIO(); Image.new("RGB", (2, 2), "white").save(stream, "PNG")
    return SimpleUploadedFile("proof.png", stream.getvalue(), content_type="image/png")


class PlatformDomainTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="AdminPass123!")
        self.student = User.objects.create_user(email="student@example.com", password="StudentPass123!", role=User.Role.STUDENT)
        self.instructor = User.objects.create_user(email="teacher@example.com", password="TeacherPass123!", role=User.Role.INSTRUCTOR)
        self.category = CourseCategory.objects.create(name="Security", slug="security")

    def test_admin_approval_creates_instructor_with_forced_password_change(self):
        application = InstructorApplication.objects.create(full_name="New Teacher", email="new@example.com", phone="01700000000", bachelor_degree="BSc", teaching_background="Lecturer")
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/instructor-applications/{application.reference}/approve/", {"password":"StrongTemp123!"}, format="json")
        self.assertEqual(response.status_code, 200)
        account = User.objects.get(email="new@example.com")
        self.assertEqual(account.role, User.Role.INSTRUCTOR)
        self.assertTrue(account.must_change_password)

    def test_paid_course_requires_approved_payment(self):
        course = Course.objects.create(title="Paid Security", description="Course", category=self.category, instructor=self.instructor, status=Course.Status.PUBLISHED, course_type=Course.CourseType.PAID, price="500.00")
        self.client.force_authenticate(self.student)
        blocked = self.client.post("/api/v1/enrollments/", {"course":course.pk}, format="json")
        self.assertEqual(blocked.status_code, 400)
        payment = Payment.objects.create(student=self.student, course=course, method="BKASH", sender_details="017", transaction_id="TX-1", amount="500.00", payment_date=date.today(), proof=proof_image())
        self.client.force_authenticate(self.admin)
        approved = self.client.post(f"/api/v1/payments/{payment.pk}/review/", {"decision":"APPROVED"}, format="json")
        self.assertEqual(approved.status_code, 200)
        self.assertTrue(Enrollment.objects.filter(student=self.student, course=course).exists())

    def test_instructor_course_queryset_is_owner_scoped(self):
        own = Course.objects.create(title="Own", description="Course", category=self.category, instructor=self.instructor)
        other_teacher = User.objects.create_user(email="other@example.com", password="OtherPass123!", role=User.Role.INSTRUCTOR)
        Course.objects.create(title="Other", description="Course", category=self.category, instructor=other_teacher)
        self.client.force_authenticate(self.instructor)
        response = self.client.get("/api/v1/courses/")
        rows = response.data.get("results", response.data)
        self.assertEqual([row["id"] for row in rows], [own.pk])

    def test_instructor_can_create_category_and_owned_course(self):
        self.client.force_authenticate(self.instructor)
        category_response = self.client.post("/api/v1/categories/", {"name": "Cloud Engineering"}, format="json")
        self.assertEqual(category_response.status_code, 201)
        course_response = self.client.post("/api/v1/courses/", {
            "title": "Cloud Fundamentals",
            "description": "Learn cloud fundamentals.",
            "category": category_response.data["id"],
            "level": Course.Level.BEGINNER,
            "status": Course.Status.DRAFT,
            "course_type": Course.CourseType.FREE,
            "duration_hours": 4,
        }, format="json")
        self.assertEqual(course_response.status_code, 201)
        course = Course.objects.get(pk=course_response.data["id"])
        self.assertEqual(course.instructor, self.instructor)
        self.assertEqual(course.created_by, self.instructor)

    def test_instructor_dashboard_loads_with_owned_course_activity(self):
        from .models import ActivityLog

        own = Course.objects.create(title="Dashboard Course", description="Course", category=self.category, instructor=self.instructor)
        ActivityLog.objects.create(actor=self.instructor, action="CREATE", entity="course", entity_id=str(own.pk), details="Created course")
        self.client.force_authenticate(self.instructor)
        response = self.client.get("/api/v1/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["statistics"]["courses"], 1)
        self.assertEqual(len(response.data["recent_activities"]), 1)

    def test_certificate_issues_after_all_materials_and_published_quizzes_pass(self):
        course = Course.objects.create(title="Free Security", description="Course", category=self.category, instructor=self.instructor, status=Course.Status.PUBLISHED)
        enrollment = Enrollment.objects.create(student=self.student, course=course)
        material = LearningMaterial.objects.create(course=course, title="Lesson", material_type="NOTE", note_content="Learn")
        MaterialProgress.objects.create(enrollment=enrollment, material=material)
        quiz = Quiz.objects.create(course=course, title="Final", is_published=True, results_published=True)
        QuizAttempt.objects.create(quiz=quiz, student=self.student, score=1, max_score=1, percentage=100, passed=True)
        self.client.force_authenticate(self.student)
        response = self.client.post(f"/api/v1/materials/{material.pk}/complete/", {"completed":True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Certificate.objects.filter(student=self.student, course=course).exists())

    @patch("portal.views.verify_firebase_id_token")
    def test_firebase_google_login_creates_student_session(self, verify_token):
        verify_token.return_value = {
            "email": "firebase@example.com",
            "email_verified": True,
            "given_name": "Fire",
            "family_name": "Base",
            "firebase": {"sign_in_provider": "google.com"},
        }
        response = self.client.post("/api/v1/auth/firebase/", {
            "id_token": "valid-token", "intent": "register", "department": "Computer Science",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        account = User.objects.get(email="firebase@example.com")
        self.assertEqual(account.role, User.Role.STUDENT)
        self.assertEqual(account.first_name, "Fire")
        self.assertEqual(account.department, "Computer Science")
        self.assertFalse(account.has_usable_password())
        self.assertEqual(int(self.client.session["_auth_user_id"]), account.pk)

    @patch("portal.views.verify_firebase_id_token")
    def test_firebase_google_login_rejects_privileged_account(self, verify_token):
        verify_token.return_value = {"email": self.instructor.email, "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}
        response = self.client.post("/api/v1/auth/firebase/", {"id_token": "valid-token"}, format="json")
        self.assertEqual(response.status_code, 403)

    @patch("portal.views.verify_firebase_id_token")
    def test_google_login_does_not_silently_create_account(self, verify_token):
        verify_token.return_value = {
            "email": "new-login@example.com",
            "email_verified": True,
            "firebase": {"sign_in_provider": "google.com"},
        }
        response = self.client.post("/api/v1/auth/firebase/", {
            "id_token": "valid-token", "intent": "login",
        }, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(User.objects.filter(email="new-login@example.com").exists())

    @override_settings(FIREBASE_SERVICE_ACCOUNT_JSON=base64.b64encode(json.dumps({
        "type": "service_account",
        "project_id": "pylearn-test",
        "private_key": "test-key",
        "client_email": "firebase@example.com",
    }).encode()).decode())
    def test_base64_firebase_service_account_is_decoded(self):
        from portal.views import firebase_service_account

        self.assertEqual(firebase_service_account()["project_id"], "pylearn-test")
