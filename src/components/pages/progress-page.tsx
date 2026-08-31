"use client";

import { KeyboardEvent, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type { User } from "@/lib/types";
import { Empty, ErrorMessage, Loading, Modal, PageHeader, Stat } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";

type CourseProgress = { course_id: number; course_code: string; title: string; completion: number; completed_materials: number; total_materials: number; quizzes_passed: number; quiz_total: number; certificate_eligible: boolean; certificate_number?: string | null };
type Progress = {
  student: User; courses: CourseProgress[]; quiz_average: number;
  weak_topics: { attempt_id: number; quiz_id: number; quiz_title: string; course_title: string; incorrect_count: number; questions: { question_id: number; prompt: string; topic: string; submitted_answer: string; correct_answer: string }[] }[];
};
type StudentProgressSummary = { student: User; enrolled_courses: number; completed_materials: number; total_materials: number; quizzes_passed: number; quiz_total: number; overall_completion: number; status: "ON_TRACK" | "NEEDS_ATTENTION" };

function initials(user: User) {
  const value = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.name || user.email;
  return value.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function ProgressReport({ report }: { report: Progress }) {
  const [expandedWeakQuiz, setExpandedWeakQuiz] = useState<number | null>(null);
  useEffect(() => setExpandedWeakQuiz(null), [report.student.id]);

  return <div className="space-y-6">
    <div className="grid-cards"><Stat label="Quiz Average" value={`${Number(report.quiz_average).toFixed(1)}%`} /><Stat label="Identified Weak Topics" value={report.weak_topics.length} /></div>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="panel p-6">
        <h3 className="mb-4 text-xl font-bold">Course Completion</h3>
        {report.courses.length ? <div className="space-y-5">{report.courses.map(course => <div className="border-b border-[var(--border)] pb-5 last:border-0 last:pb-0" key={course.course_id}>
          <div className="mb-2 flex items-end justify-between gap-3"><div><span className="badge">{course.course_code}</span><strong className="mt-2 block">{course.title}</strong></div><span className="font-bold text-[var(--primary)]">{course.completion}%</span></div>
          <progress className="h-2.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[var(--background)] [&::-webkit-progress-value]:bg-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)]" value={course.completion} max="100" aria-label={`${course.title} completion`} />
          <div className="muted mt-1.5 text-xs font-medium">{course.completed_materials} of {course.total_materials} materials completed</div>
          <div className="muted mt-1 text-xs font-medium">{course.quizzes_passed} of {course.quiz_total} required quizzes passed</div>
          <span className="badge mt-2">{course.certificate_number ? "Certificate issued" : course.certificate_eligible ? "Certificate eligible" : "Not yet certificate eligible"}</span>
        </div>)}</div> : <div className="muted py-4 text-center text-sm">No course data available.</div>}
      </section>
      <section className="panel p-6">
        <h3 className="mb-4 text-xl font-bold">Weak Topics</h3>
        {report.weak_topics.length ? <div className="space-y-3">{report.weak_topics.map(quiz => {
          const expanded = expandedWeakQuiz === quiz.attempt_id;
          return <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]" key={quiz.attempt_id}>
            <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={expanded} onClick={() => setExpandedWeakQuiz(expanded ? null : quiz.attempt_id)}>
              <span className="min-w-0"><strong className="block truncate">{quiz.quiz_title}</strong>{quiz.course_title && <span className="muted mt-1 block text-sm">{quiz.course_title}</span>}</span>
              <span className="flex shrink-0 items-center gap-2"><span className="badge">{quiz.incorrect_count} incorrect</span><ChevronDown className={`text-[var(--muted)] transition-transform ${expanded ? "rotate-180" : ""}`} size={18} aria-hidden="true" /></span>
            </button>
            {expanded && <div className="space-y-4 border-t border-[var(--border)] p-4">{quiz.questions.map(question => <article className="space-y-2" key={question.question_id}>
              <div className="text-sm font-semibold">{question.prompt}</div><div className="grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3"><div className="muted text-xs font-semibold uppercase">Submitted answer</div><div className="mt-1">{question.submitted_answer || "No answer submitted"}</div></div>
                <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3"><div className="muted text-xs font-semibold uppercase">Correct answer</div><div className="mt-1">{question.correct_answer || "No answer recorded"}</div></div>
              </div>
            </article>)}</div>}
          </div>;
        })}</div> : <div className="muted py-4 text-center text-sm">Great job! No specific weak topics identified yet.</div>}
      </section>
    </div>
  </div>;
}

export function ProgressPage() {
  const { user, loading: authLoading } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<StudentProgressSummary | null>(null);
  const isStudent = user?.role === "STUDENT";
  const summaries = useApiData<StudentProgressSummary[]>(user && !isStudent ? "/progress/" : null);
  const personalReport = useApiData<Progress>(user && isStudent ? "/progress/" : null);
  const detail = useApiData<Progress>(selectedStudent ? `/progress/?student=${selectedStudent.student.id}` : null);
  const selectedDetail = detail.data?.student.id === selectedStudent?.student.id ? detail.data : null;

  function handleRowKey(event: KeyboardEvent<HTMLTableRowElement>, summary: StudentProgressSummary) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedStudent(summary); }
  }

  if (authLoading || !user) return <Loading variant="dashboard" />;
  if (isStudent) {
    if (personalReport.loading && !personalReport.data) return <Loading variant="dashboard" />;
    if (personalReport.error || !personalReport.data) return <ErrorMessage message={personalReport.error || "No report available"} />;
    return <div className="space-y-6"><PageHeader title="Student Progress" description="Course completion and assessment performance metrics." /><ProgressReport report={personalReport.data} /></div>;
  }

  return <div className="space-y-6">
    <PageHeader title="Student Progress" description="One row per student, summarizing all course activity." />
    {summaries.loading ? <Loading variant="table" /> : summaries.error ? <ErrorMessage message={summaries.error} /> : !summaries.data?.length ? <Empty message="No student progress is available yet." /> : <div className="panel table-wrap">
      <table className="w-full text-left text-sm"><thead><tr><th>Student</th><th>Enrolled courses</th><th>Materials</th><th>Quizzes passed</th><th>Overall progress</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{summaries.data.map(summary => <tr key={summary.student.id} tabIndex={0} aria-label={`View progress details for ${summary.student.name}`} className="cursor-pointer transition-colors hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]" onClick={() => setSelectedStudent(summary)} onKeyDown={event => handleRowKey(event, summary)}>
        <td><div className="flex min-w-48 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-xs font-bold text-[var(--primary)]">{initials(summary.student)}</span><span><strong className="block">{summary.student.name}</strong><span className="muted block text-xs">{summary.student.email}</span></span></div></td>
        <td className="font-semibold">{summary.enrolled_courses}</td><td className="font-semibold">{summary.completed_materials} / {summary.total_materials}</td><td className="font-semibold">{summary.quizzes_passed} / {summary.quiz_total}</td>
        <td><div className="flex min-w-36 items-center gap-3"><progress className="h-2 w-20 overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[var(--background)] [&::-webkit-progress-value]:bg-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)]" value={summary.overall_completion} max="100" aria-label={`${summary.student.name} overall progress`} /><strong>{summary.overall_completion}%</strong></div></td>
        <td><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${summary.status === "ON_TRACK" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{summary.status === "ON_TRACK" ? "On track" : "Needs attention"}</span></td>
        <td><button type="button" className="whitespace-nowrap font-semibold text-[var(--primary)] hover:underline" onClick={event => { event.stopPropagation(); setSelectedStudent(summary); }}>View details</button></td>
      </tr>)}</tbody></table>
    </div>}
    <Modal open={Boolean(selectedStudent)} title={selectedStudent ? `${selectedStudent.student.name} — Progress Report` : "Student Progress Report"} onCloseAction={() => setSelectedStudent(null)} size="wide">
      {detail.loading && !selectedDetail ? <Loading variant="detail" /> : detail.error ? <ErrorMessage message={detail.error} /> : selectedDetail ? <ProgressReport report={selectedDetail} /> : <Loading variant="detail" />}
    </Modal>
  </div>;
}
