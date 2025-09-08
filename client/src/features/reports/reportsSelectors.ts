import type { RootState } from "../../app/store";
import type { Report, ReportStatus, ReportType } from "./reportsSlice";

/** Always return an array, even if state.reports is undefined/null */
export const selectAllReports = (state: RootState): Report[] => {
  const raw = state.reports as unknown;
  return Array.isArray(raw) ? raw : [];
};

export const selectReportsByStatus =
  (status: ReportStatus) =>
  (state: RootState): Report[] =>
    selectAllReports(state).filter((r) => r.status === status);

export const selectReportsByType =
  (type: ReportType) =>
  (state: RootState): Report[] =>
    selectAllReports(state).filter((r) => r.type === type);

export const selectReportById =
  (id: string) =>
  (state: RootState): Report | undefined =>
    selectAllReports(state).find((r) => r._id === id);

// import type { RootState } from "../../app/store";
// import type { Report, ReportStatus, ReportType } from "./reportsSlice";

// export const selectAllReports = (state: RootState): Report[] => state.reports;

// export const selectReportsByStatus =
//   (status: ReportStatus) => (state: RootState) =>
//     state.reports.filter((report) => report.status === status);

// export const selectReportsByType = (type: ReportType) => (state: RootState) =>
//   state.reports.filter((report) => report.type === type);

// export const selectReportById = (id: string) => (state: RootState) =>
//   state.reports.find((r) => r._id === id);
