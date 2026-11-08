"use client";
import { useState } from "react";
import { save, type Employee } from "../../lib/api";
import { Modal } from "./modal";

export function EmployeeDelete({
  employee,
  close,
  deleted,
}: {
  employee: Employee;
  close: () => void;
  deleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await save(`/employees/${encodeURIComponent(employee.id)}`, "DELETE");
      deleted();
      close();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to delete employee",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Delete employee"
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="form-grid">
        <p style={{ gridColumn: "1 / -1" }}>
          Delete <strong>{employee.name}</strong> ({employee.employeeNumber})
          from the employee directory? Their sign-in access will be revoked.
          Attendance, requests, bank details and payroll history will be
          retained.
        </p>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={close}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Deleting..." : "Delete employee"}
        </button>
      </div>
    </Modal>
  );
}
