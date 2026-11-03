import type { AxiosResponse } from "axios";
import { createAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "../../api/errors";
import { apiFailure, toApiFailure } from "../../api/errors";
import type { RootState } from "../../app/store";
import { isSessionCurrent, type SessionSnapshot } from "../auth/session";

export type ProtectedThunkConfig = {
  state: RootState;
  rejectValue: ApiFailure;
  pendingMeta: { sessionId: string };
  fulfilledMeta: { sessionId: string };
};

export const STATION_PAGE_LIMIT = 200;
export const HISTORY_PAGE_LIMIT = 100;
// A bound is a protocol failure, never a successful truncated map.
export const MAX_STATION_PAGES = 100;
export const MAX_HISTORY_PAGES = 100;

export class StationProtocolError extends Error {}

export function nextCursor(response: AxiosResponse<unknown>, page: unknown[], limit: number): string | null {
  const header = typeof response.headers.get === "function"
    ? response.headers.get("x-next-cursor") : response.headers["x-next-cursor"];
  if (header === undefined || header === null || header === "") return null;
  if (typeof header !== "string" || !/^[0-9a-f]{24}$/.test(header) || page.length !== limit) {
    throw new StationProtocolError();
  }
  return header;
}

export function protectedFailure(
  error: unknown,
  context: "station" | "feeding",
  session: SessionSnapshot,
  requestId: string,
  getState: () => RootState,
  isRequestCurrent: () => boolean,
): ApiFailure {
  const identity = { sessionId: session.id, requestId };
  if (!isSessionCurrent(getState(), session) || !isRequestCurrent()) {
    return apiFailure("stale", identity, context);
  }
  // Never expose parser internals or response contents through protocol errors.
  if (error instanceof StationProtocolError) {
    return apiFailure("protocol", identity, context);
  }
  return toApiFailure(error, { ...identity, context });
}

export const parentUnavailable = createAction<{ stationId: string; sessionId: string; failure: ApiFailure }>("feedingStations/parentUnavailable");
export const stationInactive = createAction<{ stationId: string; sessionId: string }>("feedingStations/stationInactive");
export const unavailableAction = (stationId: string, failure: ApiFailure) =>
  parentUnavailable({ stationId, sessionId: failure.sessionId, failure });
