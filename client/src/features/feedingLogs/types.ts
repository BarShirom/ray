export type FeedingPeriod = "morning" | "noon" | "evening";

export interface FeedingLog {
  _id: string;
  stationId: string;
  userId: string;
  fedAt: string;
  period?: FeedingPeriod;
  food: boolean;
  water: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedingLogData {
  fedAt?: string;
  period?: FeedingPeriod;
  food?: boolean;
  water?: boolean;
  note?: string;
}
