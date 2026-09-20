import type { CreateFeedingStationData } from "./types";

export function validateStationCreation(data: CreateFeedingStationData): string | null {
  if (!data.name.trim()) return "Station name is required.";
  if (!data.location || !Number.isFinite(data.location.lat) || !Number.isFinite(data.location.lng)) {
    return "Select a location on the map.";
  }
  if (!Number.isInteger(data.estimatedCats) || data.estimatedCats < 0 ||
      !Number.isInteger(data.estimatedKittens) || data.estimatedKittens < 0) {
    return "Cat and kitten counts must be non-negative whole numbers.";
  }
  if (data.image) {
    try {
      if (!["https:", "http:"].includes(new URL(data.image).protocol)) throw new Error();
    } catch {
      return "The image must be an uploaded web URL.";
    }
  }
  return null;
}
