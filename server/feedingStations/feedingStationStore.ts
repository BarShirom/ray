// Reads allow historical missing/null fields; creation still uses the existing model defaults.
export interface FeedingStationRecord {
  publicId: string;
  name?: string | null;
  location?: { lat?: number | null; lng?: number | null } | null;
  estimatedCats?: number | null;
  estimatedKittens?: number | null;
  image?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  active?: boolean | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  // Existing MongoDB __v is HTTP compatibility metadata, not a domain requirement.
  legacyVersion?: number | null;
}

export interface CreateFeedingStation {
  name: string;
  location: { lat: number; lng: number };
  estimatedCats?: number;
  estimatedKittens?: number;
  image?: string;
  notes?: string;
  createdBy: string;
}

export interface FeedingStationStore {
  create(input: CreateFeedingStation): Promise<FeedingStationRecord>;
  listActive(): Promise<FeedingStationRecord[]>;
  findByPublicId(publicId: string): Promise<FeedingStationRecord | null>;
}
