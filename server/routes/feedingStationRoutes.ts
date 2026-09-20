import express from "express";
import {
  createFeedingStation,
  getAllFeedingStations,
  getFeedingStationById,
} from "../controllers/feedingStationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validateBody } from "../middleware/validateBody.js";
import { createFeedingStationSchema } from "../validation/feedingStationSchemas.js";

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  validateBody(createFeedingStationSchema),
  createFeedingStation
);
router.get("/", getAllFeedingStations);
router.get("/:id", getFeedingStationById);

export default router;
