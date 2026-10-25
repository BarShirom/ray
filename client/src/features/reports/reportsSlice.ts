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

type ReportAssignee = { _id?: string; id?: string; name?: string; firstName?: string; lastName?: string } | string | null;
export const reportAssigneeId = (value: ReportAssignee | undefined): string | null =>
  typeof value === "string" ? value : value?._id ?? value?.id ?? null;

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
  assignedTo?: ReportAssignee;
  assignedToName?: string | null;
  media?: string[];
  location: { lat: number; lng: number; address?: string | null };
}

export interface AssignedReportsState {
  items: Report[];
  status: "idle" | "loading" | "succeeded" | "failed" | "unauthorized";
  error: string | null;
  userId: string | null;
  token: string | null;
  requestId: string | null;
  changedIds: string[];
  mutationRequests: string[];
}

const emptyAssigned = (): AssignedReportsState => ({
  items: [], status: "idle", error: null, userId: null, token: null,
  requestId: null, changedIds: [], mutationRequests: [],
});

interface ReportsState {
  items: Report[];
  publicRequestId: string | null;
  publicChangedIds: string[];
  assigned: AssignedReportsState;
}
const initialState: ReportsState = {
  items: [], publicRequestId: null, publicChangedIds: [], assigned: emptyAssigned(),
};

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

function mergePreserve(prev: Report, next: Report): Report {
  const merged: Report = { ...prev, ...next };

  const nextCreatedByUnknown = getUnknownProp(next, "createdBy");
  if (isNullish(nextCreatedByUnknown) || isString(nextCreatedByUnknown)) {
    merged.createdBy = prev.createdBy;
  }

  if (isNullish(next.createdByName) || next.createdByName === "") {
    merged.createdByName = prev.createdByName;
  }

  const nextAssignedToUnknown = getUnknownProp(next, "assignedTo");
  if (isNullish(nextAssignedToUnknown) || isString(nextAssignedToUnknown)) {
    merged.assignedTo = prev.assignedTo;
  }

  if (isNullish(next.assignedToName) || next.assignedToName === "") {
    merged.assignedToName = prev.assignedToName;
  }

  if (
    prev.location?.address &&
    (isNullish(next.location) || isNullish(next.location.address))
  ) {
    merged.location = { ...merged.location, address: prev.location.address };
  }

  if (isNullish((next as Partial<Report>).distanceKm)) {
    merged.distanceKm = prev.distanceKm;
  }

  return merged;
}

function upsert(items: Report[], report: Report) {
  const index = items.findIndex((item) => item._id === report._id);
  if (index < 0) items.unshift(report);
  else items[index] = mergePreserve(items[index], report);
}

function updateAssigned(state: ReportsState, report: Report) {
  if (!state.assigned.userId || state.assigned.status === "unauthorized") return;
  if (reportAssigneeId(report.assignedTo) === state.assigned.userId) upsert(state.assigned.items, report);
  else state.assigned.items = state.assigned.items.filter((item) => item._id !== report._id);
  if (state.assigned.requestId && !state.assigned.changedIds.includes(report._id)) state.assigned.changedIds.push(report._id);
}

function updatePublic(state: ReportsState, report: Report, insert = false) {
  if (insert || state.items.some((item) => item._id === report._id)) upsert(state.items, report);
  if (state.publicRequestId && !state.publicChangedIds.includes(report._id)) state.publicChangedIds.push(report._id);
}

function trackMutation(state: ReportsState, meta: { userId: string | null; token: string | null; requestId: string }) {
  if (!meta.userId || !meta.token) return;
  if (state.assigned.userId !== meta.userId || state.assigned.token !== meta.token) {
    state.assigned = { ...emptyAssigned(), userId: meta.userId, token: meta.token };
  }
  state.assigned.mutationRequests.push(meta.requestId);
}

function rejectMutation(state: ReportsState, requestId: string, unauthorized: boolean, message?: string) {
  if (!state.assigned.mutationRequests.includes(requestId)) return;
  state.assigned.mutationRequests = state.assigned.mutationRequests.filter((id) => id !== requestId);
  if (unauthorized) {
    state.assigned.items = [];
    state.assigned.status = "unauthorized";
    state.assigned.error = message ?? null;
    state.assigned.requestId = null;
    state.assigned.changedIds = [];
    state.assigned.mutationRequests = [];
  }
}

