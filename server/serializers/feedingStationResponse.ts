import type { FeedingStationRecord } from "../feedingStations/feedingStationStore.js";

export function serializeFeedingStation(station: FeedingStationRecord) {
  return {
    _id: station.publicId,
    name: station.name,
    location: station.location == null ? station.location : {
      lat: station.location.lat,
      lng: station.location.lng,
    },
    estimatedCats: station.estimatedCats,
    estimatedKittens: station.estimatedKittens,
    image: station.image,
    notes: station.notes,
    createdBy: station.createdBy,
    active: station.active,
    createdAt: station.createdAt == null ? station.createdAt : station.createdAt.toJSON(),
    updatedAt: station.updatedAt == null ? station.updatedAt : station.updatedAt.toJSON(),
    ...(station.legacyVersion === undefined ? {} : { __v: station.legacyVersion }),
  };
}
