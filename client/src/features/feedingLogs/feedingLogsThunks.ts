import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiFailure } from "../../api/errors";
import { http } from "../../api/http";
import { captureSession, isSessionCurrent } from "../auth/session";
import { HISTORY_PAGE_LIMIT, MAX_HISTORY_PAGES, StationProtocolError, nextCursor, protectedFailure, stationInactive, unavailableAction, type ProtectedThunkConfig } from "../feedingStations/protectedStationApi";
import { readOwnLog, readSummary } from "../feedingStations/stationDtos";
import type { CreateFeedingLogData, FeedingLog, FeedingSummary } from "./types";

export type HistoryRequest = string | { stationId: string; append?: boolean; refresh?: boolean };
export const historyStationId = (arg: HistoryRequest) => typeof arg === "string" ? arg : arg.stationId;
export const appendingHistory = (arg: HistoryRequest) => typeof arg !== "string" && arg.append === true;
type SummaryRequest = string | { stationId: string; refresh?: boolean };
export const summaryStationId = (arg: SummaryRequest) => typeof arg === "string" ? arg : arg.stationId;

export const fetchFeedingLogsForStation = createAsyncThunk<
  { items: FeedingLog[]; nextCursor: string | null; after: string | null }, HistoryRequest, ProtectedThunkConfig
>(
  "feedingLogs/fetchForStation",
  async (arg, { getState, dispatch, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const stationId = historyStationId(arg);
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "feeding"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingLogs.byStationId[stationId]?.historyRequestId === requestId;
    const previous = getState().feedingLogs.byStationId[stationId];
    const after = appendingHistory(arg) ? previous?.nextCursor ?? null : null;
    try {
      if (appendingHistory(arg) && (!after || previous.seenCursors.length >= MAX_HISTORY_PAGES)) throw new StationProtocolError();
      const response = await http.get<unknown>(`/api/feeding-stations/${encodeURIComponent(stationId)}/feedings`, {
        headers: { Authorization: `Bearer ${session.token}` }, signal,
        params: { limit: HISTORY_PAGE_LIMIT, ...(after ? { after } : {}) },
      });
      if (!current()) return rejectWithValue(apiFailure("stale", identity, "feeding"));
      if (!Array.isArray(response.data) || response.data.length > HISTORY_PAGE_LIMIT) throw new StationProtocolError();
      const items = response.data.map(value => readOwnLog(value, stationId));
      if (new Set(items.map(item => item._id)).size !== items.length || (after && items.some(item => item._id === after))) throw new StationProtocolError();
      const cursor = nextCursor(response, response.data, HISTORY_PAGE_LIMIT);
      if (cursor && (items[items.length - 1]?._id !== cursor || previous?.seenCursors.includes(cursor) || cursor === after)) throw new StationProtocolError();
      return fulfillWithValue({ items, nextCursor: cursor, after }, { sessionId: session.id });
    } catch (error) {
      const failure = protectedFailure(error, "feeding", session, requestId, getState, current);
      if (failure.status === 404 && isSessionCurrent(getState(), session)) dispatch(unavailableAction(stationId, failure));
      return rejectWithValue(failure);
    }
  },
  {
    condition: (arg, { getState }) => {
      const station = getState().feedingLogs.byStationId[historyStationId(arg)];
      if (appendingHistory(arg) && !station?.nextCursor) return false;
      return typeof arg !== "string" && arg.refresh === true || !station?.loading;
    },
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);

export const fetchFeedingSummaryForStation = createAsyncThunk<FeedingSummary, SummaryRequest, ProtectedThunkConfig>(
  "feedingLogs/fetchSummary",
  async (arg, { getState, dispatch, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const stationId = summaryStationId(arg);
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "feeding"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingLogs.byStationId[stationId]?.summaryRequestId === requestId;
    try {
      const { data } = await http.get<unknown>(`/api/feeding-stations/${encodeURIComponent(stationId)}/feeding-summary`, {
        headers: { Authorization: `Bearer ${session.token}` }, signal,
      });
      if (!current()) return rejectWithValue(apiFailure("stale", identity, "feeding"));
      return fulfillWithValue(readSummary(data), { sessionId: session.id });
    } catch (error) {
      const failure = protectedFailure(error, "feeding", session, requestId, getState, current);
      if (failure.status === 404 && isSessionCurrent(getState(), session)) dispatch(unavailableAction(stationId, failure));
      return rejectWithValue(failure);
    }
  },
  {
    condition: (arg, { getState }) => typeof arg !== "string" && arg.refresh === true ||
      !getState().feedingLogs.byStationId[summaryStationId(arg)]?.summaryLoading,
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);

export const createFeedingLog = createAsyncThunk<FeedingLog, { stationId: string; data: CreateFeedingLogData }, ProtectedThunkConfig>(
  "feedingLogs/create",
  async ({ stationId, data }, { getState, dispatch, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "feeding"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingLogs.byStationId[stationId]?.createRequestId === requestId;
    const { fedAt, period, food, water, note } = data;
    try {
      const response = await http.post<unknown>(`/api/feeding-stations/${encodeURIComponent(stationId)}/feedings`,
        { fedAt, period, food, water, note }, { headers: { Authorization: `Bearer ${session.token}` }, signal });
      if (!current()) return rejectWithValue(apiFailure("stale", identity, "feeding"));
      const log = readOwnLog(response.data, stationId);
      // New requests supersede older reads. Their reducers cannot overwrite a
      // fresh summary or successful receipt when an earlier response arrives.
      dispatch(fetchFeedingSummaryForStation({ stationId, refresh: true }));
      dispatch(fetchFeedingLogsForStation({ stationId, refresh: true }));
      return fulfillWithValue(log, { sessionId: session.id });
    } catch (error) {
      const failure = protectedFailure(error, "feeding", session, requestId, getState, current);
      if (failure.status === 404 && isSessionCurrent(getState(), session)) dispatch(unavailableAction(stationId, failure));
      if (failure.status === 409 && current()) dispatch(stationInactive({ stationId, sessionId: session.id }));
      return rejectWithValue(failure);
    }
  },
  {
    condition: ({ stationId }, { getState }) => !getState().feedingLogs.byStationId[stationId]?.submitting,
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);
