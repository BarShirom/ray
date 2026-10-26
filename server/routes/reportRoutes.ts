import type { ZodType } from "zod";
import express, { type RequestHandler } from "express";
import { createReportHandlers } from "../controllers/reportController.js";
import type { ReportStore } from "../reports/reportStore.js";
import { mongoReportStore } from "../reports/mongoReportStore.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { optionalAuthMiddleware } from "../middleware/optionalAuthMiddleware.js";
import { validateBody } from "../middleware/validateBody.js";
import { createReportSchema } from "../validation/reportSchemas.js";
import { createAbuseProtection, type AbuseProtection } from "../security/abuseProtection.js";

export function createReportRouter(reports: ReportStore, authenticate: RequestHandler, optionalAuthenticate: RequestHandler, creationSchema: ZodType = createReportSchema, abuse: AbuseProtection = createAbuseProtection()) {
  const { getAllReports, getMyReports, createReport, claimReport, resolveReport, getGlobalStats, getUserStats } = createReportHandlers(reports);
  const router = express.Router();
  const creationLimit: RequestHandler = (req, res, next) =>
    (req.user ? abuse.accountWrite : abuse.guestWrite)(req, res, next);
  router.get("/", abuse.publicRead, getAllReports);
  router.post("/", optionalAuthenticate, creationLimit, validateBody(creationSchema), createReport);
  router.get("/me", abuse.publicRead, authenticate, getMyReports);
  router.patch("/:id/claim", authenticate, abuse.accountWrite, claimReport);
  router.patch("/:id/resolve", authenticate, abuse.accountWrite, resolveReport);
  router.get("/stats", abuse.publicRead, authenticate, getGlobalStats);
  router.get("/stats/me", abuse.publicRead, authenticate, getUserStats);
  return router;
}

export default createReportRouter(mongoReportStore, authMiddleware, optionalAuthMiddleware);
