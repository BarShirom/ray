import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import type { createPostgres } from "../db/connection.js";
import { createPostgresUserStore } from "../users/postgresUserStore.js";
import { createPostgresFeedingStationStore } from "../feedingStations/postgresFeedingStationStore.js";
import { createPostgresFeedingLogStore } from "../feedingLogs/postgresFeedingLogStore.js";
import { createPostgresReportStore } from "../reports/postgresReportStore.js";
import { createAuthRouter } from "../routes/authRoutes.js";
import { createFeedingStationRouter } from "../routes/feedingStationRoutes.js";
import { createReportRouter } from "../routes/reportRoutes.js";
import { createAuthMiddleware } from "../middleware/authMiddleware.js";
import { createOptionalAuthMiddleware } from "../middleware/optionalAuthMiddleware.js";

import { createMediaService } from "../media/service.js";
import { createMediaRouter } from "../media/routes.js";
import { MediaError, type MediaStorage } from "../media/types.js";
import { mediaStationSchema, mediaReportSchema } from "../media/validation.js";

// Pure composition: no dotenv, startup, upload provider or connection side effects.
export function createPreviewApp(connection: ReturnType<typeof createPostgres>, secret: string, storage?: MediaStorage, mediaPrefix = "dev/") {
  const media = storage ? createMediaService(connection.db, storage, mediaPrefix) : undefined;
  const users = createPostgresUserStore(connection.db);
  const stations = media?.stations ?? createPostgresFeedingStationStore(connection.db);
  const logs = createPostgresFeedingLogStore(connection.db);
  const reports = media?.reports ?? createPostgresReportStore(connection.db);
  const getSecret = () => secret;
  const auth = createAuthMiddleware(users, getSecret);
  const app = express();
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === "http://127.0.0.1:5175") callback(null, true);
      else callback(new Error("Preview origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Refuse before parsing multipart bodies; this composition never imports uploads.
  app.use("/api/upload", (_req, res) => {
    res.status(503).json({ message: "uploads unavailable in local preview" });
  });
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.get("/api/media/capabilities", (_req, res) => { res.set("Cache-Control", "no-store").json({ enabled: !!media, maxBytes: 8388608, stationImages: 1, reportImages: 3 }); });
  if (media) app.use("/api/media", createMediaRouter(media, auth));
  else app.use("/api/media", (_req, res) => { res.status(503).json({ message: "Image uploads are disabled in local preview" }); });
  app.use("/api/auth", createAuthRouter(users, getSecret));
  app.use("/api/feeding-stations", createFeedingStationRouter(stations, logs, auth, media ? mediaStationSchema : undefined));
  app.use("/api/reports", createReportRouter(reports, auth, createOptionalAuthMiddleware(users, getSecret), media ? mediaReportSchema : undefined));
  app.get("/healthz", (_req, res) => { res.send("ok"); });
  app.get("/readyz", async (_req, res) => {
    try {
      await connection.pool.query("SELECT 1");
      res.json({ ready: true });
    } catch {
      res.status(503).json({ ready: false });
    }
  });
  app.get("/", (_req, res) => { res.send("Ray local PostgreSQL preview (synthetic data)"); });
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof MediaError) { res.status(err.status).json({ message: err.message }); return; }
    // Domain adapters already supply safe errors; never log raw SQL/request detail.
    console.error("Local preview request failed");
    res.status(500).json({ error: err?.name || "ServerError", message: err?.message || "Internal Server Error" });
  };
  app.use(errorHandler);
  return app;
}
