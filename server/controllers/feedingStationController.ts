import type { RequestHandler } from "express";
import { mongoFeedingStationStore as stations } from "../feedingStations/mongoFeedingStationStore.js";
import { serializeFeedingStation } from "../serializers/feedingStationResponse.js";
import { isPublicId } from "../utils/publicId.js";

export const createFeedingStation: RequestHandler = async (req, res, next) => {
  try {
    const { name, location, estimatedCats, estimatedKittens, image, notes } =
      req.body;

    const station = await stations.create({
      name,
      location,
      estimatedCats,
      estimatedKittens,
      image,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json(serializeFeedingStation(station));
  } catch (err) {
    next(err);
  }
};

export const getAllFeedingStations: RequestHandler = async (_req, res, next) => {
  try {
    const records = await stations.listActive();

    res.json(records.map(serializeFeedingStation));
  } catch (err) {
    next(err);
  }
};

export const getFeedingStationById: RequestHandler = async (req, res, next) => {
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
