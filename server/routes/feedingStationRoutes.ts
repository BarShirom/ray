import type { ZodType } from "zod";
import express, { type RequestHandler } from "express";
import { createFeedingStationHandlers } from "../controllers/feedingStationController.js";
import { createFeedingLogHandlers } from "../controllers/feedingLogController.js";
import { validateBody } from "../middleware/validateBody.js";
import { privateResponse } from "../middleware/privateResponse.js";
import { createFeedingStationSchema } from "../validation/feedingStationSchemas.js";
import { createFeedingLogSchema } from "../validation/feedingLogSchemas.js";
import type { StationPrivacyStore } from "../feedingStations/stationPrivacyStore.js";
import { createRetiredStationRouter } from "../feedingStations/retiredStationRoutes.js";
import { createAbuseProtection, type AbuseProtection } from "../security/abuseProtection.js";

/** Only the explicitly protected store can be composed into PostgreSQL HTTP.
 * A subapp disables Express ETag generation without changing Report behavior. */
export function createFeedingStationRouter(stations: StationPrivacyStore, authenticate: RequestHandler, creationSchema: ZodType = createFeedingStationSchema, abuse: AbuseProtection = createAbuseProtection()) {
  const { createFeedingStation, getAllFeedingStations, getFeedingStationById } = createFeedingStationHandlers(stations);
  const { createFeedingLog, getLogsForStation, getFeedingSummary } = createFeedingLogHandlers(stations);
  const router = express();
  router.disable("etag");
  router.use(privateResponse);
  // Covers implicit HEAD and unsupported methods/children before any lookup.
  router.use(authenticate);
  router.post("/", abuse.accountWrite, validateBody(creationSchema), createFeedingStation);
  router.get("/", abuse.publicRead, getAllFeedingStations);
  router.post("/:stationId/feedings", abuse.accountWrite, validateBody(createFeedingLogSchema), createFeedingLog);
  router.get("/:stationId/feedings", abuse.publicRead, getLogsForStation);
  router.get("/:stationId/feeding-summary", abuse.publicRead, getFeedingSummary);
  router.get("/:id", abuse.publicRead, getFeedingStationById);
  router.use((_req, res) => { res.status(404).json({ message: "Feeding station not found" }); });
  return router;
}

// Legacy/default compositions cannot fall back to public Mongo station handlers.
export default createRetiredStationRouter();
