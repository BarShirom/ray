import type { RootState } from "../../app/store";
import { emptyStationDetail } from "./feedingStationsSlice";

export const selectAllFeedingStations = (state: RootState) => state.feedingStations.data;
export const selectFeedingStationsLoading = (state: RootState) => state.feedingStations.loading;
export const selectFeedingStationsError = (state: RootState) => state.feedingStations.error;
export const selectStationCreating = (state: RootState) => state.feedingStations.creating;
export const selectStationCreateError = (state: RootState) => state.feedingStations.createError;
export const selectFeedingStationDetailState = (state: RootState, stationId: string) =>
  state.feedingStations.detailsById[stationId] ?? emptyStationDetail;
export const selectFeedingStationDetail = (state: RootState, stationId: string) =>
  state.feedingStations.detailsById[stationId]?.data ?? null;
export const selectStationAuthorizationRevision = (state: RootState) => state.feedingStations.authorizationRevision;
export const selectStationKnownInactive = (state: RootState, stationId: string) =>
  state.feedingStations.inactiveIds[stationId] === true;
