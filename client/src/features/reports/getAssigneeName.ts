import type { Report } from "./reportsSlice";

export function getAssigneeName(r: Report): string {
  if (r.assignedToName) return r.assignedToName;
  const u = r.assignedTo;
  if (!u) return "—";
  if (u.name) return u.name;
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}
