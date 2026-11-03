export type FeedingPeriod = "morning" | "noon" | "evening";

export interface FeedingLog {
  _id: string;
  stationId: string;
  fedAt: string;
  period?: FeedingPeriod | null;
  food: boolean;
  water: boolean;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FeedingRecency = "under-2h" | "2-to-6h" | "6-to-12h" | "12-to-24h" | "older" | "no-record";
export interface FeedingSummary {
  food: { recency: FeedingRecency };
  water: { recency: FeedingRecency };
}

export interface CreateFeedingLogData {
  fedAt?: string;
  period?: FeedingPeriod;
  food?: boolean;
  water?: boolean;
  note?: string;
}
