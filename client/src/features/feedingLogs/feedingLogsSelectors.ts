import type { RootState } from "../../app/store";
import { emptyStationFeedingLogs } from "./feedingLogsSlice";

export const selectFeedingLogsForStation = (state: RootState, stationId: string) =>
  state.feedingLogs.byStationId[stationId] ?? emptyStationFeedingLogs;
