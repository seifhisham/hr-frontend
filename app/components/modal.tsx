"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          title="Close"
          aria-label="Close"
          onClick={close}
        >
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Badge({ value }: { value: string }) {
  const tone = [
    "On time",
    "Active",
    "approved",
    "Approved leave",
    "Approved holiday",
  ].includes(value)
    ? "success"
    : ["Late", "Missing check-out", "pending"].includes(value)
      ? "warning"
      : "neutral";
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {value}
    </span>
  );
}
