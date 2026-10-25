import type { Report } from "./reportsSlice";
import { t } from "../../i18n";

export function getAssigneeName(r: Report): string {
  if (r.assignedToName) return r.assignedToName;
  const u = r.assignedTo;
  if (!u || typeof u === "string") return t("reports.unassigned");
  if (u.name) return u.name;
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : t("reports.unassigned");
}
