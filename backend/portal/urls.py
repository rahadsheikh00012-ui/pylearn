from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AIConfigView, AdminNotificationView, CategoryViewSet,
    CourseViewSet, DashboardView, EnrollmentViewSet, MaterialViewSet,
    NotificationView, ProgressView, QuizViewSet, SearchView,
    UserViewSet, InstructorApplicationViewSet, PaymentMethodConfigViewSet,
    PaymentViewSet, CertificateViewSet, csrf, login_view, logout_view, me, password_reset_confirm,
    password_reset_request, question_type_choices, register, change_password, verify_certificate,
    firebase_login,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("categories", CategoryViewSet, basename="category")
router.register("courses", CourseViewSet, basename="course")
router.register("materials", MaterialViewSet, basename="material")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")
router.register("quizzes", QuizViewSet, basename="quiz")
router.register("instructor-applications", InstructorApplicationViewSet, basename="instructor-application")
router.register("payment-methods", PaymentMethodConfigViewSet, basename="payment-method")
router.register("payments", PaymentViewSet, basename="payment")
router.register("certificates", CertificateViewSet, basename="certificate")

urlpatterns = [
    path("advisor/", include("portal.advisor.urls")),
    path("auth/csrf/", csrf),
    path("auth/register/", register),
    path("auth/login/", login_view),
    path("auth/logout/", logout_view),
    path("auth/me/", me),
    path("auth/password-reset/", password_reset_request),
    path("auth/password-reset/confirm/", password_reset_confirm),
    path("auth/change-password/", change_password),
    path("auth/firebase/", firebase_login),
    path("question-types/", question_type_choices),
    path("certificates/verify/<str:verification_number>/", verify_certificate),
    path("search/", SearchView.as_view()),
    path("progress/", ProgressView.as_view()),
    path("dashboard/", DashboardView.as_view()),
    path("ai/config/", AIConfigView.as_view()),
    path("notifications/", NotificationView.as_view()),
    path("notifications/admin/", AdminNotificationView.as_view()),
    path("notifications/admin/<int:notification_id>/retry/", AdminNotificationView.as_view()),
    path("", include(router.urls)),
]
