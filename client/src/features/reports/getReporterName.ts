import type { Report } from "./reportsSlice";

type Opts = { currentUserId?: string; currentUserName?: string };

export function getReporterName(r: Report, opts?: Opts): string {
  if (r.createdByName ?? "") return r.createdByName as string;

  const createdById =
    typeof r.createdBy === "string" ? r.createdBy : r.createdBy?._id;

  if (createdById) {
    if (opts?.currentUserId && createdById === opts.currentUserId) {
      return opts.currentUserName ?? "You";
    }
    if (typeof r.createdBy === "object" && r.createdBy) {
      if (r.createdBy.name) return r.createdBy.name;
      const parts = [r.createdBy.firstName, r.createdBy.lastName].filter(
        Boolean
      );
      if (parts.length) return parts.join(" ");
    }
  }

  return "Guest";
}
