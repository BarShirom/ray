import { createAsyncThunk } from "@reduxjs/toolkit";
import { localizeError } from "../../i18n/errors";
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
      return rejectWithValue(localizeError(error, "station"));
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
    if (!token) return rejectWithValue(localizeError("Please log in to add a feeding station.", "station"));
    const validationError = validateStationCreation(data);
    if (validationError) return rejectWithValue(localizeError(validationError, "station"));
    const { name, location, estimatedCats, estimatedKittens, image, notes, imageAssetId } = data;
    try {
      const response = await http.post<FeedingStation>("/api/feeding-stations", {
        name: name.trim(),
        location: { lat: location.lat, lng: location.lng },
        estimatedCats, estimatedKittens, image, notes,
        ...(imageAssetId !== undefined ? { imageAssetId } : {}),
      }, { headers: { Authorization: `Bearer ${token}` } });
      return response.data;
    } catch (error) {
      return rejectWithValue(localizeError(error, "station"));
    }
  },
  { condition: (_, { getState }) => !getState().feedingStations.creating }
);
