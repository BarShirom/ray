import FeedingStation from "../models/FeedingStationModel.js";
import type { FeedingStationRecord, FeedingStationStore } from "./feedingStationStore.js";

type StationSource = Omit<FeedingStationRecord, "publicId" | "createdBy" | "legacyVersion"> & {
  _id: { toString(): string };
  createdBy?: { toString(): string } | null;
  __v?: number | null;
};

function stationRecord(station: StationSource): FeedingStationRecord {
  return {
    publicId: station._id.toString(),
    name: station.name,
    location: station.location == null ? station.location : {
      lat: station.location.lat,
      lng: station.location.lng,
    },
    estimatedCats: station.estimatedCats,
    estimatedKittens: station.estimatedKittens,
    image: station.image,
    notes: station.notes,
    createdBy: station.createdBy == null ? station.createdBy : station.createdBy.toString(),
    active: station.active,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
    ...(station.__v === undefined ? {} : { legacyVersion: station.__v }),
  };
}

export const mongoFeedingStationStore: FeedingStationStore = {
  async create(input) {
    const station = await FeedingStation.create({
      name: input.name,
      location: { lat: input.location.lat, lng: input.location.lng },
      estimatedCats: input.estimatedCats,
      estimatedKittens: input.estimatedKittens,
      image: input.image,
      notes: input.notes,
      createdBy: input.createdBy,
    });
    return stationRecord(station.toObject());
  },

  async listActive() {
    const stations = await FeedingStation.find({ active: true }).sort({ createdAt: -1 }).lean();
    return stations.map(stationRecord);
  },

  async findByPublicId(publicId) {
    const station = await FeedingStation.findById(publicId).lean();
    return station ? stationRecord(station) : null;
  },
};
