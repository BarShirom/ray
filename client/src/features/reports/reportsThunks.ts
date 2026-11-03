import { createAsyncThunk } from "@reduxjs/toolkit";
import { http } from "../../api/http";
import { apiFailure, isApiFailure, toApiFailure, type ApiFailure } from "../../api/errors";
import type { RootState } from "../../app/store";
import { selectName } from "../auth/authSelectors";
import { captureSession, isSessionCurrent, type SessionSnapshot } from "../auth/session";
import type { Report, ReportType } from "./reportsSlice";

type Config = { state: RootState; rejectValue: ApiFailure;
  pendingMeta: { sessionId: string; userId: string | null; token: string | null };
  fulfilledMeta: { sessionId: string } };
const reportThunk = createAsyncThunk.withTypes<Config>();
const headers = (session: SessionSnapshot) => session.token ? { Authorization: `Bearer ${session.token}` } : undefined;
const pending = (_arg: unknown, { getState }: { getState: () => RootState }) => {
  const session = captureSession(getState());
  return { sessionId: session.id, userId: session.actorId, token: session.token };
};
type Context = { getState: () => RootState; requestId: string; signal: AbortSignal };
async function reportRequest<T>(api: Context, request: (session: SessionSnapshot) => Promise<T>, required = false) {
  const session = captureSession(api.getState()), identity = { sessionId: session.id, requestId: api.requestId };
  try {
    if (!isSessionCurrent(api.getState(), session)) throw apiFailure("stale", identity, "report");
    if (required && (!session.actorId || !session.token || api.getState().auth.loading)) throw apiFailure("authentication", identity, "report");
    const data = await request(session);
    if (!isSessionCurrent(api.getState(), session)) throw apiFailure("stale", identity, "report");
    return { data, sessionId: session.id };
  } catch (error) {
    if (!isSessionCurrent(api.getState(), session)) throw apiFailure("stale", identity, "report");
    throw isApiFailure(error) ? error : toApiFailure(error, { ...identity, context: "report" });
  }
}

export const fetchReports = reportThunk<Report[]>("reports/fetchAll", async (_, api) => {
  try {
    const result = await reportRequest(api, async () => (await http.get<Report[]>("/api/reports", { signal: api.signal })).data);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending, condition: (_, { getState }) => !getState().reports.publicRequestId });

type CreateReportPayload = { description: string; type: ReportType; location: { lat: number; lng: number };
  media?: string[]; mediaAssetIds?: string[] };
export const createReport = reportThunk<Report, CreateReportPayload>("reports/create", async (payload, api) => {
  try {
    const result = await reportRequest(api, async session => (await http.post<Report>("/api/reports", payload,
      { headers: headers(session), signal: api.signal })).data);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending });

export const claimReport = reportThunk<Report, { reportId: string }>("reports/claim", async ({ reportId }, api) => {
  try {
    const meName = selectName(api.getState());
    const result = await reportRequest(api, async session => {
      const { data } = await http.patch<Report>(`/api/reports/${encodeURIComponent(reportId)}/claim`, {},
        { headers: headers(session), signal: api.signal });
      const raw = data.assignedTo;
      const assignedTo = raw && typeof raw === "object" ? raw
        : typeof raw === "string" ? { _id: raw, name: data.assignedToName ?? meName }
        : session.actorId ? { _id: session.actorId, name: meName } : undefined;
      return { ...data, assignedTo, assignedToName: data.assignedToName ?? meName };
    }, true);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending });

export const resolveReport = reportThunk<Report, { reportId: string }>("reports/resolve", async ({ reportId }, api) => {
  try {
    const result = await reportRequest(api, async session => (await http.patch<Report>(
      `/api/reports/${encodeURIComponent(reportId)}/resolve`, {}, { headers: headers(session), signal: api.signal })).data, true);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending });

export const fetchMyReports = reportThunk<Report[]>("reports/fetchMyReports", async (_, api) => {
  try {
    const result = await reportRequest(api, async session => (await http.get<Report[]>("/api/reports/me",
      { headers: headers(session), signal: api.signal })).data, true);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending, condition: (_, { getState }) => {
  const state = getState(), session = captureSession(state);
  return !!session.actorId && !!session.token && !state.auth.loading && isSessionCurrent(state, session)
    && !(state.reports.assigned.status === "loading" && state.reports.assigned.userId === session.actorId
      && state.reports.assigned.token === session.token);
} });

type Stats = { total: number; resolved: number; inProgress: number };
export const fetchUserStats = reportThunk<Stats>("reports/fetchUserStats", async (_, api) => {
  try {
    const result = await reportRequest(api, async session => (await http.get<Stats>("/api/reports/stats/me",
      { headers: headers(session), signal: api.signal })).data, true);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending });
export const fetchGlobalStats = reportThunk<Stats & { new: number }>("reports/fetchGlobalStats", async (_, api) => {
  try {
    const result = await reportRequest(api, async session => (await http.get<Stats & { new: number }>("/api/reports/stats",
      { headers: headers(session), signal: api.signal })).data);
    return api.fulfillWithValue(result.data, { sessionId: result.sessionId });
  } catch (error) { return api.rejectWithValue(error as ApiFailure); }
}, { getPendingMeta: pending });
