export interface FeedingStation {
  _id: string;
  name: string;
  location: { lat: number; lng: number };
  estimatedCats: number;
  estimatedKittens: number;
  image?: string;
  notes?: string;
  createdBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedingStationData {
  imageAssetId?: string;
  name: string;
  location: { lat: number; lng: number };
  estimatedCats: number;
  estimatedKittens: number;
  image?: string;
  notes?: string;
}
