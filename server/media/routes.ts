import express from "express";
import type { RequestHandler } from "express";
import type { MediaService } from "./service.js";
export function createMediaRouter(service: MediaService, auth: RequestHandler) {
  const router = express.Router();
  router.post("/uploads", auth, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.status(201).json(await service.issue(req.user._id, req.body)); } catch (e) { next(e); }
  });
  router.post("/:assetId/complete", auth, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await service.complete(req.user._id, req.params.assetId)); } catch (e) { next(e); }
  });
  router.get("/:assetId/content", async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    try { res.redirect(302, await service.content(req.params.assetId)); } catch (e) { next(e); }
  });
  return router;
}
