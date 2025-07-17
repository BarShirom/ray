import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ReportType = "emergency" | "food" | "general";
export type ReportStatus = "new" | "in-progress" | "resolved";

export interface Report {
  id: string;
  description: string;
  location: { lat: number; lng: number };
  type: ReportType;
  status: ReportStatus;
  createdAt: string;
  createdBy: string | null;
}

const initialState: Report[] = [];

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    addReport: (state, action: PayloadAction<Report>) => {
      state.push(action.payload);
    },
    updateReportStatus: (
      state,
      action: PayloadAction<{ id: string; status: ReportStatus }>
    ) => {
      const report = state.find((r) => r.id === action.payload.id);
      if (report) report.status = action.payload.status;
    },
  },
});

export const { addReport, updateReportStatus } = reportsSlice.actions;
export default reportsSlice.reducer;
