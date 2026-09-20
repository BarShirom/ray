import express from "express";
import {
  getAllReports,
  getMyReports,
  createReport,
  claimReport,
  resolveReport,
  getGlobalStats,
  getUserStats,
} from "../controllers/reportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { optionalAuthMiddleware } from "../middleware/optionalAuthMiddleware.js";
import { validateBody } from "../middleware/validateBody.js";
import { createReportSchema } from "../validation/reportSchemas.js";

const router = express.Router();

router.get("/", getAllReports);

router.post(
  "/",
  optionalAuthMiddleware,
  validateBody(createReportSchema),
  createReport
);

router.get("/me", authMiddleware, getMyReports);
router.patch("/:id/claim", authMiddleware, claimReport);
router.patch("/:id/resolve", authMiddleware, resolveReport);
router.get("/stats", authMiddleware, getGlobalStats);
router.get("/stats/me", authMiddleware, getUserStats);

export default router;
