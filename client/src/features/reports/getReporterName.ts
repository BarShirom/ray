// features/reports/getReporterName.ts
import type { Report } from "./reportsSlice";

export function getReporterName(r: Report): string {
  if (r.createdByName) return r.createdByName;
  const u = r.createdBy;
  if (!u) return "Guest";
  if (u.name) return u.name;
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : "Guest";
}
