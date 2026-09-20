import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { http } from "../../api/http";
import type { RootState } from "../../app/store";
import type { CreateFeedingStationData, FeedingStation } from "./types";
import { selectToken } from "../auth/authSelectors";
import { validateStationCreation } from "./validateStationCreation";

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

export const createFeedingStation = createAsyncThunk<
  FeedingStation,
  CreateFeedingStationData,
  { state: RootState; rejectValue: string }
>(
  "feedingStations/create",
  async (data, { getState, rejectWithValue }) => {
    const token = selectToken(getState());
    if (!token) return rejectWithValue("Please log in to add a feeding station.");
    const validationError = validateStationCreation(data);
    if (validationError) return rejectWithValue(validationError);
    const { name, location, estimatedCats, estimatedKittens, image, notes } = data;
    try {
      const response = await http.post<FeedingStation>("/api/feeding-stations", {
        name: name.trim(),
        location: { lat: location.lat, lng: location.lng },
        estimatedCats, estimatedKittens, image, notes,
      }, { headers: { Authorization: `Bearer ${token}` } });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError<{ message?: string; error?: string; errors?: { field: string; message: string }[] }>(error)) {
        const body = error.response?.data;
        return rejectWithValue(body?.errors?.map((issue) => `${issue.field}: ${issue.message}`).join("; ") ||
          body?.message || body?.error || error.message);
      }
      return rejectWithValue("Could not create the station. Please try again.");
    }
  },
  { condition: (_, { getState }) => !getState().feedingStations.creating }
);
