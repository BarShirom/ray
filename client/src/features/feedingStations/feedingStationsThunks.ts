import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { http } from "../../api/http";
import type { RootState } from "../../app/store";
import type { FeedingStation } from "./types";

export const fetchFeedingStations = createAsyncThunk<
  FeedingStation[],
  void,
  { state: RootState; rejectValue: string }
>(
  "feedingStations/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await http.get<FeedingStation[]>("/api/feeding-stations");
      return data;
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message ?? error.message
        : "Failed to load feeding stations";
      return rejectWithValue(message);
    }
  },
  { condition: (_, { getState }) => !getState().feedingStations.loading }
);
