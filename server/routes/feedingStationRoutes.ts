import express, { type RequestHandler } from "express";
import { createFeedingStationHandlers } from "../controllers/feedingStationController.js";
import { createFeedingLogHandlers } from "../controllers/feedingLogController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validateBody } from "../middleware/validateBody.js";
import { createFeedingStationSchema } from "../validation/feedingStationSchemas.js";
import { createFeedingLogSchema } from "../validation/feedingLogSchemas.js";
import type { FeedingStationStore } from "../feedingStations/feedingStationStore.js";
import type { FeedingLogStore } from "../feedingLogs/feedingLogStore.js";
import { mongoFeedingStationStore } from "../feedingStations/mongoFeedingStationStore.js";
import { mongoFeedingLogStore } from "../feedingLogs/mongoFeedingLogStore.js";

export function createFeedingStationRouter(stations: FeedingStationStore, logs: FeedingLogStore, authenticate: RequestHandler) {
  const { createFeedingStation, getAllFeedingStations, getFeedingStationById } = createFeedingStationHandlers(stations);
  const { createFeedingLog, getLogsForStation } = createFeedingLogHandlers(stations, logs);
  const router = express.Router();
  router.post("/", authenticate, validateBody(createFeedingStationSchema), createFeedingStation);
  router.get("/", getAllFeedingStations);
  router.post("/:stationId/feedings", authenticate, validateBody(createFeedingLogSchema), createFeedingLog);
  router.get("/:stationId/feedings", getLogsForStation);
  router.get("/:id", getFeedingStationById);
  return router;
}

export default createFeedingStationRouter(mongoFeedingStationStore, mongoFeedingLogStore, authMiddleware);
