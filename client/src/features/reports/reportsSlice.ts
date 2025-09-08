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
  type: ReportType;
  status: ReportStatus;
  createdAt: string;
  createdBy?: { _id: string; name: string } | null;
  assignedTo?: { _id: string; name: string } | null;
  media?: string[]; // urls
  location: { lat: number; lng: number; address?: string | null };
}

type ReportsState = Report[];

// ✅ Ensure initial state is always an array
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
      // ✅ Replace with fetched array
      return Array.isArray(action.payload) ? action.payload : [];
    });

    builder.addCase(fetchMyReports.fulfilled, (_state, action) => {
      return Array.isArray(action.payload) ? action.payload : [];
    });

    builder.addCase(createReport.fulfilled, (state, action) => {
      // prepend newly created report
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

// import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
// import {
//   createReport,
//   fetchReports,
//   fetchMyReports,
//   claimReport,
//   resolveReport,
// } from "./reportsThunks";

// export type ReportType = "emergency" | "food" | "general";
// export type ReportStatus = "new" | "in-progress" | "resolved";

// export interface Report {
//   updatedAt: string;
//   distanceKm: number | null;
//   _id: string;
//   description: string;
//   location: { lat: number; lng: number };
//   type: ReportType;
//   status: ReportStatus;
//   createdAt: string;
//   createdBy: string | null;
//   createdByName: string | null;
//   assignedTo: string | null;
//   assignedToName: string | null;
//   media: string[];
// }

// const initialState: Report[] = [];

// const reportsSlice = createSlice({
//   name: "reports",
//   initialState,
//   reducers: {
//     addReport: (state, action: PayloadAction<Report>) => {
//       state.push(action.payload);
//     },
//     updateReportStatus: (
//       state,
//       action: PayloadAction<{ id: string; status: ReportStatus }>
//     ) => {
//       const report = state.find((r) => r._id === action.payload.id);
//       if (report) {
//         report.status = action.payload.status;
//       }
//     },
//   },
//   extraReducers: (builder) => {
//     builder.addCase(fetchReports.fulfilled, (_state, action) => {
//       return action.payload;
//     });

//     builder.addCase(fetchMyReports.fulfilled, (_state, action) => {
//       return action.payload;
//     });

//     builder.addCase(createReport.fulfilled, (state, action) => {
//       state.push(action.payload);
//     });

//     builder.addCase(claimReport.fulfilled, (state, action) => {
//       const index = state.findIndex((r) => r._id === action.payload._id);
//       if (index !== -1) state[index] = action.payload;
//     });

//     builder.addCase(resolveReport.fulfilled, (state, action) => {
//       const index = state.findIndex((r) => r._id === action.payload._id);
//       if (index !== -1) state[index] = action.payload;
//     });
//   },
// });

// export const { addReport, updateReportStatus } = reportsSlice.actions;
// export default reportsSlice.reducer;
