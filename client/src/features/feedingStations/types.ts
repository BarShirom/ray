export interface FeedingStation {
  _id: string;
  name: string;
  location: { lat: number; lng: number };
  estimatedCats: number;
  estimatedKittens: number;
  image?: string;
  notes?: string | null;
  active: boolean;
  permissions: { canManage: boolean; canFeed: boolean };
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
