import { createSlice } from "@reduxjs/toolkit";
import { createFeedingStation, fetchFeedingStations } from "./feedingStationsThunks";
import type { FeedingStation } from "./types";

interface FeedingStationsState {
  data: FeedingStation[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  createError: string | null;
  createdDuringFetch: string[];
}

const initialState: FeedingStationsState = {
  data: [],
  loading: false,
  error: null,
  creating: false,
  createError: null,
  createdDuringFetch: [],
};

const feedingStationsSlice = createSlice({
  name: "feedingStations",
  initialState,
  reducers: {
    clearStationCreateError(state) { state.createError = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedingStations.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createdDuringFetch = [];
      })
      .addCase(fetchFeedingStations.fulfilled, (state, action) => {
        // Keep locally created stations if an older list request finishes later.
        const stations = new Map(state.data
          .filter((station) => state.createdDuringFetch.includes(station._id))
          .map((station) => [station._id, station]));
        action.payload.forEach((station) => stations.set(station._id, station));
        state.data = [...stations.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        state.loading = false;
        state.error = null;
        state.createdDuringFetch = [];
      })
      .addCase(fetchFeedingStations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? "Failed to load feeding stations";
        state.createdDuringFetch = [];
      })
      .addCase(createFeedingStation.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      .addCase(createFeedingStation.fulfilled, (state, action) => {
        if (state.loading) state.createdDuringFetch.push(action.payload._id);
        state.data = [action.payload, ...state.data.filter((station) => station._id !== action.payload._id)]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        state.creating = false;
        state.createError = null;
      })
      .addCase(createFeedingStation.rejected, (state, action) => {
        state.creating = false;
        state.createError = action.payload ?? action.error.message ?? "Could not create the station.";
      });
  },
});

export const { clearStationCreateError } = feedingStationsSlice.actions;
export default feedingStationsSlice.reducer;
