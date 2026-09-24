import type { RequestHandler } from "express";
import { mongoFeedingStationStore } from "../feedingStations/mongoFeedingStationStore.js";
import { serializeFeedingStation } from "../serializers/feedingStationResponse.js";
import { isPublicId } from "../utils/publicId.js";
import type { FeedingStationStore } from "../feedingStations/feedingStationStore.js";

export function createFeedingStationHandlers(stations: FeedingStationStore) {
  const createFeedingStation: RequestHandler = async (req, res, next) => {
    try {
      const { name, location, estimatedCats, estimatedKittens, image, notes } =
        req.body;

      const station = await stations.create({
        name,
        location,
        estimatedCats,
        estimatedKittens,
        image,
        ...(req.body.imageAssetId !== undefined ? { imageAssetId: req.body.imageAssetId } : {}),
        notes,
        createdBy: req.user._id,
      });

      res.status(201).json(serializeFeedingStation(station));
    } catch (err) {
      next(err);
    }
  };

  const getAllFeedingStations: RequestHandler = async (_req, res, next) => {
    try {
      const records = await stations.listActive();

      res.json(records.map(serializeFeedingStation));
    } catch (err) {
      next(err);
    }
  };

  const getFeedingStationById: RequestHandler = async (req, res, next) => {
    if (!isPublicId(req.params.id)) {
      res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "id", message: "Invalid feeding station ID" }],
      });
      return;
    }

    try {
      const station = await stations.findByPublicId(req.params.id);

      if (!station) {
        res.status(404).json({ message: "Feeding station not found" });
        return;
      }

      res.json(serializeFeedingStation(station));
    } catch (err) {
      next(err);
    }
  };

  return { createFeedingStation, getAllFeedingStations, getFeedingStationById };
}

export const { createFeedingStation, getAllFeedingStations, getFeedingStationById } = createFeedingStationHandlers(mongoFeedingStationStore);
