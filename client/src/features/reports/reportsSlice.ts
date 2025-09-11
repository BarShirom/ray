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

export interface ReportUser {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface Report {
  updatedAt: string;
  distanceKm: number | null;
  _id: string;
  description: string;
  type: ReportType;
  status: ReportStatus;
  createdAt: string;
  createdBy?: ReportUser | null;
  createdByName?: string | null;
  assignedTo?: ReportUser | null;
  assignedToName?: string | null;
  media?: string[];
  location: { lat: number; lng: number; address?: string | null };
}

type ReportsState = Report[];


const initialState: ReportsState = [];

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    addReport(state, action: PayloadAction<Report>) {
      state.unshift(action.payload);
    },
    updateReportStatus(
      state,
      action: PayloadAction<{
        _id: string;
        status: ReportStatus;
        assignedTo?: Report["assignedTo"];
      }>
    ) {
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) {
        state[idx] = {
          ...state[idx],
          status: action.payload.status,
          ...(action.payload.assignedTo !== undefined
            ? { assignedTo: action.payload.assignedTo }
            : {}),
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchReports.fulfilled, (_state, action) => {
     
      return Array.isArray(action.payload) ? action.payload : [];
    });

    builder.addCase(fetchMyReports.fulfilled, (_state, action) => {
      return Array.isArray(action.payload) ? action.payload : [];
    });

    builder.addCase(createReport.fulfilled, (state, action) => {
      
      if (action.payload) state.unshift(action.payload);
    });

    builder.addCase(claimReport.fulfilled, (state, action) => {
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) state[idx] = action.payload;
    });

    builder.addCase(resolveReport.fulfilled, (state, action) => {
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) state[idx] = action.payload;
    });
  },
});

export const { addReport, updateReportStatus } = reportsSlice.actions;
export default reportsSlice.reducer;
