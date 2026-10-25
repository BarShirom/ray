import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";
import { selectToken, selectUserId } from "../auth/authSelectors";
import { reportAssigneeId, type AssignedReportsState, type Report, type ReportStatus, type ReportType } from "./reportsSlice";

const emptyReports: Report[] = [];
const unavailableAssigned: AssignedReportsState = {
  items: emptyReports, status: "idle", error: null, userId: null, token: null,
  requestId: null, changedIds: [], mutationRequests: [],
};

export const selectAllReports = (state: RootState): Report[] => state.reports?.items ?? emptyReports;

export const selectAssignedReportsState = (state: RootState): AssignedReportsState => {
  const assigned = state.reports.assigned;
  return !state.auth.loading && !!selectUserId(state) && !!selectToken(state)
    && assigned.userId === selectUserId(state) && assigned.token === selectToken(state)
    ? assigned : unavailableAssigned;
};

function reportTimestamp(report: Report): number {
  const updated = Date.parse(report.updatedAt);
  const created = Date.parse(report.createdAt);
  return Number.isFinite(updated) ? updated : Number.isFinite(created) ? created : 0;
}

export const selectAssignedReports = createSelector(
  [selectAssignedReportsState, selectUserId],
  (assigned, userId): Report[] => assigned.status === "unauthorized" ? emptyReports : assigned.items
    .filter((report) => reportAssigneeId(report.assignedTo) === userId)
    .sort((a, b) => reportTimestamp(b) - reportTimestamp(a)),
);

export const selectReportsByStatus = (status: ReportStatus) => (state: RootState): Report[] =>
  selectAllReports(state).filter((report) => report.status === status);

export const selectReportsByType = (type: ReportType) => (state: RootState): Report[] =>
  selectAllReports(state).filter((report) => report.type === type);

export const selectReportById = (id: string) => (state: RootState): Report | undefined =>
  selectAllReports(state).find((report) => report._id === id);
