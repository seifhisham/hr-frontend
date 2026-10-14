export function auditLabel(value: string): string {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditFields(value: unknown, path = ""): { field: string; value: string }[] {
  if (value === null || value === undefined) return path ? [{ field: path, value: "Not set" }] : [];
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return [{ field: path || "Details", value: "None" }];
    return entries.flatMap(([key, item]) => auditFields(item, [path, Array.isArray(value) ? `Item ${Number(key) + 1}` : auditLabel(key)].filter(Boolean).join(" / ")));
  }
  return [{ field: path || "Value", value: typeof value === "boolean" ? value ? "Yes" : "No" : String(value) || "Empty" }];
}
