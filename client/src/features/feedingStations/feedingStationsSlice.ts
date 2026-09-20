import { createSlice } from "@reduxjs/toolkit";
import { fetchFeedingStations } from "./feedingStationsThunks";
import type { FeedingStation } from "./types";

interface FeedingStationsState {
  data: FeedingStation[];
  loading: boolean;
  error: string | null;
}

const initialState: FeedingStationsState = {
  data: [],
  loading: false,
  error: null,
};

const feedingStationsSlice = createSlice({
  name: "feedingStations",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedingStations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeedingStations.fulfilled, (state, action) => {
        state.data = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchFeedingStations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? "Failed to load feeding stations";
      });
  },
});

export default feedingStationsSlice.reducer;
