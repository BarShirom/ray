import express from "express";
import type { RequestHandler, Response, NextFunction } from "express";
import type { MediaService } from "./service.js";
import { MediaError } from "./types.js";
import { createAbuseProtection, type AbuseProtection } from "../security/abuseProtection.js";
const forwardError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof MediaError && error.status === 429 && error.retryAfter) res.set("Retry-After", String(error.retryAfter));
  next(error);
};
export function createMediaRouter(service: MediaService, auth: RequestHandler, abuse: AbuseProtection = createAbuseProtection()) {
  const router = express.Router();
  router.post("/uploads", auth, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.status(201).json(await service.issue(req.user._id, req.body)); } catch (e) { forwardError(e, res, next); }
  });
  router.post("/:assetId/complete", auth, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await service.complete(req.user._id, req.params.assetId)); } catch (e) { forwardError(e, res, next); }
  });
  router.get("/:assetId/content", abuse.publicRead, async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    try { res.redirect(302, await service.content(req.params.assetId)); } catch (e) { forwardError(e, res, next); }
  });
  return router;
}
