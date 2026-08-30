"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { unwrap } from "@/lib/api";
import type { User } from "@/lib/types";
import { ErrorMessage, Loading, PageHeader, Stat } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";

type Progress = {
  student: User;
  courses: {
    course_id: number;
    course_code: string;
    title: string;
    completion: number;
    completed_materials: number;
    total_materials: number;
    quizzes_passed: number;
    quiz_total: number;
    certificate_eligible: boolean;
    certificate_number?: string | null;
  }[];
  quiz_average: number;
  weak_topics: {
    attempt_id: number;
    quiz_id: number;
    quiz_title: string;
    course_title: string;
    incorrect_count: number;
    questions: {
      question_id: number;
      prompt: string;
      topic: string;
      submitted_answer: string;
      correct_answer: string;
    }[];
  }[];
};

export function ProgressPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState("");
  const [expandedWeakQuiz, setExpandedWeakQuiz] = useState<number | null>(null);

  const students = useApiData<User[] | { results: User[] }>(
    user?.role !== "STUDENT" ? "/users/?role=STUDENT" : null
  );
  const studentOptions = useMemo(
    () => unwrap(students.data || [])
      .filter(s => s.role === "STUDENT")
      .map(s => ({ value: s.id, label: s.name })),
    [students.data]
  );
  const reportPath = user?.role !== "STUDENT"
    ? selected ? `/progress/?student=${selected}` : null
    : "/progress/";
  const report = useApiData<Progress>(reportPath);
  const refreshingReport = report.loading && Boolean(report.data);

  useEffect(() => {
    if (user?.role === "STUDENT" || selected || studentOptions.length === 0) return;
    setSelected(String(studentOptions[0].value));
  }, [selected, studentOptions, user?.role]);

  function select(value: string) {
    setSelected(value);
    setExpandedWeakQuiz(null);
  }

  if (students.error) return <ErrorMessage message={students.error} />;
  if (students.loading || (user?.role !== "STUDENT" && !selected) || (report.loading && !report.data)) return <Loading variant="dashboard" />;
  if (user?.role !== "STUDENT" && !students.loading && studentOptions.length === 0) {
    return <ErrorMessage message="No student reports are available yet." />;
  }
  if (report.error || !report.data) return <ErrorMessage message={report.error || "No report available"} />;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Progress Tracking & Reports" 
        description="Course completion and assessment performance metrics." 
      />
      
      {user?.role !== "STUDENT" && students.data && (
        <div className="panel p-4 flex flex-col gap-3 bg-[var(--background)] sm:flex-row sm:items-center sm:gap-4">
          <label htmlFor="student-select" className="font-semibold text-sm whitespace-nowrap">
            View report for:
          </label>
          <ModernSelect
            id="student-select"
            className="field max-w-sm"
            value={selected}
            placeholder="Select a student…"
            options={studentOptions}
            onValueChange={select}
            disabled={refreshingReport}
          />
          {refreshingReport && (
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)]" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
              Loading report...
            </div>
          )}
        </div>
      )}

      <div className={`grid-cards ${refreshingReport ? "opacity-60" : ""}`} aria-busy={refreshingReport}>
        <Stat label="Quiz Average" value={`${Number(report.data.quiz_average).toFixed(1)}%`} />
        <Stat label="Identified Weak Topics" value={report.data.weak_topics.length} />
      </div>

      <div className={`grid lg:grid-cols-2 gap-6 items-start ${refreshingReport ? "opacity-60" : ""}`} aria-busy={refreshingReport}>
        <section className="panel p-6">
          <h2 className="font-bold text-xl mb-4">Course Completion</h2>
          
          {report.data.courses.length > 0 ? (
            <div className="space-y-5">
              {report.data.courses.map(c => (
                <div key={c.course_id} className="pb-5 border-b border-[var(--border)] last:border-0 last:pb-0">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="badge">{c.course_code}</span>
                      <strong className="mt-2 block text-[var(--foreground)]">{c.title}</strong>
                    </div>
                    <span className="font-bold text-[var(--primary)]">{c.completion}%</span>
                  </div>
                  
                  <progress 
                    className="w-full h-2.5 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-[var(--background)] [&::-webkit-progress-value]:bg-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)]" 
                    value={c.completion} 
                    max="100" 
                  />
                  
                  <div className="muted text-xs mt-1.5 font-medium">
                    {c.completed_materials} of {c.total_materials} materials completed
                  </div>
                  <div className="muted text-xs mt-1 font-medium">{c.quizzes_passed} of {c.quiz_total} required quizzes passed</div>
                  <span className="badge mt-2">{c.certificate_number ? "Certificate issued" : c.certificate_eligible ? "Certificate eligible" : "Not yet certificate eligible"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted text-sm text-center py-4">No course data available.</div>
          )}
        </section>

        <section className="panel p-6">
          <h2 className="font-bold text-xl mb-4">Weak Topics</h2>
          
          {report.data.weak_topics.length > 0 ? (
            <div className="space-y-3">
              {report.data.weak_topics.map(quiz => {
                const expanded = expandedWeakQuiz === quiz.attempt_id;
                return (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]" key={quiz.attempt_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                      aria-expanded={expanded}
                      onClick={() => setExpandedWeakQuiz(expanded ? null : quiz.attempt_id)}
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-[var(--foreground)]">{quiz.quiz_title}</strong>
                        {quiz.course_title && <span className="muted mt-1 block text-sm">{quiz.course_title}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="badge">
                          {quiz.incorrect_count} incorrect {quiz.incorrect_count === 1 ? "answer" : "answers"}
                        </span>
                        <ChevronDown className={`text-[var(--muted)] transition-transform ${expanded ? "rotate-180" : ""}`} size={18} aria-hidden="true" />
                      </span>
                    </button>
                    {expanded && (
                      <div className="border-t border-[var(--border)] p-4">
                        <div className="space-y-4">
                          {quiz.questions.map(question => (
                            <article className="space-y-2" key={question.question_id}>
                              <div className="text-sm font-semibold text-[var(--foreground)]">{question.prompt}</div>
                              <div className="grid gap-2 text-sm md:grid-cols-2">
                                <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
                                  <div className="muted text-xs font-semibold uppercase">Submitted answer</div>
                                  <div className="mt-1">{question.submitted_answer || "No answer submitted"}</div>
                                </div>
                                <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
                                  <div className="muted text-xs font-semibold uppercase">Correct answer</div>
                                  <div className="mt-1">{question.correct_answer || "No answer recorded"}</div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted text-sm text-center py-4">
              Great job! No specific weak topics identified yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
