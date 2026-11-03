import type { AuthIdentity } from "../users/userStore.js";
import type { CreateFeedingLog } from "../feedingLogs/feedingLogStore.js";
import type { CreateFeedingStation } from "./feedingStationStore.js";

export interface StationDiscovery {
  _id: string;
  name: string;
  location: { lat: number; lng: number };
  estimatedCats: number;
  estimatedKittens: number;
  visibility: "sensitive" | "regular";
  permissions: { canManage: boolean; canFeed: boolean };
}
export interface StationDetail extends StationDiscovery {
  active: boolean;
  notes?: string | null;
  image?: string;
}
export interface OwnFeedingLog {
  _id: string;
  stationId: string;
  fedAt: string;
  food: boolean;
  water: boolean;
  period?: "morning" | "noon" | "evening" | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}
export type FeedingRecency = "under-2h" | "2-to-6h" | "6-to-12h" | "12-to-24h" | "older" | "no-record";
export interface FeedingSummary { food: { recency: FeedingRecency }; water: { recency: FeedingRecency } }
export interface StationPageOptions { limit: number; after?: string }
export interface StationPage<T> { items: T[]; nextCursor?: string }

/** Only the required-auth HTTP boundary supplies identity. Each operation must
 * resolve its own opaque station principal within its live transaction. */
export interface StationPrivacyStore {
  list(identity: AuthIdentity, page: StationPageOptions): Promise<StationPage<StationDiscovery>>;
  detail(identity: AuthIdentity, stationId: string): Promise<StationDetail | null>;
  create(identity: AuthIdentity, input: Omit<CreateFeedingStation, "createdBy">): Promise<StationDetail>;
  ownLogs(identity: AuthIdentity, stationId: string, page: StationPageOptions): Promise<StationPage<OwnFeedingLog>>;
  summary(identity: AuthIdentity, stationId: string): Promise<FeedingSummary>;
  createFeeding(identity: AuthIdentity, stationId: string, input: Omit<CreateFeedingLog, "stationId" | "userId">): Promise<OwnFeedingLog>;
}

export class StationCursorError extends Error {
  constructor() { super("Invalid cursor"); }
}
export class StationAuthenticationError extends Error {
  constructor() { super("Invalid authentication"); }
}
export class StationMediaUnavailableError extends Error {
  constructor() { super("Image uploads are disabled in local preview"); }
}
