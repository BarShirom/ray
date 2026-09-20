import type { RootState } from "../../app/store";

export const selectAllFeedingStations = (state: RootState) => state.feedingStations.data;
export const selectFeedingStationsLoading = (state: RootState) => state.feedingStations.loading;
export const selectFeedingStationsError = (state: RootState) => state.feedingStations.error;
export const selectStationCreating = (state: RootState) => state.feedingStations.creating;
export const selectStationCreateError = (state: RootState) => state.feedingStations.createError;
