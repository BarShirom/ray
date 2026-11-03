import { createSlice } from "@reduxjs/toolkit";
import type { ApiFailure } from "../../api/errors";
import { appendingHistory, createFeedingLog, fetchFeedingLogsForStation, fetchFeedingSummaryForStation, historyStationId, summaryStationId } from "./feedingLogsThunks";
import type { FeedingLog, FeedingSummary } from "./types";
import { parentUnavailable } from "../feedingStations/protectedStationApi";

export interface StationFeedingLogs {
  data: FeedingLog[];
  loading: boolean;
  submitting: boolean;
  loadError: ApiFailure | null;
  submitError: ApiFailure | null;
  nextCursor: string | null;
  seenCursors: string[];
  summary: FeedingSummary | null;
  summaryLoading: boolean;
  summaryError: ApiFailure | null;
  sessionId: string | null;
  historyRequestId: string | null;
  summaryRequestId: string | null;
  createRequestId: string | null;
  unreconciledReceiptIds: string[];
}

export const emptyStationFeedingLogs: StationFeedingLogs = {
  data: [], loading: false, submitting: false, loadError: null, submitError: null,
  nextCursor: null, seenCursors: [], summary: null, summaryLoading: false, summaryError: null,
  sessionId: null, historyRequestId: null, summaryRequestId: null, createRequestId: null, unreconciledReceiptIds: [],
};

interface FeedingLogsState { byStationId: Record<string, StationFeedingLogs> }
const initialState: FeedingLogsState = { byStationId: {} };
function stationState(state: FeedingLogsState, stationId: string) {
  return state.byStationId[stationId] ??= { ...emptyStationFeedingLogs, data: [], seenCursors: [], unreconciledReceiptIds: [] };
}
function mergePages(existing: FeedingLog[], incoming: FeedingLog[]) {
  const logs = new Map(existing.map(log => [log._id, log]));
  incoming.forEach(log => logs.set(log._id, log));
  // Its final ordering key is an internal UUID, unrelated to the public ID.
  return [...logs.values()];
}
function mergeReceipts(fetched: FeedingLog[], receipts: FeedingLog[]) {
  const logs = [...fetched];
  for (const receipt of receipts) {
    const found = logs.findIndex(log => log._id === receipt._id);
    if (found !== -1) { logs[found] = receipt; continue; }
    // Position unseen receipts by known timestamps without rearranging fetched
    // rows or guessing the server's tie-break key. Fetched ties remain first.
    const before = logs.findIndex(log => Date.parse(log.fedAt) < Date.parse(receipt.fedAt) ||
      (Date.parse(log.fedAt) === Date.parse(receipt.fedAt) && Date.parse(log.createdAt) < Date.parse(receipt.createdAt)));
    if (before === -1) logs.push(receipt);
    else logs.splice(before, 0, receipt);
  }
  return logs;
}

const feedingLogsSlice = createSlice({
  name: "feedingLogs", initialState, reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(parentUnavailable, (state, action) => {
        const station = state.byStationId[action.payload.stationId];
        if (station?.sessionId === action.payload.sessionId) delete state.byStationId[action.payload.stationId];
      })
      .addCase(fetchFeedingLogsForStation.pending, (state, action) => {
        const station = stationState(state, historyStationId(action.meta.arg));
        station.sessionId = action.meta.sessionId;
        station.historyRequestId = action.meta.requestId;
        station.loading = true;
        station.loadError = null;
        if (!appendingHistory(action.meta.arg)) station.seenCursors = [];
      })
      .addCase(fetchFeedingLogsForStation.fulfilled, (state, action) => {
        const station = state.byStationId[historyStationId(action.meta.arg)];
        if (station?.historyRequestId !== action.meta.requestId || station.sessionId !== action.meta.sessionId) return;
        const receiptIds = new Set(station.unreconciledReceiptIds);
        const fetchedIds = new Set(action.payload.items.map(log => log._id));
        // A receipt is provisional ordering information until a fetched page
        // supplies its server position. Keep unseen receipts through retries.
        const receipts = station.data.filter(log => receiptIds.has(log._id) && !fetchedIds.has(log._id));
        const existing = action.payload.after ? station.data.filter(log => !receiptIds.has(log._id)) : [];
        station.data = mergeReceipts(mergePages(existing, action.payload.items), receipts);
        station.unreconciledReceiptIds = receipts.map(log => log._id);
        station.nextCursor = action.payload.nextCursor;
        if (action.payload.nextCursor) station.seenCursors.push(action.payload.nextCursor);
        station.loading = false;
        station.loadError = null;
        station.historyRequestId = null;
      })
      .addCase(fetchFeedingLogsForStation.rejected, (state, action) => {
        const station = state.byStationId[historyStationId(action.meta.arg)];
        if (station?.historyRequestId !== action.meta.requestId) return;
        station.loading = false;
        station.loadError = action.payload ?? null;
        station.historyRequestId = null;
      })
      .addCase(fetchFeedingSummaryForStation.pending, (state, action) => {
        const station = stationState(state, summaryStationId(action.meta.arg));
        station.sessionId = action.meta.sessionId;
        station.summaryRequestId = action.meta.requestId;
        station.summaryLoading = true;
        station.summaryError = null;
      })
      .addCase(fetchFeedingSummaryForStation.fulfilled, (state, action) => {
        const station = state.byStationId[summaryStationId(action.meta.arg)];
        if (station?.summaryRequestId !== action.meta.requestId || station.sessionId !== action.meta.sessionId) return;
        station.summary = action.payload;
        station.summaryLoading = false;
        station.summaryError = null;
        station.summaryRequestId = null;
      })
      .addCase(fetchFeedingSummaryForStation.rejected, (state, action) => {
        const station = state.byStationId[summaryStationId(action.meta.arg)];
        if (station?.summaryRequestId !== action.meta.requestId) return;
        station.summaryLoading = false;
        station.summaryError = action.payload ?? null;
        station.summaryRequestId = null;
      })
      .addCase(createFeedingLog.pending, (state, action) => {
        const station = stationState(state, action.meta.arg.stationId);
        station.sessionId = action.meta.sessionId;
        station.createRequestId = action.meta.requestId;
        station.submitting = true;
        station.submitError = null;
      })
      .addCase(createFeedingLog.fulfilled, (state, action) => {
        const station = state.byStationId[action.meta.arg.stationId];
        if (station?.createRequestId !== action.meta.requestId || station.sessionId !== action.meta.sessionId) return;
        if (!station.data.some(log => log._id === action.payload._id)
          && !station.unreconciledReceiptIds.includes(action.payload._id)) station.unreconciledReceiptIds.push(action.payload._id);
        station.data = mergeReceipts(station.data, [action.payload]);
        station.submitting = false;
        station.submitError = null;
        station.createRequestId = null;
      })
      .addCase(createFeedingLog.rejected, (state, action) => {
        const station = state.byStationId[action.meta.arg.stationId];
        if (station?.createRequestId !== action.meta.requestId) return;
        station.submitting = false;
        station.submitError = action.payload ?? null;
        station.createRequestId = null;
      });
  },
});

export default feedingLogsSlice.reducer;