// A request may finish after a claim/resolve. Keep the newer mutation for changed rows.
function mergeSnapshot(snapshot: Report[], current: Report[], changedIds: string[]): Report[] {
  const merged = snapshot.map((report) => {
    const previous = current.find((item) => item._id === report._id);
    return previous ? mergePreserve(previous, report) : report;
  }).filter((report) => !changedIds.includes(report._id));
  return [...current.filter((report) => changedIds.includes(report._id)), ...merged];
}

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    addReport(state, action: PayloadAction<Report>) {
      updatePublic(state, action.payload, true);
    },
    updateReportStatus(
      state,
      action: PayloadAction<{
        _id: string;
        status: ReportStatus;
        assignedTo?: Report["assignedTo"];
      }>
    ) {
      const idx = state.items.findIndex((r) => r._id === action.payload._id);
      if (idx !== -1) {
        const report = {
          ...state.items[idx],
          status: action.payload.status,
          ...(action.payload.assignedTo !== undefined
            ? { assignedTo: action.payload.assignedTo }
            : {}),
        };
        updatePublic(state, report);
        updateAssigned(state, report);
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchReports.pending, (state, action) => {
      state.publicRequestId = action.meta.requestId;
      state.publicChangedIds = [];
    });
    builder.addCase(fetchReports.fulfilled, (state, action) => {
      if (state.publicRequestId !== action.meta.requestId) return;
      state.items = mergeSnapshot(Array.isArray(action.payload) ? action.payload : [], state.items, state.publicChangedIds);
      state.publicRequestId = null;
      state.publicChangedIds = [];
    });
    builder.addCase(fetchReports.rejected, (state, action) => {
      if (state.publicRequestId !== action.meta.requestId) return;
      state.publicRequestId = null;
      state.publicChangedIds = [];
    });
    builder.addCase(fetchMyReports.pending, (state, action) => {
      const { userId, token } = action.meta;
      if (state.assigned.userId !== userId || state.assigned.token !== token) state.assigned = emptyAssigned();
      Object.assign(state.assigned, { userId, token, status: "loading", error: null, requestId: action.meta.requestId, changedIds: [] });
    });
    builder.addCase(fetchMyReports.fulfilled, (state, action) => {
      if (state.assigned.requestId !== action.meta.requestId) return;
      const snapshot = (Array.isArray(action.payload) ? action.payload : []).filter((report) => reportAssigneeId(report.assignedTo) === state.assigned.userId);
      state.assigned.items = mergeSnapshot(snapshot, state.assigned.items, state.assigned.changedIds);
      Object.assign(state.assigned, { status: "succeeded", error: null, requestId: null, changedIds: [] });
    });
    builder.addCase(fetchMyReports.rejected, (state, action) => {
      if (state.assigned.requestId !== action.meta.requestId) return;
      state.assigned.status = action.payload?.status === 401 ? "unauthorized" : "failed";
      state.assigned.error = action.payload?.message ?? action.error.message ?? null;
      state.assigned.requestId = null;
      state.assigned.changedIds = [];
      if (state.assigned.status === "unauthorized") {
        state.assigned.items = [];
        state.assigned.mutationRequests = [];
      }
    });

    builder.addCase(createReport.fulfilled, (state, action) => {
      if (!action.payload) return;
      updatePublic(state, action.payload, true);
    });

    builder.addCase(claimReport.fulfilled, (state, action) => {
      updatePublic(state, action.payload, true);
      if (state.assigned.mutationRequests.includes(action.meta.requestId)) updateAssigned(state, state.items.find((report) => report._id === action.payload._id) ?? action.payload);
      state.assigned.mutationRequests = state.assigned.mutationRequests.filter((id) => id !== action.meta.requestId);
    });

    builder.addCase(resolveReport.fulfilled, (state, action) => {
      updatePublic(state, action.payload, true);
      if (state.assigned.mutationRequests.includes(action.meta.requestId)) updateAssigned(state, state.items.find((report) => report._id === action.payload._id) ?? action.payload);
      state.assigned.mutationRequests = state.assigned.mutationRequests.filter((id) => id !== action.meta.requestId);
    });
    builder.addCase(claimReport.pending, (state, action) => { trackMutation(state, action.meta); });
    builder.addCase(resolveReport.pending, (state, action) => { trackMutation(state, action.meta); });
    builder.addCase(claimReport.rejected, (state, action) => { rejectMutation(state, action.meta.requestId, action.error.code === "HTTP_401", action.error.message); });
    builder.addCase(resolveReport.rejected, (state, action) => { rejectMutation(state, action.meta.requestId, action.error.code === "HTTP_401", action.error.message); });
    builder.addMatcher((action): action is PayloadAction<{ id: string; token: string }> => action.type === "auth/setAuth", (state, action) => {
      if (state.assigned.userId === action.payload.id && state.assigned.token === action.payload.token) return;
      state.assigned = { ...emptyAssigned(), userId: action.payload.id, token: action.payload.token };
    });
    builder.addMatcher((action) => ["auth/logout", "auth/logoutUser/pending", "auth/loginUser/pending", "auth/registerUser/pending"].includes(action.type), (state) => {
      state.assigned = emptyAssigned();
    });
  },
});

export const { addReport, updateReportStatus } = reportsSlice.actions;
export default reportsSlice.reducer;
