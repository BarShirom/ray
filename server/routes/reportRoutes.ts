import express from "express";
import {
  getAllReports,
  getMyReports,
  createReport,
  claimReport,
  resolveReport,
  getGlobalStats,
  getUserStats,
} from "../controllers/reportController";
import { authMiddleware } from "../middleware/authMiddleware";
import upload from "../middleware/uploadMiddleware";
import { optionalAuthMiddleware } from "../middleware/optionalAuthMiddleware";

const router = express.Router();

router.get("/", getAllReports);

router.post(
  "/",
  optionalAuthMiddleware,

  createReport
);

router.get("/me", authMiddleware, getMyReports);
router.patch("/:id/claim", authMiddleware, claimReport);
router.patch("/:id/resolve", authMiddleware, resolveReport);
router.get("/stats", authMiddleware, getGlobalStats);
router.get("/stats/me", authMiddleware, getUserStats);

export default router;
