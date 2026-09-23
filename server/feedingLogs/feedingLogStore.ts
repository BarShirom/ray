export type FeedingPeriod = "morning" | "noon" | "evening";

export interface FeedingLogRecord {
  publicId: string;
  stationId?: string | null;
  userId?: string | null;
  fedAt?: Date | null;
  // Reads preserve stored values, even legacy strings outside the creation enum.
  period?: string | null;
  food?: boolean | null;
  water?: boolean | null;
  note?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  // Existing MongoDB __v is HTTP compatibility metadata, not a domain requirement.
  legacyVersion?: number | null;
}

export interface CreateFeedingLog {
  stationId: string;
  userId: string;
  fedAt?: Date;
  period?: FeedingPeriod;
  food?: boolean;
  water?: boolean;
  note?: string;
}

export interface FeedingLogStore {
  create(input: CreateFeedingLog): Promise<FeedingLogRecord>;
  listForStation(stationId: string): Promise<FeedingLogRecord[]>;
}
