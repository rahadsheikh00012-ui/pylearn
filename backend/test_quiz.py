import os
import sys
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pylearn.settings')
django.setup()

from django.test import RequestFactory
from portal.models import CourseCategory, Course, Quiz, Question, User, QuizAttempt, QuizAnswer
from portal.views import initial_assessment_recommendations
from decimal import Decimal
from django.utils import timezone

def run():
    print("Setting up initial data...")
    # Create category
    cat, _ = CourseCategory.objects.get_or_create(name="Tech", slug="tech")

    # Create courses
    courses = [
        {"title": "Python Basics", "desc": "Learn basic Python programming."},
        {"title": "Django Advanced", "desc": "Master Django web framework."},
        {"title": "React Fundamentals", "desc": "Build UI with React."},
        {"title": "Machine Learning", "desc": "Intro to ML concepts."},
        {"title": "Data Science", "desc": "Data analysis and visualization."}
    ]
    
    course_objs = []
    for c in courses:
        obj, _ = Course.objects.get_or_create(title=c["title"], category=cat, defaults={"description": c["desc"], "status": Course.Status.PUBLISHED})
        course_objs.append(obj)

    # Create Initial Assessment Quiz
    quiz, _ = Quiz.objects.get_or_create(
        title="Placement Test", 
        is_initial_assessment=True, 
        defaults={"is_published": True, "passing_score": 50}
    )

    # Create 10 Questions
    questions_data = [
        # Python
        {"topic": "Python Basics", "prompt": "What is a list?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "A collection"},
        {"topic": "Python Basics", "prompt": "How to define a function?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "def"},
        # Django
        {"topic": "Django Advanced", "prompt": "What is ORM?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Object Relational Mapping"},
        {"topic": "Django Advanced", "prompt": "What does a view do?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Handles request"},
        # React
        {"topic": "React Fundamentals", "prompt": "What is a hook?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "A function to use state"},
        {"topic": "React Fundamentals", "prompt": "What is JSX?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Syntax extension"},
        # ML
        {"topic": "Machine Learning", "prompt": "What is supervised learning?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Learning with labels"},
        {"topic": "Machine Learning", "prompt": "What is overfitting?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Memorizing training data"},
        # Data Science
        {"topic": "Data Science", "prompt": "What is pandas?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Data analysis library"},
        {"topic": "Data Science", "prompt": "What is matplotlib?", "type": Question.QuestionType.MULTIPLE_CHOICE, "correct": "Plotting library"},
    ]

    question_objs = []
    for i, q in enumerate(questions_data):
        obj, _ = Question.objects.get_or_create(
            quiz=quiz,
            prompt=q["prompt"],
            defaults={"topic": q["topic"], "question_type": q["type"], "correct_answer": q["correct"], "order": i}
        )
        question_objs.append(obj)

    # Create Student
    student, _ = User.objects.get_or_create(email="test_student@example.com", defaults={"role": User.Role.STUDENT})
    student.set_password("password123")
    student.save()

    # Create Attempt
    attempt = QuizAttempt.objects.create(quiz=quiz, student=student)
    
    # Simulate answers: Right for Python, React. Wrong for Django, ML, Data Science.
    for q in question_objs:
        if q.topic in ["Python Basics", "React Fundamentals"]:
            # correct
            QuizAnswer.objects.create(attempt=attempt, question=q, answer=q.correct_answer, is_correct=True, awarded_points=Decimal('1'))
        else:
            # incorrect
            QuizAnswer.objects.create(attempt=attempt, question=q, answer="Wrong answer", is_correct=False, awarded_points=Decimal('0'))

    # Evaluate attempt
    score = Decimal('4') # 4 correct
    max_score = Decimal('10')
    attempt.score = score
    attempt.max_score = max_score
    attempt.percentage = (score / max_score) * 100
    attempt.passed = False
    attempt.save()

    print(f"Quiz completed! Score: {attempt.percentage}%")

    # Call AI recommendations
    factory = RequestFactory()
    request = factory.get('/')
    request.user = student

    print("Generating AI recommendations...")
    correct_topics, recs = initial_assessment_recommendations(request, attempt)

    print("\n--- Correct Topics ---")
    print(correct_topics)

    print("\n--- AI Recommendations ---")
    print(json.dumps(recs, indent=2))
    print("\nTest completed.")

if __name__ == "__main__":
    run()
