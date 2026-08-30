from io import BytesIO

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw

from portal.models import (
    AIProviderConfig, ActivityLog, Course,
    CourseCategory, EmailNotification, Enrollment, LearningMaterial,
    MaterialProgress, Question, Quiz, QuizAnswer, QuizAttempt, User,
    AdvisorAnalysis, AdvisorRecommendation, AdvisorSkill, CourseSkill, LearningField,
)
from portal.services import encrypt_key


def png_file(label, color, size=(1200, 675)):
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((55, 55, size[0] - 55, size[1] - 55), radius=36, outline="white", width=5)
    draw.text((95, size[1] // 2 - 30), label, fill="white", stroke_width=1)
    output = BytesIO()
    image.save(output, format="PNG")
    return ContentFile(output.getvalue())


def minimal_pdf(title):
    text = title.replace("(", "[").replace(")", "]")
    stream = f"BT /F1 18 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n",
        b"4 0 obj << /Length " + str(len(stream)).encode() + b" >> stream\n" + stream + b"\nendstream endobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(data))
        data.extend(obj)
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    data.extend(b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    data.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return ContentFile(bytes(data))


class Command(BaseCommand):
    help = "Add or refresh a complete, non-destructive PyLearn demo dataset."

    @transaction.atomic
    def handle(self, *args, **options):
        now = timezone.now()

        admin, _ = User.objects.get_or_create(
            email="demo.admin@pylearn.local",
            defaults={"first_name": "Demo", "last_name": "Administrator", "role": User.Role.ADMIN,
                      "bio": "Demo academic administrator.", "phone": "+8801700000001", "department": "Academic Affairs"},
        )
        student, _ = User.objects.get_or_create(
            email="demo.student@pylearn.local",
            defaults={"first_name": "Amina", "last_name": "Rahman", "role": User.Role.STUDENT,
                      "student_id": "PYL-DEMO-001", "bio": "Computer science learner focused on Python and data.",
                      "phone": "+8801700000002", "department": "Computer Science"},
        )
        second_student, _ = User.objects.get_or_create(
            email="demo.student2@pylearn.local",
            defaults={"first_name": "Nafis", "last_name": "Ahmed", "role": User.Role.STUDENT,
                      "student_id": "PYL-DEMO-002", "bio": "Web development and database learner.",
                      "phone": "+8801700000003", "department": "Software Engineering"},
        )
        for user in (admin, student, second_student):
            user.set_password("DemoPass123!")
            user.save(update_fields=["password"])
        if not student.avatar:
            student.avatar.save("demo-amina.png", png_file("AR", "#0f766e", (256, 256)), save=True)
        if not second_student.avatar:
            second_student.avatar.save("demo-nafis.png", png_file("NA", "#1d4ed8", (256, 256)), save=True)

        categories = {}
        for name, slug in (("Programming", "programming"), ("Data Science", "data-science"), ("Web Development", "web-development"), ("Cyber Security", "cyber-security")):
            categories[name], _ = CourseCategory.objects.update_or_create(slug=slug, defaults={"name": name})

        course_specs = [
            ("Python Foundations", "Build a strong Python foundation through practical syntax, functions, files, and testing.", "Programming", Course.Level.BEGINNER, Course.Status.PUBLISHED, 24, "#047857"),
            ("Data Analysis with Python", "Explore data cleaning, analysis, and visualization with realistic datasets.", "Data Science", Course.Level.INTERMEDIATE, Course.Status.PUBLISHED, 32, "#1d4ed8"),
            ("Modern Web APIs", "Design secure REST APIs and connect them to responsive web applications.", "Web Development", Course.Level.ADVANCED, Course.Status.PUBLISHED, 28, "#7c3aed"),
            ("Machine Learning Preview", "An upcoming guided introduction to supervised machine learning workflows.", "Data Science", Course.Level.ADVANCED, Course.Status.DRAFT, 18, "#be123c"),
            ("Statistics Fundamentals", "Build the probability and statistics foundation needed for data and ML work.", "Data Science", Course.Level.BEGINNER, Course.Status.PUBLISHED, 20, "#b45309"),
            ("Cyber Security Foundations", "Learn threats, authentication, networks, and secure computing basics.", "Cyber Security", Course.Level.BEGINNER, Course.Status.PUBLISHED, 22, "#be123c"),
            ("Advanced Cyber Security", "Practice threat analysis, secure architecture, and incident response.", "Cyber Security", Course.Level.ADVANCED, Course.Status.PUBLISHED, 30, "#7f1d1d"),
        ]
        courses = {}
        for title, description, category, level, status, hours, color in course_specs:
            course, _ = Course.objects.update_or_create(
                title=title,
                defaults={"description": description, "category": categories[category], "level": level,
                          "status": status, "duration_hours": hours},
            )
            if not course.thumbnail:
                course.thumbnail.save(f"{title.lower().replace(' ', '-')}.png", png_file(title, color), save=True)
            courses[title] = course

        python = courses["Python Foundations"]
        data_course = courses["Data Analysis with Python"]
        api_course = courses["Modern Web APIs"]

        field_specs = {
            "Programming": ["Python Basics", "Data Handling"],
            "Data Science": ["Statistics", "Machine Learning"],
            "Web Development": ["Web Applications", "REST APIs"],
            "Cyber Security": ["Security Fundamentals", "Threat Analysis"],
        }
        advisor_fields, advisor_skills = {}, {}
        for order, (name, skill_names) in enumerate(field_specs.items(), 1):
            field, _ = LearningField.objects.update_or_create(
                slug=name.lower().replace(" ", "-"),
                defaults={"name": name, "description": f"Assess and develop {name} skills.", "is_active": True, "order": order},
            )
            advisor_fields[name] = field
            for skill_name in skill_names:
                skill, _ = AdvisorSkill.objects.update_or_create(field=field, name=skill_name, defaults={"is_active": True})
                advisor_skills[skill_name] = skill

        course_skill_specs = {
            "Python Foundations": ["Python Basics"],
            "Data Analysis with Python": ["Data Handling", "Statistics"],
            "Modern Web APIs": ["Web Applications", "REST APIs"],
            "Machine Learning Preview": ["Machine Learning", "Statistics"],
            "Statistics Fundamentals": ["Statistics"],
            "Cyber Security Foundations": ["Security Fundamentals"],
            "Advanced Cyber Security": ["Threat Analysis", "Security Fundamentals"],
        }
        for course_title, skill_names in course_skill_specs.items():
            for skill_name in skill_names:
                CourseSkill.objects.update_or_create(course=courses[course_title], skill=advisor_skills[skill_name], defaults={"coverage": 100})

        intro, _ = LearningMaterial.objects.update_or_create(
            course=python, title="Python setup and first program",
            defaults={"description": "Install Python and run a first program.", "material_type": LearningMaterial.MaterialType.NOTE,
                      "note_content": "Install Python 3, create a virtual environment, and run: print('Hello, PyLearn!')", "order": 1},
        )
        handbook, _ = LearningMaterial.objects.update_or_create(
            course=python, title="Python foundations handbook",
            defaults={"description": "Downloadable reference for the core lessons.", "material_type": LearningMaterial.MaterialType.PDF,
                      "note_content": "Use this handbook while completing the exercises.", "order": 2},
        )
        if not handbook.file:
            handbook.file.save("python-foundations-handbook.pdf", minimal_pdf("PyLearn Python Foundations Handbook"), save=True)
        dataset_note, _ = LearningMaterial.objects.update_or_create(
            course=data_course, title="Data-cleaning checklist",
            defaults={"description": "A practical checklist for inspecting and cleaning datasets.", "material_type": LearningMaterial.MaterialType.NOTE,
                      "note_content": "1. Inspect types\n2. Find missing values\n3. Remove duplicates\n4. Validate ranges\n5. Document changes", "order": 1},
        )
        api_note, _ = LearningMaterial.objects.update_or_create(
            course=api_course, title="REST API design notes",
            defaults={"description": "Resource naming, status codes, authentication, and validation.", "material_type": LearningMaterial.MaterialType.NOTE,
                      "note_content": "Prefer nouns for resources, validate every write, and return precise HTTP status codes.", "order": 1},
        )

        enrollment, _ = Enrollment.objects.get_or_create(student=student, course=python)
        Enrollment.objects.get_or_create(student=student, course=data_course)
        Enrollment.objects.get_or_create(student=second_student, course=python)
        Enrollment.objects.get_or_create(student=second_student, course=api_course)
        MaterialProgress.objects.get_or_create(enrollment=enrollment, material=intro)

        quiz, _ = Quiz.objects.update_or_create(
            title="AI Skill Discovery Assessment",
            defaults={"course": python, "description": "Discover your strongest learning field across programming, data, web, and security.", "passing_score": 60,
                      "is_initial_assessment": True, "quiz_type": Quiz.QuizType.SKILL_DISCOVERY, "is_published": True, "results_published": False},
        )
        question_specs = [
            (Question.QuestionType.MULTIPLE_CHOICE, "Which keyword defines a Python function?", "Python Basics", ["func", "def", "function", "lambda"], "def", 2, 1, "Programming", "Python Basics"),
            (Question.QuestionType.TRUE_FALSE, "A REST API commonly uses HTTP methods.", "REST APIs", ["True", "False"], "True", 2, 2, "Web Development", "REST APIs"),
            (Question.QuestionType.MULTIPLE_CHOICE, "Which measure describes the center of numeric data?", "Statistics", ["Mean", "Firewall", "Route", "Token"], "Mean", 2, 3, "Data Science", "Statistics"),
            (Question.QuestionType.SHORT_ANSWER, "Name one way to strengthen account security.", "Security Fundamentals", [], "Multi-factor authentication", 2, 4, "Cyber Security", "Security Fundamentals"),
        ]
        questions = []
        for qtype, prompt, topic, options, answer, points, order, field_name, skill_name in question_specs:
            question, _ = Question.objects.update_or_create(
                quiz=quiz, prompt=prompt,
                defaults={"question_type": qtype, "topic": topic, "options": options, "correct_answer": answer,
                          "learning_field": advisor_fields[field_name], "advisor_skill": advisor_skills[skill_name],
                          "grading_rubric": answer if qtype in [Question.QuestionType.SHORT_ANSWER, Question.QuestionType.LONG_ANSWER] else "",
                          "points": points, "order": order},
            )
            questions.append(question)
        attempt, _ = QuizAttempt.objects.update_or_create(
            quiz=quiz, student=student,
            defaults={"score": 6, "max_score": 8, "percentage": 75, "passed": True,
                      "analysis_status": QuizAttempt.AnalysisStatus.PUBLISHED, "published_at": now},
        )
        submitted_answers = ["def", "True", "Mean", "Use MFA"]
        for question, answer in zip(questions, submitted_answers):
            correct = answer.casefold() == question.correct_answer.casefold()
            QuizAnswer.objects.update_or_create(
                attempt=attempt, question=question,
                defaults={"answer": answer, "is_correct": correct, "awarded_points": question.points if correct else 0},
            )

        analysis, _ = AdvisorAnalysis.objects.update_or_create(
            attempt=attempt,
            defaults={"summary": "Your strongest demonstrated area is Programming, with solid Python fundamentals.",
                      "strongest_field": advisor_fields["Programming"], "strongest_skills": [advisor_skills["Python Basics"].pk],
                      "field_scores": [{"field_id": advisor_fields["Programming"].pk, "score": 100}, {"field_id": advisor_fields["Data Science"].pk, "score": 100}, {"field_id": advisor_fields["Web Development"].pk, "score": 100}, {"field_id": advisor_fields["Cyber Security"].pk, "score": 0}],
                      "strengths": ["Python Basics", "REST APIs", "Statistics"], "gaps": ["Security Fundamentals"],
                      "level": AdvisorAnalysis.Level.INTERMEDIATE, "reviewed_by": admin},
        )
        AdvisorRecommendation.objects.update_or_create(
            analysis=analysis, course=data_course,
            defaults={"match_type": AdvisorRecommendation.MatchType.BEST_RELATED, "reason": "Build on strong Python knowledge with practical data handling."},
        )

        development_quizzes = [
            ("Programming Skill Development", "Programming", [
                ("Which keyword creates a Python function?", "Python Basics", ["def", "func", "method"], "def"),
                ("True or False: a Python dictionary stores key-value pairs.", "Data Handling", ["True", "False"], "True"),
                ("Name the built-in Python type used for an ordered mutable collection.", "Python Basics", [], "list"),
                ("Describe how you would validate and clean a small imported dataset.", "Data Handling", [], "Check types, missing values, duplicates, and invalid ranges before transforming the data"),
            ]),
            ("Machine Learning Skill Development", "Data Science", [
                ("What does supervised learning require?", "Machine Learning", ["Labeled data", "No data", "Only images"], "Labeled data"),
                ("True or False: a validation set can help detect overfitting.", "Machine Learning", ["True", "False"], "True"),
                ("Name a common measure of central tendency.", "Statistics", [], "mean|median|mode"),
                ("Explain why statistics matters in machine learning.", "Statistics", [], "Connect data, uncertainty, sampling, and model evaluation"),
            ]),
            ("Web Development Skill Development", "Web Development", [
                ("Which HTTP method is normally used to retrieve a resource?", "REST APIs", ["GET", "POST", "DELETE"], "GET"),
                ("True or False: HTTP 404 means a requested resource was not found.", "REST APIs", ["True", "False"], "True"),
                ("Name the standard data format commonly returned by REST APIs.", "REST APIs", [], "JSON"),
                ("Describe one way to protect a web application from unauthorized access.", "Web Applications", [], "Authenticate users and enforce authorization for every protected operation"),
            ]),
            ("Cyber Security Skill Development", "Cyber Security", [
                ("True or False: MFA reduces account takeover risk.", "Security Fundamentals", ["True", "False"], "True"),
                ("Which principle gives users only the access they need?", "Security Fundamentals", ["Least privilege", "Open access", "Shared accounts"], "Least privilege"),
                ("Name one common method for protecting stored passwords.", "Security Fundamentals", [], "hashing|password hashing"),
                ("Describe one step in threat analysis.", "Threat Analysis", [], "Identify assets, threats, vulnerabilities, likelihood, impact, and risk"),
            ]),
        ]
        seeded_development_quizzes = {}
        for quiz_title, field_name, development_questions in development_quizzes:
            development_quiz, _ = Quiz.objects.update_or_create(title=quiz_title, defaults={"description": f"Assess your current {field_name} level and identify skill gaps.", "quiz_type": Quiz.QuizType.SKILL_DEVELOPMENT, "target_field": advisor_fields[field_name], "is_initial_assessment": False, "is_published": True, "passing_score": 60})
            seeded_development_quizzes[field_name] = development_quiz
            for order, (prompt, skill_name, options, answer) in enumerate(development_questions, 1):
                qtype = Question.QuestionType.MULTIPLE_CHOICE if options and len(options) > 2 else Question.QuestionType.TRUE_FALSE if options else Question.QuestionType.SHORT_ANSWER if order == 3 else Question.QuestionType.LONG_ANSWER
                Question.objects.update_or_create(quiz=development_quiz, prompt=prompt, defaults={"question_type": qtype, "topic": skill_name, "learning_field": advisor_fields[field_name], "advisor_skill": advisor_skills[skill_name], "options": options, "correct_answer": answer, "grading_rubric": answer if not options else "", "points": 5, "order": order})

        web_quiz = seeded_development_quizzes["Web Development"]
        web_attempt, _ = QuizAttempt.objects.update_or_create(
            quiz=web_quiz, student=second_student,
            defaults={"score": 17, "max_score": 20, "percentage": 85, "passed": True,
                      "analysis_status": QuizAttempt.AnalysisStatus.PUBLISHED, "published_at": now},
        )
        web_answers = {
            "Which HTTP method is normally used to retrieve a resource?": ("GET", True, 5),
            "True or False: HTTP 404 means a requested resource was not found.": ("True", True, 5),
            "Name the standard data format commonly returned by REST APIs.": ("JSON", True, 5),
            "Describe one way to protect a web application from unauthorized access.": ("Use login authentication and role permissions.", True, 2),
        }
        for question in web_quiz.questions.all():
            answer, correct, points = web_answers[question.prompt]
            QuizAnswer.objects.update_or_create(
                attempt=web_attempt, question=question,
                defaults={"answer": answer, "is_correct": correct, "awarded_points": points,
                          "ai_feedback": "Good practical answer." if question.question_type == Question.QuestionType.LONG_ANSWER else ""},
            )
        web_analysis, _ = AdvisorAnalysis.objects.update_or_create(
            attempt=web_attempt,
            defaults={"summary": "You demonstrate strong REST API fundamentals and understand practical access control.",
                      "strongest_field": advisor_fields["Web Development"], "strongest_skills": [advisor_skills["REST APIs"].pk],
                      "field_scores": [{"field_id": advisor_fields["Web Development"].pk, "score": 85}],
                      "strengths": ["REST APIs", "HTTP semantics", "Authentication basics"],
                      "gaps": ["Advanced authorization design"], "level": AdvisorAnalysis.Level.ADVANCED,
                      "reviewed_by": admin},
        )
        AdvisorRecommendation.objects.update_or_create(
            analysis=web_analysis, course=api_course,
            defaults={"match_type": AdvisorRecommendation.MatchType.EXACT_MATCH,
                      "reason": "Advance existing API knowledge through secure REST design and implementation."},
        )

        AIProviderConfig.objects.update_or_create(
            provider=AIProviderConfig.Provider.GENERIC, model="demo-model",
            defaults={"base_url": "https://example.invalid/v1", "encrypted_api_key": encrypt_key("demo-key-not-for-production"), "is_active": False},
        )
        notification_specs = [
            ("WELCOME_DEMO", "Welcome to PyLearn", "Your demo learning workspace is ready.", EmailNotification.Status.SENT, now, ""),
            ("COURSE_REMINDER", "Course progress reminder", "Continue your Python Foundations course this week.", EmailNotification.Status.PENDING, None, ""),
            ("DELIVERY_DEMO", "Delivery troubleshooting example", "This record demonstrates a failed notification.", EmailNotification.Status.FAILED, now, "Demo mailbox intentionally unavailable."),
        ]
        for event, subject, summary, status, attempted_at, error in notification_specs:
            EmailNotification.objects.update_or_create(
                recipient=student, event_type=event, subject=subject,
                defaults={"summary": summary, "status": status, "attempted_at": attempted_at, "error_message": error},
            )
        ActivityLog.objects.update_or_create(
            actor=admin, action="SEED", entity="demo_dataset", entity_id="complete",
            defaults={"details": "Created the complete additive PyLearn demonstration dataset."},
        )
        ActivityLog.objects.update_or_create(
            actor=student, action="COMPLETE", entity="material", entity_id=str(intro.pk),
            defaults={"details": "Completed the Python setup learning material."},
        )

        self.stdout.write(self.style.SUCCESS(
            f"Demo data ready: {Course.objects.count()} courses, {LearningMaterial.objects.count()} materials, "
            f"{Enrollment.objects.count()} enrollments, {Quiz.objects.count()} quizzes."
        ))
