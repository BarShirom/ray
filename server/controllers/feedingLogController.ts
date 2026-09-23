import type { RequestHandler } from "express";
import { mongoFeedingLogStore } from "../feedingLogs/mongoFeedingLogStore.js";
import { mongoFeedingStationStore } from "../feedingStations/mongoFeedingStationStore.js";
import { serializeFeedingLog } from "../serializers/feedingLogResponse.js";
import { isPublicId } from "../utils/publicId.js";
import type { FeedingStationStore } from "../feedingStations/feedingStationStore.js";
import type { FeedingLogStore } from "../feedingLogs/feedingLogStore.js";
import { FeedingStationMissingError, FeedingStationInactiveError } from "../feedingLogs/feedingPersistenceErrors.js";

export function createFeedingLogHandlers(stations: FeedingStationStore, logs: FeedingLogStore) {
  const createFeedingLog: RequestHandler = async (req, res, next) => {
    const { stationId } = req.params;
    if (!isPublicId(stationId)) {
      res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "stationId", message: "Invalid feeding station ID" }],
      });
      return;
    }

    try {
      const station = await stations.findByPublicId(stationId);
      if (!station) {
        res.status(404).json({ message: "Feeding station not found" });
        return;
      }
      if (!station.active) {
        res.status(409).json({ message: "Feeding station is inactive" });
        return;
      }

      const { fedAt, period, food, water, note } = req.body;
      const log = await logs.create({
        stationId,
        userId: req.user._id,
        fedAt,
        period,
        food,
        water,
        note,
      });

      res.status(201).json(serializeFeedingLog(log));
    } catch (err) {
      if (err instanceof FeedingStationMissingError) {
        res.status(404).json({ message: "Feeding station not found" });
        return;
      }
      if (err instanceof FeedingStationInactiveError) {
        res.status(409).json({ message: "Feeding station is inactive" });
        return;
      }
      next(err);
    }
  };

  const getLogsForStation: RequestHandler = async (req, res, next) => {
    const { stationId } = req.params;
    if (!isPublicId(stationId)) {
      res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "stationId", message: "Invalid feeding station ID" }],
      });
      return;
    }

    try {
      const station = await stations.findByPublicId(stationId);
      if (!station) {
        res.status(404).json({ message: "Feeding station not found" });
        return;
      }

      const records = await logs.listForStation(stationId);

      res.json(records.map(serializeFeedingLog));
    } catch (err) {
      next(err);
    }
  };

  return { createFeedingLog, getLogsForStation };
}

export const { createFeedingLog, getLogsForStation } = createFeedingLogHandlers(mongoFeedingStationStore, mongoFeedingLogStore);
