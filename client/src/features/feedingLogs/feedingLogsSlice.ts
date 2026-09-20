import { createSlice } from "@reduxjs/toolkit";
import { createFeedingLog, fetchFeedingLogsForStation } from "./feedingLogsThunks";
import type { FeedingLog } from "./types";

export interface StationFeedingLogs {
  data: FeedingLog[];
  loading: boolean;
  submitting: boolean;
  loadError: string | null;
  submitError: string | null;
}

export const emptyStationFeedingLogs: StationFeedingLogs = {
  data: [], loading: false, submitting: false, loadError: null, submitError: null,
};

interface FeedingLogsState {
  byStationId: Record<string, StationFeedingLogs>;
}

const initialState: FeedingLogsState = { byStationId: {} };

function stationState(state: FeedingLogsState, stationId: string) {
  return state.byStationId[stationId] ??= { ...emptyStationFeedingLogs, data: [] };
}

function mergeLogs(existing: FeedingLog[], incoming: FeedingLog[]) {
  const logs = new Map(existing.map((log) => [log._id, log]));
  incoming.forEach((log) => logs.set(log._id, log));
  return [...logs.values()].sort((a, b) =>
    Date.parse(b.fedAt) - Date.parse(a.fedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

const feedingLogsSlice = createSlice({
  name: "feedingLogs",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedingLogsForStation.pending, (state, action) => {
        const station = stationState(state, action.meta.arg);
        station.loading = true;
        station.loadError = null;
      })
      .addCase(fetchFeedingLogsForStation.fulfilled, (state, action) => {
        const station = stationState(state, action.meta.arg);
        // Preserve feedings created while this history request was in flight.
        station.data = mergeLogs(station.data, action.payload);
        station.loading = false;
        station.loadError = null;
      })
      .addCase(fetchFeedingLogsForStation.rejected, (state, action) => {
        const station = stationState(state, action.meta.arg);
        station.loading = false;
        station.loadError = action.payload ?? action.error.message ?? "Could not load feeding history.";
      })
      .addCase(createFeedingLog.pending, (state, action) => {
        const station = stationState(state, action.meta.arg.stationId);
        station.submitting = true;
        station.submitError = null;
      })
      .addCase(createFeedingLog.fulfilled, (state, action) => {
        const station = stationState(state, action.meta.arg.stationId);
        station.data = mergeLogs(station.data, [action.payload]);
        station.submitting = false;
        station.submitError = null;
      })
      .addCase(createFeedingLog.rejected, (state, action) => {
        const station = stationState(state, action.meta.arg.stationId);
        station.submitting = false;
        station.submitError = action.payload ?? action.error.message ?? "Could not save this feeding.";
      });
  },
});

export default feedingLogsSlice.reducer;
