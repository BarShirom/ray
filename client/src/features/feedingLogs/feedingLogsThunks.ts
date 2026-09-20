import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { http } from "../../api/http";
import type { RootState } from "../../app/store";
import { selectToken } from "../auth/authSelectors";
import type { CreateFeedingLogData, FeedingLog } from "./types";

type ThunkConfig = { state: RootState; rejectValue: string };

function errorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<{
    message?: string;
    error?: string;
    errors?: { field: string; message: string }[];
  }>(error)) return fallback;
  const body = error.response?.data;
  return body?.errors?.map((issue) => issue.message).join("; ") ||
    body?.message || body?.error || error.message || fallback;
}

export const fetchFeedingLogsForStation = createAsyncThunk<FeedingLog[], string, ThunkConfig>(
  "feedingLogs/fetchForStation",
  async (stationId, { rejectWithValue }) => {
    try {
      const { data } = await http.get<FeedingLog[]>(
        `/api/feeding-stations/${encodeURIComponent(stationId)}/feedings`
      );
      return data;
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Could not load feeding history."));
    }
  },
  { condition: (stationId, { getState }) => !getState().feedingLogs.byStationId[stationId]?.loading }
);

export const createFeedingLog = createAsyncThunk<
  FeedingLog,
  { stationId: string; data: CreateFeedingLogData },
  ThunkConfig
>(
  "feedingLogs/create",
  async ({ stationId, data }, { getState, rejectWithValue }) => {
    const token = selectToken(getState());
    if (!token) return rejectWithValue("Please log in to record a feeding.");
    const { fedAt, period, food, water, note } = data;
    try {
      const response = await http.post<FeedingLog>(
        `/api/feeding-stations/${encodeURIComponent(stationId)}/feedings`,
        { fedAt, period, food, water, note },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Could not save this feeding. Please try again."));
    }
  },
  { condition: ({ stationId }, { getState }) => !getState().feedingLogs.byStationId[stationId]?.submitting }
);
