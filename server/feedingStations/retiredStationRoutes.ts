import { Router } from "express";
import { privateResponse } from "../middleware/privateResponse.js";

/** Fail closed for every legacy station/grant path without touching storage. */
export function createRetiredStationRouter() {
  const router = Router();
  router.use(privateResponse);
  router.use((_req, res) => {
    res.status(503).json({ message: "Station service unavailable" });
  });
  return router;
}
