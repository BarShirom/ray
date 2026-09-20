import type { RequestHandler } from "express";
import mongoose from "mongoose";
import FeedingLogModel from "../models/FeedingLogModel.js";
import FeedingStationModel from "../models/FeedingStationModel.js";

export const createFeedingLog: RequestHandler = async (req, res, next) => {
  const { stationId } = req.params;
  if (!mongoose.isObjectIdOrHexString(stationId)) {
    res.status(400).json({
      message: "Validation failed",
      errors: [{ field: "stationId", message: "Invalid feeding station ID" }],
    });
    return;
  }

  try {
    const station = await FeedingStationModel.findById(stationId).lean();
    if (!station) {
      res.status(404).json({ message: "Feeding station not found" });
      return;
    }
    if (!station.active) {
      res.status(409).json({ message: "Feeding station is inactive" });
      return;
    }

    const { fedAt, period, food, water, note } = req.body;
    const log = await FeedingLogModel.create({
      stationId,
      userId: req.user._id,
      fedAt,
      period,
      food,
      water,
      note,
    });

    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

export const getLogsForStation: RequestHandler = async (req, res, next) => {
  const { stationId } = req.params;
  if (!mongoose.isObjectIdOrHexString(stationId)) {
    res.status(400).json({
      message: "Validation failed",
      errors: [{ field: "stationId", message: "Invalid feeding station ID" }],
    });
    return;
  }

  try {
    const station = await FeedingStationModel.findById(stationId).lean();
    if (!station) {
      res.status(404).json({ message: "Feeding station not found" });
      return;
    }

    const logs = await FeedingLogModel.find({ stationId })
      .sort({ fedAt: -1, createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (err) {
    next(err);
  }
};
