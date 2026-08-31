"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit,
  Eye,
  Filter,
  Layers,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { Category, Course } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";
import { useFeedbackDialog } from "@/components/feedback-dialog-provider";

const levelOptions = [
  { value: "ALL", label: "All Levels" },
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const formLevelOptions = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const statusOptions = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const formStatusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const typeOptions = [
  { value: "ALL", label: "All Types" },
  { value: "FREE", label: "Free" },
  { value: "PAID", label: "Paid" },
];

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function AdminCoursesWorkspace({ onBack }: { onBack?: () => void }) {
  const { confirm: confirmDialog, notify, prompt: promptDialog } = useFeedbackDialog();
  const { user } = useAuth();
  const router = useRouter();

  const { data, loading, error, reload } = useApiData<Course[] | { results: Course[] }>("/courses/");
  const categories = useApiData<Category[] | { results: Category[] }>("/categories/");

  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formError, setFormError] = useState("");
  const [busyMessage, setBusyMessage] = useState("");
  const [courseType, setCourseType] = useState<"FREE" | "PAID">("FREE");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  const allCourses = data ? unwrap(data) : [];
  // Filter for admin-owned courses (no instructor assigned or instructor is null)
  const adminCourses = useMemo(() => {
    return allCourses.filter((c) => !c.instructor);
  }, [allCourses]);

  const filteredCourses = useMemo(() => {
    return adminCourses.filter((course) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = course.title.toLowerCase().includes(q);
        const matchesCode = (course.course_code || "").toLowerCase().includes(q);
        const matchesDesc = course.description.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode && !matchesDesc) return false;
      }

      if (selectedCategory !== "ALL" && String(course.category) !== selectedCategory) {
        return false;
      }

      if (selectedStatus !== "ALL" && course.status !== selectedStatus) {
        return false;
      }

      if (selectedLevel !== "ALL" && course.level !== selectedLevel) {
        return false;
      }

      if (selectedType !== "ALL" && course.course_type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [adminCourses, searchQuery, selectedCategory, selectedStatus, selectedLevel, selectedType]);

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
      void notify(editingCourse ? "Course updated successfully." : "Course created successfully.", {
        tone: "success",
      });
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
      !(await confirmDialog("This will permanently delete the admin course and its learning materials.", {
        title: "Delete admin course?",
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

  const categoryFilterOptions = [
    { value: "ALL", label: "All Categories" },
    ...(categories.data
      ? unwrap(categories.data).map((c) => ({ value: String(c.id), label: c.name }))
      : []),
  ];

  return (
    <>
      <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage} />

      {/* Navigation Breadcrumb Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack || (() => router.push("/courses"))}
            className="btn btn-secondary text-sm inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Overview
          </button>
          <div className="flex items-center gap-2">
            <span className="badge font-medium text-xs bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]">
              <Shield size={13} className="mr-1 inline" /> Admin Owned Workspace
            </span>
          </div>
        </div>

        <PageHeader
          title="Course Management: Admin"
          description="Create, configure, and manage platform-owned courses with full administrative privileges."
          action={
            <button className="btn btn-primary inline-flex items-center gap-2" onClick={openNewCourseModal}>
              <Plus size={16} />
              New course
            </button>
          }
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="panel p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field w-full !pl-10 text-sm"
            />
          </div>

          <ModernSelect
            className="field text-sm"
            value={selectedCategory}
            onValueChange={(val) => setSelectedCategory(val)}
            options={categoryFilterOptions}
            aria-label="Filter by category"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedStatus}
            onValueChange={(val) => setSelectedStatus(val)}
            options={statusOptions}
            aria-label="Filter by status"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedLevel}
            onValueChange={(val) => setSelectedLevel(val)}
            options={levelOptions}
            aria-label="Filter by level"
          />

          <ModernSelect
            className="field text-sm"
            value={selectedType}
            onValueChange={(val) => setSelectedType(val)}
            options={typeOptions}
            aria-label="Filter by pricing type"
          />
        </div>

        <div className="flex items-center justify-between text-xs muted pt-1">
          <span>
            Showing <strong>{filteredCourses.length}</strong> of <strong>{adminCourses.length}</strong> admin courses
          </span>
          {(searchQuery || selectedCategory !== "ALL" || selectedStatus !== "ALL" || selectedLevel !== "ALL" || selectedType !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("ALL");
                setSelectedStatus("ALL");
                setSelectedLevel("ALL");
                setSelectedType("ALL");
              }}
              className="text-[var(--primary)] hover:underline font-medium"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Content Table */}
      {loading ? (
        <Loading variant="table" />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : filteredCourses.length === 0 ? (
        <Empty message={adminCourses.length === 0 ? "No admin courses created yet. Click 'New course' to create one." : "No courses match your active filters."} />
      ) : (
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
              {filteredCourses.map((course) => (
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
                        <span className="muted mt-1 block text-xs">{course.course_code || "No code"}</span>
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
                    <span
                      className={`badge ${
                        course.course_type === "FREE"
                          ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
                          : "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
                      }`}
                    >
                      {course.course_type === "FREE" ? "Free" : bdtFormatter.format(Number(course.price))}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        course.status === "PUBLISHED"
                          ? "badge-success"
                          : course.status === "DRAFT"
                          ? "badge-warning"
                          : ""
                      }`}
                    >
                      {course.status}
                    </span>
                  </td>
                  <td className="font-semibold">{course.materials?.length || 0}</td>
                  <td className="font-semibold">{course.enrollment_count}</td>
                  <td>
                    <div className="flex min-w-max flex-wrap items-center gap-2">
                      <Link
                        className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
                        href={`/courses/${course.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Eye size={14} />
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditCourseModal(course);
                        }}
                      >
                        <Edit size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs inline-flex items-center gap-1.5"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeCourse(course.id);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Course Modal */}
      <Modal open={open} title={editingCourse ? "Edit admin course" : "Create admin course"} onCloseAction={closeCourseModal}>
        <form
          key={editingCourse?.id ?? "new"}
          onSubmit={saveCourse}
          className="space-y-4 p-4"
          encType="multipart/form-data"
        >
          <input
            className="field"
            name="title"
            placeholder="Course title"
            defaultValue={editingCourse?.title ?? ""}
            required
          />
          <label className="block space-y-1">
            <span className="font-semibold text-sm">Course code</span>
            <input
              className="field"
              name="course_code"
              placeholder="Auto-generate, or set one like CSE-201"
              defaultValue={editingCourse?.course_code ?? ""}
            />
          </label>
          <textarea
            className="field"
            name="description"
            placeholder="Description"
            rows={4}
            defaultValue={editingCourse?.description ?? ""}
            required
          />

          <div className="flex gap-2">
            <ModernSelect
              className="field flex-1"
              name="category"
              placeholder="Select Category"
              defaultValue={editingCourse ? String(editingCourse.category) : undefined}
              required
              options={
                categories.data
                  ? unwrap(categories.data).map((c) => ({ value: String(c.id), label: c.name }))
                  : []
              }
            />
            <button className="btn btn-secondary shrink-0" type="button" onClick={() => void createCategory()}>
              <Plus size={14} /> Add Category
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect
              className="field"
              name="level"
              aria-label="Course level"
              defaultValue={editingCourse?.level ?? "BEGINNER"}
              options={formLevelOptions}
            />
            <ModernSelect
              className="field"
              name="status"
              aria-label="Course status"
              defaultValue={editingCourse?.status ?? "PUBLISHED"}
              options={formStatusOptions}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModernSelect
              className="field"
              name="course_type"
              aria-label="Course type"
              value={courseType}
              onValueChange={(value) => setCourseType(value as "FREE" | "PAID")}
              options={[
                { value: "FREE", label: "Free" },
                { value: "PAID", label: "Paid" },
              ]}
            />
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
            <input
              className="field"
              name="duration_hours"
              type="number"
              min="0"
              defaultValue={editingCourse?.duration_hours ?? 0}
            />
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
              {editingCourse ? "Save Changes" : "Create Course"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
