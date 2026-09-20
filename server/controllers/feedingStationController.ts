import type { RequestHandler } from "express";
import mongoose from "mongoose";
import FeedingStationModel from "../models/FeedingStationModel.js";

export const createFeedingStation: RequestHandler = async (req, res, next) => {
  try {
    const { name, location, estimatedCats, estimatedKittens, image, notes } =
      req.body;

    const station = await FeedingStationModel.create({
      name,
      location,
      estimatedCats,
      estimatedKittens,
      image,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json(station);
  } catch (err) {
    next(err);
  }
};

export const getAllFeedingStations: RequestHandler = async (_req, res, next) => {
  try {
    const stations = await FeedingStationModel.find({ active: true })
      .sort({ createdAt: -1 })
      .lean();

    res.json(stations);
  } catch (err) {
    next(err);
  }
};

export const getFeedingStationById: RequestHandler = async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    res.status(400).json({
      message: "Validation failed",
      errors: [{ field: "id", message: "Invalid feeding station ID" }],
    });
    return;
  }

  try {
    const station = await FeedingStationModel.findById(req.params.id).lean();

    if (!station) {
      res.status(404).json({ message: "Feeding station not found" });
      return;
    }

    res.json(station);
  } catch (err) {
    next(err);
  }
};
