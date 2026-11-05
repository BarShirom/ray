import { reportAssigneeId, type Report } from "../../features/reports/reportsSlice";

// Presentation eligibility only. Existing parent handlers and server transitions
// remain authoritative for every mutation.
export function reportActionFor(report: Report, loggedIn: boolean, userId: string | null): "claim" | "resolve" | null {
  if (!loggedIn) return null;
  if (report.status === "new") return "claim";
  if (report.status === "in-progress" && reportAssigneeId(report.assignedTo) === userId) return "resolve";
  return null;
}
