import express, { type RequestHandler } from "express";
import { createReportHandlers } from "../controllers/reportController.js";
import type { ReportStore } from "../reports/reportStore.js";
import { mongoReportStore } from "../reports/mongoReportStore.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { optionalAuthMiddleware } from "../middleware/optionalAuthMiddleware.js";
import { validateBody } from "../middleware/validateBody.js";
import { createReportSchema } from "../validation/reportSchemas.js";

export function createReportRouter(reports: ReportStore, authenticate: RequestHandler, optionalAuthenticate: RequestHandler) {
  const { getAllReports, getMyReports, createReport, claimReport, resolveReport, getGlobalStats, getUserStats } = createReportHandlers(reports);
  const router = express.Router();
  router.get("/", getAllReports);
  router.post("/", optionalAuthenticate, validateBody(createReportSchema), createReport);
  router.get("/me", authenticate, getMyReports);
  router.patch("/:id/claim", authenticate, claimReport);
  router.patch("/:id/resolve", authenticate, resolveReport);
  router.get("/stats", authenticate, getGlobalStats);
  router.get("/stats/me", authenticate, getUserStats);
  return router;
}

export default createReportRouter(mongoReportStore, authMiddleware, optionalAuthMiddleware);
