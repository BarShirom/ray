import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AxiosResponse } from "axios";
import { apiFailure, toApiFailure } from "../../api/errors";
import { http } from "../../api/http";
import { captureSession, isSessionCurrent } from "../auth/session";
import type { CreateFeedingStationData, FeedingStation } from "./types";
import { validateStationCreation } from "./validateStationCreation";
import { MAX_STATION_PAGES, STATION_PAGE_LIMIT, StationProtocolError, nextCursor, protectedFailure, unavailableAction, type ProtectedThunkConfig } from "./protectedStationApi";
import { readStation } from "./stationDtos";

export const fetchFeedingStations = createAsyncThunk<FeedingStation[], void, ProtectedThunkConfig>(
  "feedingStations/fetchAll",
  async (_, { getState, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "station"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingStations.fetchRequestId === requestId;
    const stations = new Map<string, FeedingStation>();
    const cursors = new Set<string>();
    let after: string | null = null;
    try {
      for (let page = 0; page < MAX_STATION_PAGES; page++) {
        if (!current()) return rejectWithValue(apiFailure("stale", identity, "station"));
        const response: AxiosResponse<unknown> = await http.get<unknown>("/api/feeding-stations", {
          headers: { Authorization: `Bearer ${session.token}` }, signal,
          params: { limit: STATION_PAGE_LIMIT, ...(after ? { after } : {}) },
        });
        if (!current()) return rejectWithValue(apiFailure("stale", identity, "station"));
        if (!Array.isArray(response.data) || response.data.length > STATION_PAGE_LIMIT) throw new StationProtocolError();
        for (const item of response.data) {
          const station = readStation(item);
          if (stations.has(station._id)) throw new StationProtocolError();
          stations.set(station._id, station);
        }
        const cursor = nextCursor(response, response.data, STATION_PAGE_LIMIT);
        if (!cursor) return fulfillWithValue([...stations.values()], { sessionId: session.id });
        if (cursors.has(cursor) || readStation(response.data[response.data.length - 1])._id !== cursor) throw new StationProtocolError();
        cursors.add(cursor);
        after = cursor;
      }
      throw new StationProtocolError();
    } catch (error) { return rejectWithValue(protectedFailure(error, "station", session, requestId, getState, current)); }
  },
  {
    condition: (_, { getState }) => !getState().feedingStations.loading,
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);

export const fetchFeedingStationDetail = createAsyncThunk<FeedingStation, string, ProtectedThunkConfig>(
  "feedingStations/fetchDetail",
  async (stationId, { getState, dispatch, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "station"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingStations.detailsById[stationId]?.requestId === requestId;
    try {
      const { data } = await http.get<unknown>(`/api/feeding-stations/${encodeURIComponent(stationId)}`, {
        headers: { Authorization: `Bearer ${session.token}` }, signal,
      });
      if (!current()) return rejectWithValue(apiFailure("stale", identity, "station"));
      const station = readStation(data, true);
      if (station._id !== stationId) throw new StationProtocolError();
      return fulfillWithValue(station, { sessionId: session.id });
    } catch (error) {
      const failure = protectedFailure(error, "station", session, requestId, getState, current);
      if (failure.status === 404 && isSessionCurrent(getState(), session)) dispatch(unavailableAction(stationId, failure));
      return rejectWithValue(failure);
    }
  },
  {
    condition: (stationId, { getState }) => !getState().feedingStations.detailsById[stationId]?.loading,
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);

export const createFeedingStation = createAsyncThunk<FeedingStation, CreateFeedingStationData, ProtectedThunkConfig>(
  "feedingStations/create",
  async (data, { getState, requestId, signal, rejectWithValue, fulfillWithValue }) => {
    const session = captureSession(getState());
    const identity = { sessionId: session.id, requestId };
    if (!session.token || !session.actorId) return rejectWithValue(apiFailure("authentication", identity, "station"));
    const current = () => isSessionCurrent(getState(), session) && getState().feedingStations.createRequestId === requestId;
    const validationError = validateStationCreation(data);
    if (validationError) return rejectWithValue({
      ...toApiFailure(new Error(validationError), { ...identity, context: "station" }), kind: "validation",
    });
    const { name, location, estimatedCats, estimatedKittens, image, notes, imageAssetId } = data;
    try {
      const response = await http.post<unknown>("/api/feeding-stations", {
        name: name.trim(), location: { lat: location.lat, lng: location.lng },
        estimatedCats, estimatedKittens, image, notes,
        ...(imageAssetId !== undefined ? { imageAssetId } : {}),
      }, { headers: { Authorization: `Bearer ${session.token}` }, signal });
      if (!current()) return rejectWithValue(apiFailure("stale", identity, "station"));
      return fulfillWithValue(readStation(response.data, true), { sessionId: session.id });
    } catch (error) { return rejectWithValue(protectedFailure(error, "station", session, requestId, getState, current)); }
  },
  {
    condition: (_, { getState }) => !getState().feedingStations.creating,
    getPendingMeta: (_, { getState }) => ({ sessionId: captureSession(getState()).id }),
  },
);
