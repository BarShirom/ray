import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  createReport,
  fetchReports,
  fetchMyReports,
  claimReport,
  resolveReport,
} from "./reportsThunks";

export type ReportType = "emergency" | "food" | "general";
export type ReportStatus = "new" | "in-progress" | "resolved";

export interface Report {
  updatedAt: string;
  distanceKm: number | null;
  _id: string;
  description: string;
  location: { lat: number; lng: number };
  type: ReportType;
  status: ReportStatus;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  media: string[];
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
      const report = state.find((r) => r._id === action.payload.id);
      if (report) {
        report.status = action.payload.status;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchReports.fulfilled, (_state, action) => {
      return action.payload;
    });

    builder.addCase(fetchMyReports.fulfilled, (_state, action) => {
      return action.payload;
    });

    builder.addCase(createReport.fulfilled, (state, action) => {
      state.push(action.payload);
    });

    builder.addCase(claimReport.fulfilled, (state, action) => {
      const index = state.findIndex((r) => r._id === action.payload._id);
      if (index !== -1) state[index] = action.payload;
    });

    builder.addCase(resolveReport.fulfilled, (state, action) => {
      const index = state.findIndex((r) => r._id === action.payload._id);
      if (index !== -1) state[index] = action.payload;
    });
  },
});

export const { addReport, updateReportStatus } = reportsSlice.actions;
export default reportsSlice.reducer;
