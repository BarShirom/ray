import type { ReportRecord, ReportUserSummary } from "../reports/reportStore.js";
import { reportFullName } from "../reports/reportNames.js";

function serializeUser(user: ReportUserSummary | null | undefined) {
  if (user == null) return user;
  return { _id: user.publicId, firstName: user.firstName, lastName: user.lastName, name: user.name };
}

export function serializeReport(report: ReportRecord) {
  return {
    _id: report.publicId,
    description: report.description,
    type: report.type,
    status: report.status,
    location: report.location == null ? report.location : { lat: report.location.lat, lng: report.location.lng },
    media: report.media == null ? report.media : [...report.media],
    createdBy: serializeUser(report.createdBy),
    assignedTo: serializeUser(report.assignedTo),
    createdByName: report.createdByName ?? reportFullName(report.createdBy) ?? null,
    assignedToName: report.assignedToName ?? reportFullName(report.assignedTo) ?? null,
    createdAt: report.createdAt == null ? report.createdAt : report.createdAt.toJSON(),
    updatedAt: report.updatedAt == null ? report.updatedAt : report.updatedAt.toJSON(),
    ...(report.legacyVersion === undefined ? {} : { __v: report.legacyVersion }),
  };
}
