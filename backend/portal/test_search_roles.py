from datetime import date

from rest_framework.test import APITestCase

from .models import Course, CourseCategory, Enrollment, LearningMaterial, Payment, PaymentMethodConfig, Quiz, User


class RoleAwareSearchTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="admin-search@example.com", password="Pass123!", role=User.Role.ADMIN)
        self.instructor = User.objects.create_user(email="teacher-search@example.com", password="Pass123!", role=User.Role.INSTRUCTOR)
        self.other_instructor = User.objects.create_user(email="other-search@example.com", password="Pass123!", role=User.Role.INSTRUCTOR)
        self.student = User.objects.create_user(email="student-search@example.com", password="Pass123!", role=User.Role.STUDENT, student_id="STU-SEARCH")
        self.other_student = User.objects.create_user(email="private-student@example.com", password="Pass123!", role=User.Role.STUDENT, student_id="STU-PRIVATE")
        self.category = CourseCategory.objects.create(name="Search Engineering", slug="search-engineering")
        self.owned = Course.objects.create(title="Owned Search Course", description="Instructor-owned content", category=self.category, instructor=self.instructor, status=Course.Status.DRAFT)
        self.public = Course.objects.create(title="Public Search Course", description="Published discovery content", category=self.category, instructor=self.other_instructor, status=Course.Status.PUBLISHED)
        self.private = Course.objects.create(title="Private Search Course", description="Unpublished private content", category=self.category, instructor=self.other_instructor, status=Course.Status.DRAFT)
        self.public_material = LearningMaterial.objects.create(course=self.public, title="Accessible Search Notes", material_type=LearningMaterial.MaterialType.NOTE, note_content="Visible after enrollment")
        self.private_material = LearningMaterial.objects.create(course=self.private, title="Secret Search Notes", material_type=LearningMaterial.MaterialType.NOTE, note_content="Must remain private")
        Enrollment.objects.create(student=self.student, course=self.public)
        Enrollment.objects.create(student=self.other_student, course=self.owned)
        Quiz.objects.create(course=self.public, title="Public Search Quiz", description="Enrolled quiz", is_published=True)
        self.payment_method = PaymentMethodConfig.objects.create(
            method=PaymentMethodConfig.Method.BKASH,
            display_name="Operations bKash",
            account_details="01700000000",
            account_holder="PyLearn Accounts",
        )
        self.payment = Payment.objects.create(
            student=self.other_student,
            course=self.public,
            payment_method=self.payment_method,
            method=PaymentMethodConfig.Method.BKASH,
            method_display_name=self.payment_method.display_name,
            account_details_snapshot=self.payment_method.account_details,
            account_holder_snapshot=self.payment_method.account_holder,
            sender_details="01911112222",
            transaction_id="PAY-SEARCH-001",
            course_price_snapshot="500.00",
            amount="500.00",
            payment_date=date(2026, 9, 1),
            proof="payment-proofs/test.png",
        )

    def search(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get("/api/v1/search/", params)

    def test_student_receives_only_authorized_content_and_tabs(self):
        response = self.search(self.student, q="Search", tab="all")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], User.Role.STUDENT)
        self.assertNotIn("users", response.data["available_tabs"])
        course_titles = [item["title"] for item in response.data["groups"]["courses"]["results"]]
        material_titles = [item["title"] for item in response.data["groups"]["materials"]["results"]]
        self.assertIn(self.public.title, course_titles)
        self.assertNotIn(self.private.title, course_titles)
        self.assertIn(self.public_material.title, material_titles)
        self.assertNotIn(self.private_material.title, material_titles)

    def test_instructor_sees_owned_private_content_and_scoped_students(self):
        response = self.search(self.instructor, q="Search", tab="all")
        self.assertEqual(response.status_code, 200)
        course_titles = [item["title"] for item in response.data["groups"]["courses"]["results"]]
        self.assertIn(self.owned.title, course_titles)
        self.assertNotIn(self.public.title, course_titles)
        self.assertNotIn(self.private.title, course_titles)
        students_response = self.search(self.instructor, tab="students")
        student_titles = [item["title"] for item in students_response.data["groups"]["students"]["results"]]
        self.assertIn(self.other_student.email, student_titles)
        self.assertNotIn(self.student.email, student_titles)

    def test_admin_has_full_operational_tabs_and_safe_summaries(self):
        response = self.search(self.admin, q="private-student", tab="users")
        self.assertEqual(response.status_code, 200)
        self.assertIn("payments", response.data["available_tabs"])
        self.assertIn("certificates", response.data["available_tabs"])
        result = response.data["groups"]["users"]["results"][0]
        self.assertEqual(result["subtitle"], self.other_student.email)
        self.assertNotIn("password", result)

    def test_role_cannot_request_an_unavailable_tab(self):
        response = self.search(self.student, tab="payments")
        self.assertEqual(response.status_code, 400)

    def test_entity_tab_is_paginated(self):
        response = self.search(self.admin, tab="courses", page=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["groups"]["courses"]["page_size"], 20)
        self.assertEqual(response.data["groups"]["courses"]["count"], 3)

    def test_admin_payment_search_matches_visible_fields_and_status(self):
        for query in ["private-student", "STU-PRIVATE", "0191111", "Operations bKash", "PyLearn Accounts", "500.00", "2026-09-01"]:
            response = self.search(self.admin, q=query, tab="payments", payment_status="PENDING")
            self.assertEqual(response.status_code, 200, query)
            self.assertEqual([row["id"] for row in response.data["groups"]["payments"]["results"]], [self.payment.pk], query)

    def test_admin_payment_endpoint_combines_search_status_and_method_filters(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/payments/", {"q": "private-student", "status": "PENDING", "method": "BKASH"})
        self.assertEqual(response.status_code, 200)
        rows = response.data.get("results", response.data)
        self.assertEqual([row["id"] for row in rows], [self.payment.pk])

        self.assertEqual(self.client.get("/api/v1/payments/", {"method": "CASH"}).status_code, 400)

    def test_payment_amount_search_is_independent_of_decimal_storage_format(self):
        self.client.force_authenticate(self.admin)
        for query in ["500", "500.00", "0500.00"]:
            with self.subTest(query=query):
                response = self.client.get("/api/v1/payments/", {"q": query})
                self.assertEqual(response.status_code, 200)
                rows = response.data.get("results", response.data)
                self.assertEqual([row["id"] for row in rows], [self.payment.pk])
        for query in ["NaN", "Infinity", "1e999", "not-an-amount"]:
            with self.subTest(query=query):
                self.assertEqual(self.client.get("/api/v1/payments/", {"q": query}).status_code, 200)
