"use client";
import { useState } from "react";
import { api, jsonBody, unwrap } from "@/lib/api";
import type { User } from "@/lib/types";
import { Empty, ErrorMessage, Loading, PageHeader, Modal, LoadingModal } from "@/components/ui";
import { useApiData } from "@/hooks/use-api-data";

export function UsersPage() {
  const list = useApiData<User[] | { results: User[] }>("/users/");
  const rows = list.data ? unwrap(list.data) : [];
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function toggle(u: User) {
    await api(`/users/${u.id}/`, {
      method: "PATCH",
      body: jsonBody({ is_active: !u.is_active }),
    });
    await list.reload();
  }

  async function performDelete(u: User) {
    setIsDeleting(true);
    try {
      await api(`/users/${u.id}/`, { method: "DELETE" });
      await list.reload();
    } finally {
      setIsDeleting(false);
      setUserToDelete(null);
    }
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Manage Student and Admin access rights."
      />
      {list.loading ? (
        <Loading variant="table" />
      ) : list.error ? (
        <ErrorMessage message={list.error} />
      ) : !rows.length ? (
        <Empty message="No users." />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <div className="muted">{u.email}</div>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.department}</td>
                  <td>{u.is_active ? "Active" : "Inactive"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className={
                          u.is_active ? "btn btn-danger" : "btn btn-secondary"
                        }
                        onClick={() => void toggle(u)}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => setUserToDelete(u)}
                      >
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
      {userToDelete && (
        <Modal
          open={!!userToDelete}
          title="Confirm Deletion"
          onCloseAction={() => setUserToDelete(null)}
        >
          <p className="mb-4">
            Are you sure you want to delete user <strong>{userToDelete.name}</strong>?
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <button
              className="btn btn-secondary"
              onClick={() => setUserToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => void performDelete(userToDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </Modal>
      )}
      <LoadingModal open={isDeleting} title="Deleting User" message="Please wait..." />
    </>
  );
}
