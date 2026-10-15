export type SaveToast = { tone: "success" | "error" | "warning"; message: string };
export function notifySave(toast: SaveToast | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("save-notification", { detail: toast }));
}
