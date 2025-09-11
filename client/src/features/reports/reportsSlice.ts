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

/* ---------- merge helper (no any) ---------- */
function isString(u: unknown): u is string {
  return typeof u === "string";
}
function isNullish(u: unknown): u is null | undefined {
  return u === null || u === undefined;
}
function getUnknownProp<T extends string>(obj: unknown, key: T): unknown {
  if (
    typeof obj === "object" &&
    obj !== null &&
    key in (obj as Record<string, unknown>)
  ) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Merge while preserving names/address/distance when the payload is partial.
 * Also tolerates servers that sometimes return createdBy/assignedTo as a plain string id.
 */
function mergePreserve(prev: Report, next: Report): Report {
  const merged: Report = { ...prev, ...next };

  // createdBy: keep previous if next is missing or just a string id
  const nextCreatedByUnknown = getUnknownProp(next, "createdBy");
  if (isNullish(nextCreatedByUnknown) || isString(nextCreatedByUnknown)) {
    merged.createdBy = prev.createdBy;
  }

  // createdByName: keep previous if missing/empty
  if (isNullish(next.createdByName) || next.createdByName === "") {
    merged.createdByName = prev.createdByName;
  }

  // assignedTo: keep previous if next is missing or just a string id
  const nextAssignedToUnknown = getUnknownProp(next, "assignedTo");
  if (isNullish(nextAssignedToUnknown) || isString(nextAssignedToUnknown)) {
    merged.assignedTo = prev.assignedTo;
  }

  // assignedToName: keep previous if missing/empty
  if (isNullish(next.assignedToName) || next.assignedToName === "") {
    merged.assignedToName = prev.assignedToName;
  }

  // location.address: preserve if patch didn't include it
  if (
    prev.location?.address &&
    (isNullish(next.location) || isNullish(next.location.address))
  ) {
    merged.location = { ...merged.location, address: prev.location.address };
  }

  // distanceKm: preserve if patch omitted it
  if (isNullish((next as Partial<Report>).distanceKm)) {
    merged.distanceKm = prev.distanceKm;
  }

  return merged;
}

/* ---------- slice ---------- */
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
    builder.addCase(fetchReports.fulfilled, (_state, action) =>
      Array.isArray(action.payload) ? action.payload : []
    );

    builder.addCase(fetchMyReports.fulfilled, (_state, action) =>
      Array.isArray(action.payload) ? action.payload : []
    );

    // create → upsert + merge (if server echoes an existing one)
    builder.addCase(createReport.fulfilled, (state, action) => {
      if (!action.payload) return;
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx === -1) state.unshift(action.payload);
      else state[idx] = mergePreserve(state[idx], action.payload);
    });

    // claim/resolve → merge & preserve names if server returns a minimal patch
    builder.addCase(claimReport.fulfilled, (state, action) => {
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) state[idx] = mergePreserve(state[idx], action.payload);
    });

    builder.addCase(resolveReport.fulfilled, (state, action) => {
      const idx = state.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) state[idx] = mergePreserve(state[idx], action.payload);
    });
  },
});

export const { addReport, updateReportStatus } = reportsSlice.actions;
export default reportsSlice.reducer;
