import type { RootState } from "../../app/store";

export const selectAllFeedingStations = (state: RootState) => state.feedingStations.data;
export const selectFeedingStationsLoading = (state: RootState) => state.feedingStations.loading;
export const selectFeedingStationsError = (state: RootState) => state.feedingStations.error;
