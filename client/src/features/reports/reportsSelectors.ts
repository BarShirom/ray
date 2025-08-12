import type { RootState } from "../../app/store";
import type { Report, ReportStatus, ReportType } from "./reportsSlice";

export const selectAllReports = (state: RootState): Report[] => state.reports;

export const selectReportsByStatus =
  (status: ReportStatus) => (state: RootState) =>
    state.reports.filter((report) => report.status === status);

export const selectReportsByType = (type: ReportType) => (state: RootState) =>
  state.reports.filter((report) => report.type === type);

export const selectReportById = (id: string) => (state: RootState) =>
  state.reports.find((r) => r._id === id);
