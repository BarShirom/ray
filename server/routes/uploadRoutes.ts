import { Router } from "express";

const router = Router();

// Legacy MongoDB/Cloudinary uploads are retired. Mount before body parsers so
// every request is refused without reading a multipart body or loading a provider.
// PostgreSQL media uses its separate authenticated, private-S3 routes.
router.use((_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(503).json({ message: "Legacy media uploads are retired" });
});

export default router;
