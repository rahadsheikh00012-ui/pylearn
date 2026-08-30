"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Category, Course } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";

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

export function CoursesPage() {
  const { confirm: confirmDialog, notify, prompt: promptDialog } = useFeedbackDialog();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData<Course[] | { results: Course[] }>("/courses/");
  const categories = useApiData<Category[] | { results: Category[] }>("/categories/");

  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState("");
  const [enrollingCourseId, setEnrollingCourseId] = useState<number | null>(null);
  const [busyMessage, setBusyMessage] = useState("");

  const courses = data ? unwrap(data) : [];

  function openNewCourseModal() {
    setEditingCourse(null);
    setFormError("");
    setOpen(true);
  }

  function openEditCourseModal(course: Course) {
    setEditingCourse(course);
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

    // Remove empty file object if user didn't select an image
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
    } catch (x) {
      void notify(x instanceof Error ? x.message : "Unable to create category", { tone: "error" });
    } finally {
      setBusyMessage("");
    }
  }

  async function removeCourse(id: number) {
    if (!await confirmDialog("This will delete the course and its related content.", {
      title: "Delete course?",
      confirmLabel: "Delete course",
      tone: "error",
    })) return;
    try {
      setBusyMessage("Deleting course...");
      await api(`/courses/${id}/`, { method: "DELETE" });
      await reload();
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

  return (
    <>
      <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />
      <PageHeader
        title="Course Management"
        description="Browse learning content and course categories."
        action={
          user?.role !== "STUDENT" && (
            <button className="btn btn-primary" onClick={openNewCourseModal}>
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
      ) : (
        <div className="grid-cards">
          {courses.map(c => (
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
                  <span className="badge">{c.category_detail?.name || 'Uncategorized'}</span>
                  <span className="badge">{c.course_type === "FREE" ? "Free" : `${c.currency} ${c.price}`}</span>
                  {user?.role !== "STUDENT" && <span className="badge">{c.status}</span>}
                </div>

                <h2 className="text-lg font-bold mt-3">{c.title}</h2>
                <p className="muted mt-2 line-clamp-3 flex-1">{c.description}</p>

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
              defaultValue={editingCourse?.category}
              required
              options={categories.data ? unwrap(categories.data).map(c => ({ value: c.id, label: c.name })) : []}
            />
            {user?.role === "ADMIN" && <button className="btn btn-secondary" type="button" onClick={() => void createCategory()}>
              Add New
            </button>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect className="field" name="level" aria-label="Course level" defaultValue={editingCourse?.level ?? "BEGINNER"} options={levelOptions} />
            <ModernSelect className="field" name="status" aria-label="Course status" defaultValue={editingCourse?.status ?? "PUBLISHED"} options={statusOptions} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ModernSelect className="field" name="course_type" aria-label="Course type" defaultValue={editingCourse?.course_type ?? "FREE"} options={[{value:"FREE",label:"Free"},{value:"PAID",label:"Paid"}]} />
            <input className="field" name="price" type="number" min="0" step="0.01" placeholder="Price in BDT" defaultValue={editingCourse?.price ?? "0.00"} />
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

          <div className="pt-4 border-t border-[var(--border)] mt-4">
            <button className="btn btn-primary w-full">{editingCourse ? "Save Course" : "Create Course"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
