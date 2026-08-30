export type Role = "ADMIN" | "STUDENT";
export type User = { id: number; email: string; name: string; first_name: string; last_name: string; role: Role; is_active: boolean; avatar?: string | null; department: string; bio: string; phone: string; student_id?: string | null; date_joined: string };
export type Category = { id: number; name: string; slug: string };
export type Material = { id: number; course: number; title: string; description: string; material_type: "PDF" | "VIDEO" | "NOTE"; note_content: string; order: number; download_url?: string | null; completed: boolean };
export type Course = { id: number; course_code: string; title: string; description: string; category: number; category_detail: Category; level: string; status: string; duration_hours: number; thumbnail?: string | null; materials: Material[]; enrollment_count: number; is_enrolled: boolean; recommendation_reason?: string };
export type Enrollment = { id: number; student: number; student_detail: User; course: number; course_detail: Course; enrolled_at: string; progress: number };
export type Quiz = { id: number; course?: number | null; course_title?: string | null; title: string; description: string; passing_score: number; is_initial_assessment: boolean; quiz_type: "COURSE" | "SKILL_DISCOVERY" | "SKILL_DEVELOPMENT"; target_field?: number | null; is_published: boolean; results_published: boolean; questions: Question[]; user_attempted?: boolean; user_passed?: boolean; latest_attempt_percentage?: string | number | null; latest_attempt_analysis_status?: string | null; recommended_courses?: Course[]; detailed_results?: Record<string, { is_correct: boolean; correct_answer: string; submitted_answer: string }> };
export type QuestionTypeOption = { value: string; label: string };
export type Question = { id?: number; question_type: string; prompt: string; topic: string; learning_field?: number | null; advisor_skill?: number | null; options: string[]; correct_answer?: string; grading_rubric?: string; points: number; order: number };
export type QuizAttemptResult = { percentage: string; passed: boolean; analysis_status?: string; correct_topics?: string[]; recommended_courses?: Course[]; detailed_results?: Record<string, { is_correct: boolean; correct_answer: string; submitted_answer: string }> };
export type StudentDashboard = {
  statistics: {
    enrolled_courses: number;
    completed_materials: number;
    quiz_average: number | string;
    today_tasks: number;
  };
  courses: {
    course_id: number;
    course_code: string;
    title: string;
    description: string;
    category: string;
    level: string;
    thumbnail: string;
    completed_materials: number;
    total_materials: number;
    completion: number;
  }[];
  today_study_plan: {
    summary: string;
    tasks: { id: string; title: string; minutes: number | null; day: string; completed: boolean }[];
    created_at: string;
  } | null;
  recent_results: {
    id: number;
    quiz_id: number;
    quiz_title: string;
    course_title: string;
    percentage: number | string;
    passed: boolean;
    completed_at: string;
  }[];
};
