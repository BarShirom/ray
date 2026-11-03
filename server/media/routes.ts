import express from "express";
import type { Request, RequestHandler, Response, NextFunction } from "express";
import type { MediaService } from "./service.js";
import { MediaError } from "./types.js";
import { createAbuseProtection, type AbuseProtection } from "../security/abuseProtection.js";
import { privateResponse } from "../middleware/privateResponse.js";
const forwardError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof MediaError && error.status === 429 && error.retryAfter) res.set("Retry-After", String(error.retryAfter));
  next(error);
};
const requireEmptyRequest = (req: Request, operation: "read" | "completion") => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length || Object.keys(req.query).length) {
    throw new MediaError(400, `Send an empty image ${operation} request`);
  }
};
export function createMediaRouter(service: MediaService, auth: RequestHandler, strictOptionalAuth: RequestHandler, abuse: AbuseProtection = createAbuseProtection()) {
  // A sub-application owns its ETag setting; changing it must not alter the
  // independent Report JSON policy on the parent application.
  const router = express();
  router.disable("etag");
  router.use(privateResponse);
  router.post("/uploads", auth, async (req, res, next) => {
    try { res.status(201).json(await service.issue(req.user._id, req.body)); } catch (e) { forwardError(e, res, next); }
  });
  router.post("/:assetId/complete", auth, async (req, res, next) => {
    try {
      requireEmptyRequest(req, "completion");
      res.json(await service.complete(req.user._id, req.params.assetId));
    } catch (e) { forwardError(e, res, next); }
  });
  router.post("/:assetId/read-url", auth, abuse.publicRead, async (req, res, next) => {
    try {
      requireEmptyRequest(req, "read");
      // end(), rather than Express send/json, avoids conditional ETag/304 handling
      // for a response containing a short-lived bearer capability.
      res.type("json").end(JSON.stringify(await service.readUrl(req.params.assetId, req.user)));
    } catch (e) { forwardError(e, res, next); }
  });
  router.get("/:assetId/content", strictOptionalAuth, abuse.publicRead, async (req, res, next) => {
    try {
      if (Object.keys(req.query).some(key => key !== "retry") || req.query.retry !== undefined && req.query.retry !== "1") throw new MediaError(400, "Invalid image read query");
      res.redirect(302, await service.content(req.params.assetId, req.user ?? null));
    } catch (e) { forwardError(e, res, next); }
  });
  return router;
}
