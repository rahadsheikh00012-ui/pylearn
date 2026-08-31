"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  GraduationCap,
  Layers,
  Lock,
  Plus,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Category, Course, CourseManagementOverview } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";
import { AdminCoursesWorkspace } from "@/components/pages/admin-courses-workspace";
import { InstructorCoursesWorkspace } from "@/components/pages/instructor-courses-workspace";

const levelOptions = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function AdminLandingDashboard({
  onSelectWorkspace,
  onOpenNewCourseModal,
}: {
  onSelectWorkspace: (ws: "admin" | "instructors") => void;
  onOpenNewCourseModal: () => void;
}) {
  const { data: overview, loading: statsLoading, error: statsError } = useApiData<CourseManagementOverview>(
    "/course-management/overview/"
  );
  const { data: recentCoursesData, loading: coursesLoading } = useApiData<Course[] | { results: Course[] }>(
    "/courses/"
  );

  const courses = recentCoursesData ? unwrap(recentCoursesData) : [];
  const adminOwnedCount = courses.filter((c) => !c.instructor).length;
  const instructorOwnedCount = courses.filter((c) => Boolean(c.instructor)).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Course Management"
        description="Platform curriculum oversight, administrative workspaces, and instructor directory."
        action={
          <button className="btn btn-primary inline-flex items-center gap-2" onClick={onOpenNewCourseModal}>
            <Plus size={16} />
            New course
          </button>
        }
      />

      {/* Live Statistics Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel p-5 skeleton h-28" />
          ))}
        </div>
      ) : statsError ? (
        <ErrorMessage message={statsError} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Courses */}
          <article className="panel p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Total Courses</span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]">
                <BookOpen size={18} />
              </div>
            </div>
            <div>
              <strong className="text-2xl font-extrabold block text-[var(--foreground)]">
                {overview?.total_courses ?? 0}
              </strong>
              <span className="text-xs text-[var(--muted)] mt-1 block">
                <strong>{overview?.courses_this_month ?? 0}</strong> created this month
              </span>
            </div>
          </article>

          {/* Active Instructors */}
          <article className="panel p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Active Instructors</span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]">
                <Users size={18} />
              </div>
            </div>
            <div>
              <strong className="text-2xl font-extrabold block text-[var(--foreground)]">
                {overview?.active_instructors ?? 0}
              </strong>
              <span className="text-xs text-[var(--muted)] mt-1 block">
                <strong>{overview?.instructor_departments ?? 0}</strong> departments represented
              </span>
            </div>
          </article>

          {/* Enrolled Students */}
          <article className="panel p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Enrolled Students</span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]">
                <GraduationCap size={18} />
              </div>
            </div>
            <div>
              <strong className="text-2xl font-extrabold block text-[var(--foreground)]">
                {overview?.enrolled_students ?? 0}
              </strong>
              <span className="text-xs text-[var(--muted)] mt-1 block">
                Distinct student enrollments
              </span>
            </div>
          </article>

          {/* Published Rate */}
          <article className="panel p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Published Rate</span>
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <strong className="text-2xl font-extrabold block text-[var(--foreground)]">
                {overview?.published_rate ?? 0}%
              </strong>
              <span className="text-xs text-[var(--muted)] mt-1 block">
                Live on student catalog
              </span>
            </div>
          </article>
        </div>
      )}

      {/* Two Workspace Navigation Cards */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">Management Workspaces</h2>
          <p className="text-xs muted mt-0.5">Select a workspace to manage platform courses or audit instructor curriculum.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Admin Workspace */}
          <article className="panel p-6 flex flex-col justify-between border-2 hover:border-[var(--primary)] transition-all rounded-2xl bg-[var(--surface)] shadow-md group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="badge font-bold text-xs bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]">
                  <Shield size={13} className="mr-1 inline" /> Full Control
                </span>
                <span className="text-xs font-medium muted">{adminOwnedCount} {adminOwnedCount === 1 ? "course" : "courses"}</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                  Course Management: Admin
                </h3>
                <p className="text-sm muted mt-2 line-clamp-2">
                  Create, configure, and publish platform-owned courses. Manage curriculum files, set enrollment pricing, and control publication status.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--border)] text-xs muted">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--primary)] shrink-0" />
                  <span>Create & edit platform courses</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--primary)] shrink-0" />
                  <span>Upload learning materials and structured notes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--primary)] shrink-0" />
                  <span>Set free or paid enrollment pricing</span>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-4">
              <button
                type="button"
                onClick={() => onSelectWorkspace("admin")}
                className="btn btn-primary w-full inline-flex items-center justify-center gap-2 text-sm font-semibold"
              >
                <ArrowRight size={16} />
                Enter Admin Workspace
              </button>
            </div>
          </article>

          {/* Card 2: Instructor Workspace */}
          <article className="panel p-6 flex flex-col justify-between border-2 hover:border-[var(--accent)] transition-all rounded-2xl bg-[var(--surface)] shadow-md group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="badge font-bold text-xs bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)]">
                  <Lock size={13} className="mr-1 inline" /> Read-only Oversight
                </span>
                <span className="text-xs font-medium muted">{instructorOwnedCount} {instructorOwnedCount === 1 ? "course" : "courses"}</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                  Instructor Course Management
                </h3>
                <p className="text-sm muted mt-2 line-clamp-2">
                  Inspect instructor-led courses, audit uploaded learning materials, and review student quiz evaluations and performance without mutating content.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--border)] text-xs muted">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--accent)] shrink-0" />
                  <span>Browse instructor directory and faculty profiles</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--accent)] shrink-0" />
                  <span>Inspect learning materials and lecture videos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--accent)] shrink-0" />
                  <span>Audit quiz questions and student attempt scores</span>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-4">
              <button
                type="button"
                onClick={() => onSelectWorkspace("instructors")}
                className="btn btn-secondary w-full inline-flex items-center justify-center gap-2 text-sm font-semibold group-hover:border-[var(--accent)]"
              >
                <ArrowRight size={16} />
                Enter Instructor Workspace
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function CoursesPageContent() {
  const { confirm: confirmDialog, notify, prompt: promptDialog } = useFeedbackDialog();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = searchParams?.get("workspace");

  const { data, loading, error, reload } = useApiData<Course[] | { results: Course[] }>("/courses/");
  const categories = useApiData<Category[] | { results: Category[] }>("/categories/");

  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState("");
  const [enrollingCourseId, setEnrollingCourseId] = useState<number | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [courseType, setCourseType] = useState<"FREE" | "PAID">("FREE");

  const courses = data ? unwrap(data) : [];

  function openNewCourseModal() {
    setEditingCourse(null);
    setCourseType("FREE");
    setFormError("");
    setOpen(true);
  }

  function openEditCourseModal(course: Course) {
    setEditingCourse(course);
    setCourseType(course.course_type);
    setFormError("");
    setOpen(true);
  }

  function closeCourseModal() {
    setOpen(false);
    setEditingCourse(null);
    setFormError("");
  }

  async function saveCourse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = new FormData(e.currentTarget);
    const thumbnail = body.get("thumbnail");

    if (thumbnail instanceof File && thumbnail.size === 0) {
      body.delete("thumbnail");
    }

    try {
      setBusyMessage(editingCourse ? "Saving course..." : "Creating course...");
      if (editingCourse) {
        await api(`/courses/${editingCourse.id}/`, { method: "PATCH", body });
      } else {
        await api("/courses/", { method: "POST", body });
      }
      closeCourseModal();
      await reload();
      void notify(editingCourse ? "Course updated." : "Course created.", { tone: "success" });
    } catch (x) {
      setFormError(x instanceof Error ? x.message : "Unable to save course");
    } finally {
      setBusyMessage("");
    }
  }

  async function createCategory() {
    const name = await promptDialog("Choose a name for the new category.", {
      title: "Create category",
      placeholder: "Category name",
      confirmLabel: "Create category",
    });
    if (!name) return;
    try {
      setBusyMessage("Creating category...");
      await api("/categories/", { method: "POST", body: jsonBody({ name }) });
      await categories.reload();
      void notify("Category created.", { tone: "success" });
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to create category", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function removeCourse(id: number) {
    if (
      !(await confirmDialog("This will delete the course and its related content.", {
        title: "Delete course?",
        confirmLabel: "Delete course",
        tone: "error",
      }))
    )
      return;
    try {
      setBusyMessage("Deleting course...");
      await api(`/courses/${id}/`, { method: "DELETE" });
      await reload();
      void notify("Course deleted.", { tone: "success" });
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to delete course", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function enroll(id: number) {
    setEnrollingCourseId(id);
    try {
      setBusyMessage("Confirming enrollment...");
      await api("/enrollments/", { method: "POST", body: jsonBody({ course: id }) });
      await reload();
      void notify("Enrollment confirmed.", {
        title: "Enrollment confirmed",
        tone: "success",
      });
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to enroll", { tone: "error" });
    } finally {
      setEnrollingCourseId(null);
      setBusyMessage("");
    }
  }

  // ADMIN ROUTING
  if (user?.role === "ADMIN") {
    if (workspace === "admin") {
      return <AdminCoursesWorkspace onBack={() => router.push("/courses")} />;
    }
    if (workspace === "instructors") {
      return <InstructorCoursesWorkspace onBack={() => router.push("/courses")} />;
    }
    return (
      <>
        <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />
        <AdminLandingDashboard
          onSelectWorkspace={(ws) => router.push(`/courses?workspace=${ws}`)}
          onOpenNewCourseModal={openNewCourseModal}
        />

        {/* Global Create Course Modal */}
        <Modal open={open} title={editingCourse ? "Edit course" : "Create course"} onCloseAction={closeCourseModal}>
          <form
            key={editingCourse?.id ?? "new"}
            onSubmit={saveCourse}
            className="space-y-4 p-4"
            encType="multipart/form-data"
          >
            <input className="field" name="title" placeholder="Course title" defaultValue={editingCourse?.title ?? ""} required />
            <label className="block space-y-1">
              <span className="font-semibold text-sm">Course code</span>
              <input className="field" name="course_code" placeholder="Auto-generate, or set one like CSE-201" defaultValue={editingCourse?.course_code ?? ""} />
            </label>
            <textarea className="field" name="description" placeholder="Description" rows={4} defaultValue={editingCourse?.description ?? ""} required />

            <div className="flex gap-2">
              <ModernSelect
                className="field flex-1"
                name="category"
                placeholder="Select Category"
                defaultValue={editingCourse ? String(editingCourse.category) : undefined}
                required
                options={categories.data ? unwrap(categories.data).map((c) => ({ value: String(c.id), label: c.name })) : []}
              />
              <button className="btn btn-secondary shrink-0" type="button" onClick={() => void createCategory()}>
                <Plus size={14} /> Add Category
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ModernSelect className="field" name="level" aria-label="Course level" defaultValue={editingCourse?.level ?? "BEGINNER"} options={levelOptions} />
              <ModernSelect className="field" name="status" aria-label="Course status" defaultValue={editingCourse?.status ?? "PUBLISHED"} options={statusOptions} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ModernSelect className="field" name="course_type" aria-label="Course type" value={courseType} onValueChange={(value) => setCourseType(value as "FREE" | "PAID")} options={[{ value: "FREE", label: "Free" }, { value: "PAID", label: "Paid" }]} />
              <label className="block space-y-1">
                <span className="font-semibold text-sm">Price (BDT)</span>
                <input
                  className="field"
                  name="price"
                  type="number"
                  min={courseType === "PAID" ? "0.01" : "0"}
                  step="0.01"
                  placeholder={courseType === "PAID" ? "e.g. 1500" : "Free course"}
                  defaultValue={editingCourse?.price ?? "0.00"}
                  disabled={courseType === "FREE"}
                  required={courseType === "PAID"}
                />
              </label>
            </div>

            <label className="block space-y-1 mt-2">
              <span className="font-semibold text-sm">Duration (Hours)</span>
              <input className="field" name="duration_hours" type="number" min="0" defaultValue={editingCourse?.duration_hours ?? 0} />
            </label>

            <label className="block space-y-1 mt-2">
              <span className="font-semibold text-sm">Course Image</span>
              <input className="field" name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
            </label>

            {formError && <ErrorMessage message={formError} />}

            <div className="pt-4 border-t border-[var(--border)] mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={closeCourseModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editingCourse ? "Save Course" : "Create Course"}
              </button>
            </div>
          </form>
        </Modal>
      </>
    );
  }

  // INSTRUCTOR & STUDENT VIEWS
  return (
    <>
      <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />
      <PageHeader
        title="Course Management"
        description="Browse learning content and course categories."
        action={
          user?.role !== "STUDENT" && (
            <button className="btn btn-primary inline-flex items-center gap-2" onClick={openNewCourseModal}>
              <Plus size={16} />
              New course
            </button>
          )
        }
      />

      {loading ? (
        <Loading variant="list" />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : courses.length === 0 ? (
        <Empty message="No courses available." />
      ) : user?.role === "INSTRUCTOR" ? (
        <div className="panel table-wrap">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Course</th>
                <th>Category / Level</th>
                <th>Type / Price</th>
                <th>Status</th>
                <th>Materials</th>
                <th>Students</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr
                  key={course.id}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]"
                  aria-label={`Open ${course.title}`}
                  onClick={() => router.push(`/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/courses/${course.id}`);
                    }
                  }}
                >
                  <td>
                    <div className="flex min-w-56 items-center gap-3">
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-[var(--background)] text-xs text-[var(--muted)] border border-[var(--border)]">
                          No image
                        </div>
                      )}
                      <div className="min-w-0">
                        <strong className="block truncate text-[var(--foreground)]">{course.title}</strong>
                        <span className="muted mt-1 block text-xs">{course.course_code}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong className="block font-medium">{course.category_detail?.name || "Uncategorized"}</strong>
                    <span className="muted mt-1 block text-xs">
                      {course.level.charAt(0) + course.level.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${course.course_type === "FREE" ? "text-[var(--success)]" : "text-[var(--primary)]"}`}>
                      {course.course_type === "FREE" ? "Free" : bdtFormatter.format(Number(course.price))}
                    </span>
                  </td>
                  <td><span className="badge">{course.status}</span></td>
                  <td className="font-semibold">{course.materials?.length || 0}</td>
                  <td className="font-semibold">{course.enrollment_count}</td>
                  <td>
                    <div className="flex min-w-max flex-wrap items-center gap-2">
                      <Link className="btn btn-secondary text-xs" href={`/courses/${course.id}`} onClick={(event) => event.stopPropagation()}>
                        View
                      </Link>
                      <button className="btn btn-secondary text-xs" onClick={(event) => { event.stopPropagation(); openEditCourseModal(course); }}>
                        Edit
                      </button>
                      <button className="btn btn-danger text-xs" onClick={(event) => { event.stopPropagation(); void removeCourse(course.id); }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid-cards">
          {courses.map((c) => (
            <article className="panel overflow-hidden flex flex-col" key={c.id}>
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="h-40 w-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center muted">
                  No Image
                </div>
              )}

              <div className="p-5 flex flex-col flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="badge">{c.course_code}</span>
                  <span className="badge">{c.category_detail?.name || "Uncategorized"}</span>
                  <span className={`badge ${c.course_type === "PAID" ? "text-[var(--primary)]" : "text-[var(--success)]"}`}>
                    {c.course_type === "FREE" ? "Free" : bdtFormatter.format(Number(c.price))}
                  </span>
                  {user?.role !== "STUDENT" && <span className="badge">{c.status}</span>}
                </div>

                <h2 className="text-lg font-bold mt-3">{c.title}</h2>
                <p className="muted mt-2 line-clamp-3 flex-1">{c.description}</p>
                <div className="muted mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{c.instructor_name}</span>
                  <span>{c.level.charAt(0) + c.level.slice(1).toLowerCase()}</span>
                  <span>{c.duration_hours} {c.duration_hours === 1 ? "hour" : "hours"}</span>
                  <span>{c.enrollment_count} enrolled</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <Link className="btn btn-secondary" href={`/courses/${c.id}`}>
                    View course
                  </Link>

                  {user?.role === "STUDENT" && (
                    c.is_enrolled ? (
                      <span className="badge self-center" aria-label="Enrollment status">
                        Enrolled
                      </span>
                    ) : (
                      <button
                        className="btn btn-primary"
                        disabled={enrollingCourseId === c.id}
                        onClick={() => c.course_type === "PAID" ? window.location.assign(`/payments?course=${c.id}`) : void enroll(c.id)}
                      >
                        {enrollingCourseId === c.id ? "Enrolling…" : c.course_type === "PAID" ? "Submit payment" : "Enroll"}
                      </button>
                    )
                  )}

                  {user?.role !== "STUDENT" && (
                    <>
                      <button className="btn btn-secondary" onClick={() => openEditCourseModal(c)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => void removeCourse(c.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={open} title={editingCourse ? "Edit course" : "Create course"} onCloseAction={closeCourseModal}>
        <form
          key={editingCourse?.id ?? "new"}
          onSubmit={saveCourse}
          className="space-y-4 p-4"
          encType="multipart/form-data"
        >
          <input className="field" name="title" placeholder="Course title" defaultValue={editingCourse?.title ?? ""} required />
          <label className="block space-y-1">
            <span className="font-semibold text-sm">Course code</span>
            <input className="field" name="course_code" placeholder="Auto-generate, or set one like CSE-201" defaultValue={editingCourse?.course_code ?? ""} />
          </label>
          <textarea className="field" name="description" placeholder="Description" rows={4} defaultValue={editingCourse?.description ?? ""} required />

          <div className="flex gap-2">
            <ModernSelect
              className="field flex-1"
              name="category"
              placeholder="Select Category"
              defaultValue={editingCourse ? String(editingCourse.category) : undefined}
              required
              options={categories.data ? unwrap(categories.data).map((c) => ({ value: String(c.id), label: c.name })) : []}
            />
            {user?.role !== "STUDENT" && (
              <button className="btn btn-secondary shrink-0" type="button" onClick={() => void createCategory()}>
                <Plus size={14} /> Add Category
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect className="field" name="level" aria-label="Course level" defaultValue={editingCourse?.level ?? "BEGINNER"} options={levelOptions} />
            <ModernSelect className="field" name="status" aria-label="Course status" defaultValue={editingCourse?.status ?? "PUBLISHED"} options={statusOptions} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ModernSelect className="field" name="course_type" aria-label="Course type" value={courseType} onValueChange={(value) => setCourseType(value as "FREE" | "PAID")} options={[{ value: "FREE", label: "Free" }, { value: "PAID", label: "Paid" }]} />
            <label className="block space-y-1">
              <span className="font-semibold text-sm">Price (BDT)</span>
              <input
                className="field"
                name="price"
                type="number"
                min={courseType === "PAID" ? "0.01" : "0"}
                step="0.01"
                placeholder={courseType === "PAID" ? "e.g. 1500" : "Free course"}
                defaultValue={editingCourse?.price ?? "0.00"}
                disabled={courseType === "FREE"}
                required={courseType === "PAID"}
              />
            </label>
          </div>

          <label className="block space-y-1 mt-2">
            <span className="font-semibold text-sm">Duration (Hours)</span>
            <input className="field" name="duration_hours" type="number" min="0" defaultValue={editingCourse?.duration_hours ?? 0} />
          </label>

          <label className="block space-y-1 mt-2">
            <span className="font-semibold text-sm">Course Image</span>
            <input className="field" name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
          </label>

          {formError && <ErrorMessage message={formError} />}

          <div className="pt-4 border-t border-[var(--border)] mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={closeCourseModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingCourse ? "Save Course" : "Create Course"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CoursesPage() {
  return (
    <Suspense fallback={<Loading variant="page" />}>
      <CoursesPageContent />
    </Suspense>
  );
}
