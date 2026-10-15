"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type { SaveToast as Toast } from "../../lib/save-toast";

export function SaveToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const updateHost = () => setHost(document.querySelector<HTMLElement>("dialog[open]") ?? document.body);
    updateHost();
    // Keep notifications accessible inside a modal, then move them out when it closes.
    const observer = new MutationObserver(updateHost);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const receive = (event: Event) => setToast((event as CustomEvent<Toast | null>).detail);
    window.addEventListener("save-notification", receive);
    return () => window.removeEventListener("save-notification", receive);
  }, []);
  useEffect(() => {
    if (!toast) return;
    // Popovers render above native modal dialogs as well as the dashboard.
    if (ref.current?.isConnected) ref.current.showPopover?.();
    const timeout = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [toast, host]);
  if (!toast || !host) return null;
  return createPortal(
    <div ref={ref} popover="manual" className={`settings-save-toast ${toast.tone}`}>
      {toast.tone === "success" ? <CheckCircle2 size={21} aria-hidden="true" /> : <AlertCircle size={21} aria-hidden="true" />}
      <div role={toast.tone === "error" ? "alert" : "status"}>
        <strong>{toast.tone === "success" ? "Changes saved" : toast.tone === "warning" ? "Saved with a refresh issue" : "Save could not be confirmed"}</strong>
        <p>{toast.message}</p>
      </div>
      <button type="button" aria-label="Dismiss save notification" onClick={() => setToast(null)}><X size={18} aria-hidden="true" /></button>
    </div>,
    host,
  );
}
