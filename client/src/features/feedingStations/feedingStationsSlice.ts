import { createSlice } from "@reduxjs/toolkit";
import type { ApiFailure } from "../../api/errors";
import { createFeedingStation, fetchFeedingStationDetail, fetchFeedingStations } from "./feedingStationsThunks";
import type { FeedingStation } from "./types";
import { parentUnavailable, stationInactive } from "./protectedStationApi";

export interface StationDetailState {
  data: FeedingStation | null;
  loading: boolean;
  error: ApiFailure | null;
  requestId: string | null;
}
export const emptyStationDetail: StationDetailState = { data: null, loading: false, error: null, requestId: null };
interface FeedingStationsState {
  data: FeedingStation[];
  loading: boolean;
  error: ApiFailure | null;
  creating: boolean;
  createError: ApiFailure | null;
  createdDuringFetch: string[];
  inactivatedDuringFetch: string[];
  detailsById: Record<string, StationDetailState>;
  unavailableIds: Record<string, true>;
  inactiveIds: Record<string, true>;
  authorizationRevision: number;
  sessionId: string | null;
  fetchRequestId: string | null;
  createRequestId: string | null;
}

const initialState: FeedingStationsState = {
  data: [], loading: false, error: null, creating: false, createError: null,
  createdDuringFetch: [], inactivatedDuringFetch: [], detailsById: {}, unavailableIds: {}, inactiveIds: {}, authorizationRevision: 0,
  sessionId: null, fetchRequestId: null, createRequestId: null,
};

const feedingStationsSlice = createSlice({
  name: "feedingStations",
  initialState,
  reducers: { clearStationCreateError(state) { state.createError = null; } },
  extraReducers: (builder) => {
    builder
      .addCase(stationInactive, (state, action) => {
        if (state.sessionId !== action.payload.sessionId) return;
        state.inactiveIds[action.payload.stationId] = true;
        const station = state.data.find(item => item._id === action.payload.stationId);
        if (station) { station.active = false; station.permissions.canFeed = false; }
        if (state.loading) state.inactivatedDuringFetch.push(action.payload.stationId);
        const detail = state.detailsById[action.payload.stationId]?.data ?? station;
        state.detailsById[action.payload.stationId] = {
          data: detail ? { ...detail, active: false, permissions: { ...detail.permissions, canFeed: false } } : null,
          loading: false, error: null, requestId: null,
        };
      })
      .addCase(parentUnavailable, (state, action) => {
        if (state.sessionId && state.sessionId !== action.payload.sessionId) return;
        const { stationId, failure } = action.payload;
        state.data = state.data.filter(station => station._id !== stationId);
        state.unavailableIds[stationId] = true;
        state.detailsById[stationId] = { ...emptyStationDetail, error: failure };
        state.authorizationRevision++;
      })
      .addCase(fetchFeedingStations.pending, (state, action) => {
        state.sessionId = action.meta.sessionId;
        state.fetchRequestId = action.meta.requestId;
        state.loading = true;
        state.error = null;
        state.createdDuringFetch = [];
        state.inactivatedDuringFetch = [];
      })
      .addCase(fetchFeedingStations.fulfilled, (state, action) => {
        if (state.fetchRequestId !== action.meta.requestId || state.sessionId !== action.meta.sessionId) return;
        // A collection started before POST must not erase its successful receipt.
        const stations = new Map(action.payload.map(station => [station._id, station]));
        for (const station of state.data) if (state.createdDuringFetch.includes(station._id)) stations.set(station._id, station);
        state.data = [...stations.values()].filter(station => !state.unavailableIds[station._id])
          .map(station => state.inactivatedDuringFetch.includes(station._id)
            ? { ...station, active: false, permissions: { ...station.permissions, canFeed: false } } : station);
        state.loading = false;
        state.error = null;
        state.fetchRequestId = null;
        state.createdDuringFetch = [];
        state.inactivatedDuringFetch = [];
      })
      .addCase(fetchFeedingStations.rejected, (state, action) => {
        if (state.fetchRequestId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.payload ?? null;
        state.fetchRequestId = null;
        state.createdDuringFetch = [];
        state.inactivatedDuringFetch = [];
      })
      .addCase(fetchFeedingStationDetail.pending, (state, action) => {
        state.sessionId = action.meta.sessionId;
        state.detailsById[action.meta.arg] = {
          data: state.detailsById[action.meta.arg]?.data ?? null,
          loading: true, error: null, requestId: action.meta.requestId,
        };
      })
      .addCase(fetchFeedingStationDetail.fulfilled, (state, action) => {
        const detail = state.detailsById[action.meta.arg];
        if (detail?.requestId !== action.meta.requestId || state.sessionId !== action.meta.sessionId) return;
        state.detailsById[action.meta.arg] = { data: action.payload, loading: false, error: null, requestId: null };
        // Refresh active/permission flags without inserting a discovery omission.
        state.data = state.data.map(station => station._id === action.payload._id ? action.payload : station);
        delete state.unavailableIds[action.meta.arg];
        delete state.inactiveIds[action.meta.arg];
      })
      .addCase(fetchFeedingStationDetail.rejected, (state, action) => {
        const detail = state.detailsById[action.meta.arg];
        if (detail?.requestId !== action.meta.requestId) return;
        detail.loading = false;
        detail.error = action.payload ?? null;
        detail.requestId = null;
      })
      .addCase(createFeedingStation.pending, (state, action) => {
        state.sessionId = action.meta.sessionId;
        state.createRequestId = action.meta.requestId;
        state.creating = true;
        state.createError = null;
      })
      .addCase(createFeedingStation.fulfilled, (state, action) => {
        if (state.createRequestId !== action.meta.requestId || state.sessionId !== action.meta.sessionId) return;
        if (state.loading) state.createdDuringFetch.push(action.payload._id);
        state.data = [action.payload, ...state.data.filter(station => station._id !== action.payload._id)];
        state.detailsById[action.payload._id] = { data: action.payload, loading: false, error: null, requestId: null };
        state.creating = false;
        state.createError = null;
        state.createRequestId = null;
      })
      .addCase(createFeedingStation.rejected, (state, action) => {
        if (state.createRequestId !== action.meta.requestId) return;
        state.creating = false;
        state.createError = action.payload ?? null;
        state.createRequestId = null;
      });
  },
});

export const { clearStationCreateError } = feedingStationsSlice.actions;
export default feedingStationsSlice.reducer;
