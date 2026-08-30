"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleCheckBig,
  Compass,
} from "lucide-react";
import { PageHeader, Loading, ErrorMessage, Stat } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { useApiData } from "@/hooks/use-api-data";
import type { StudentDashboard } from "@/lib/types";

type AdminDashboard = {
  statistics: Record<string, number>;
  recent_activities: {
    id: number;
    actor_name: string;
    action: string;
    details: string;
    created_at: string;
  }[];
};

function AdminDashboardContent({ data }: { data: AdminDashboard }) {
  return (
    <>
      <div className="grid-cards">
        {Object.entries(data.statistics).map(([key, value]) => (
          <Stat key={key} label={key.replaceAll("_", " ").toUpperCase()} value={value} />
        ))}
      </div>

      <section className="panel p-6">
        <h2 className="font-bold text-xl mb-4">Recent Activities</h2>
        {data.recent_activities.length > 0 ? (
          <div className="flex flex-col">
            {data.recent_activities.map((activity) => (
              <div
                key={activity.id}
                className="border-b border-[var(--border)] py-4 last:border-0 last:pb-0 first:pt-0"
              >
                <div className="text-sm">
                  <strong className="font-semibold text-[var(--foreground)]">
                    {activity.actor_name}
                  </strong>{" "}
                  <span className="muted">{activity.action.toLowerCase()} -</span>{" "}
                  {activity.details}
                </div>
                <div className="muted text-xs mt-1.5 font-medium">
                  {new Date(activity.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted text-sm text-center py-6">No recent activities found.</div>
        )}
      </section>
    </>
  );
}

function StudentDashboardContent({ data }: { data: StudentDashboard }) {
  const average = Number(data.statistics.quiz_average);
  const summaryCards = [
    {
      label: "Enrolled Courses",
      value: data.statistics.enrolled_courses,
      detail: "Active courses",
      icon: <BookOpen size={23} />,
      tone: "blue",
    },
    {
      label: "Completed Materials",
      value: data.statistics.completed_materials,
      detail: "Total completed",
      icon: <CircleCheckBig size={23} />,
      tone: "green",
    },
    {
      label: "Average Quiz Score",
      value: `${average.toFixed(1)}%`,
      detail: "Published results",
      icon: <ChartNoAxesCombined size={23} />,
      tone: "purple",
    },
    {
      label: "Learning Path Advisor",
      value: "AI",
      detail: "Discover or develop skills",
      icon: <Compass size={23} />,
      tone: "amber",
    },
  ];

  return (
    <>
      <div className="dashboard-stats">
        {summaryCards.map((card) => (
          <article className="dashboard-stat panel" key={card.label}>
            <div className={`dashboard-stat-icon dashboard-stat-icon-${card.tone}`}>
              {card.icon}
            </div>
            <div>
              <p className="muted text-sm font-medium">{card.label}</p>
              <p className="dashboard-stat-value">{card.value}</p>
              <p className="muted text-xs mt-0.5">{card.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="dashboard-layout">
        <section className="panel dashboard-section dashboard-courses">
          <div className="dashboard-section-header">
            <div>
              <h2 className="text-xl font-bold">My Courses</h2>
              <p className="muted text-sm mt-1">Pick up where you left off.</p>
            </div>
            <Link href="/courses" className="btn btn-secondary">
              Browse Courses
            </Link>
          </div>

          {data.courses.length > 0 ? (
            <div
              className={`dashboard-course-list${data.courses.length > 3 ? " is-scrollable" : ""}`}
              aria-label={`${data.courses.length} enrolled ${data.courses.length === 1 ? "course" : "courses"}`}
            >
              {data.courses.map((course) => {
                const completion = Math.min(100, Math.max(0, Number(course.completion)));
                return (
                  <article className="dashboard-course" key={course.course_id}>
                    {course.thumbnail ? (
                      <img className="dashboard-course-image" src={course.thumbnail} alt="" />
                    ) : (
                      <div className="dashboard-course-image dashboard-course-placeholder" aria-hidden="true">
                        <BookOpen size={30} />
                      </div>
                    )}

                    <div className="dashboard-course-copy">
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className="badge">{course.course_code}</span>
                        <span className="badge">{course.category}</span>
                        <span className="dashboard-level">{course.level}</span>
                      </div>
                      <h3 className="font-bold text-lg">{course.title}</h3>
                      <p className="muted text-sm mt-1 line-clamp-2">{course.description}</p>
                      <p className="muted text-xs mt-2">
                        {course.completed_materials} of {course.total_materials} materials completed
                      </p>
                    </div>

                    <div className="dashboard-course-progress">
                      <div className="flex justify-between items-center gap-4 text-sm mb-2">
                        <span className="muted font-medium">Progress</span>
                        <strong className="text-[var(--primary)]">{completion.toFixed(0)}%</strong>
                      </div>
                      <progress value={completion} max="100" aria-label={`${course.title} progress`} />
                      <Link className="btn btn-primary mt-4 w-full" href={`/courses/${course.course_id}`}>
                         <ArrowRight size={16} />Continue Learning
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <BookOpen size={30} />
              <strong>No courses yet</strong>
              <p className="muted text-sm">Browse the catalog and enroll to start learning.</p>
              <Link href="/courses" className="btn btn-primary mt-2">Browse Courses</Link>
            </div>
          )}
        </section>

        <aside className="dashboard-side-column">
          <section className="panel dashboard-section"><div className="dashboard-section-header"><div><h2 className="text-xl font-bold">AI Learning Path Advisor</h2><p className="muted text-sm mt-1">Choose Skill Discovery or Skill Development.</p></div><Compass className="text-[var(--primary)]" size={21} /></div><p className="muted text-sm">Take one assessment and receive an admin-reviewed AI analysis of your strengths, gaps, and best available course.</p><Link href="/learning-path" className="dashboard-text-link"><ArrowRight size={15} />Open Learning Path Advisor</Link></section>

          <section className="panel dashboard-section">
            <div className="dashboard-section-header">
              <div>
                <h2 className="text-xl font-bold">Recent Results</h2>
                <p className="muted text-sm mt-1">Your latest published quiz scores.</p>
              </div>
              <CheckCircle2 className="text-[var(--success)]" size={21} />
            </div>

            {data.recent_results.length > 0 ? (
              <div className="dashboard-result-list">
                {data.recent_results.map((result) => (
                  <Link className="dashboard-result" href={`/quizzes/${result.quiz_id}`} key={result.id}>
                    <div className={`dashboard-result-icon ${result.passed ? "is-passed" : "is-failed"}`}>
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{result.quiz_title}</p>
                      <p className="muted text-xs mt-0.5 truncate">{result.course_title}</p>
                    </div>
                    <div className="text-right">
                      <strong className={result.passed ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                        {Number(result.percentage).toFixed(0)}%
                      </strong>
                      <p className="muted text-[11px] mt-0.5">
                        {new Date(result.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty dashboard-empty-compact">
                <ChartNoAxesCombined size={26} />
                <strong>No published results</strong>
                <p className="muted text-sm">Completed quiz results will appear here.</p>
              </div>
            )}

            <Link href="/quizzes" className="dashboard-text-link">
<ArrowRight size={15} />              View all quizzes 
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApiData<StudentDashboard | AdminDashboard>("/dashboard/");

  if (loading) return <Loading variant="dashboard" />;
  if (error || !data) return <ErrorMessage message={error || "Dashboard data is unavailable."} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user?.role === "ADMIN" ? "Dashboard" : `Welcome back, ${user?.first_name || user?.name || "Student"}!`}
        description={
          user?.role === "ADMIN"
            ? `Welcome back, ${user.name}.`
            : "Keep up the momentum and continue your learning journey."
        }
      />

      {user?.role === "ADMIN" ? (
        <AdminDashboardContent data={data as AdminDashboard} />
      ) : (
        <StudentDashboardContent data={data as StudentDashboard} />
      )}
    </div>
  );
}
