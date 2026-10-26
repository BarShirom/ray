import express, { type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createReportRouter } from "./routes/reportRoutes.js";
import { createFeedingStationRouter } from "./routes/feedingStationRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { requestParsers, requestErrorHandler } from "./middleware/requestParsing.js";
import { createAbuseProtection, type AbuseOptions } from "./security/abuseProtection.js";
import { mongoUserStore } from "./users/mongoUserStore.js";
import { mongoReportStore } from "./reports/mongoReportStore.js";
import { mongoFeedingStationStore } from "./feedingStations/mongoFeedingStationStore.js";
import { mongoFeedingLogStore } from "./feedingLogs/mongoFeedingLogStore.js";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { optionalAuthMiddleware } from "./middleware/optionalAuthMiddleware.js";

export function createLegacyApp(abuseOptions?: AbuseOptions) {
  const app = express();
  const abuse = createAbuseProtection(abuseOptions);

  // A future deployment must explicitly review its proxy topology. Client
  // identity for abuse limits always comes from the direct socket peer.
  app.set("trust proxy", false);

  // --- simple logger ---
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // === CORS allowlist with suffix support (for Vercel previews) ===
  const allowTokens = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Accept exact origins and tokens that start with "." (suffix match)
  function isAllowedOrigin(origin?: string) {
    if (!origin) return true; // allow curl/postman
    try {
      const url = new URL(origin);
      const host = url.hostname;
      for (const token of allowTokens) {
        if (token.startsWith(".")) {
          const suffix = token.slice(1); // ".foo.com" -> "foo.com"
          if (host === suffix || host.endsWith(`.${suffix}`)) return true;
        } else {
          if (origin === token) return true; // full exact origin match
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  const corsOptions: cors.CorsOptions = {
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Retry-After"],
  };

  app.use(cors(corsOptions));
  // (Optional) You can omit this; global cors() already answers preflight.
  // app.options("*", cors(corsOptions));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // Retired before any body parsing or storage-provider access.
  app.use("/api/upload", uploadRoutes);
  // Cheap liveness bypasses body parsing. All remaining paths share admission,
  // so an unknown URL cannot bypass the parser's ingress budget.
  app.get("/healthz", (_req, res) => { res.status(200).send("ok"); });
  app.use(abuse.ingress);
  app.use(requestParsers());

  // --- routes ---
  app.use("/api/auth", createAuthRouter(mongoUserStore, undefined, abuse) as Router);
  app.use("/api/reports", createReportRouter(mongoReportStore, authMiddleware, optionalAuthMiddleware, undefined, abuse) as Router);
  app.use("/api/feeding-stations", createFeedingStationRouter(mongoFeedingStationStore, mongoFeedingLogStore, authMiddleware, undefined, abuse));

  app.get("/", (_req, res) => {
    res.send("Ray backend is running!");
  });

  app.use(requestErrorHandler);
  return app;
}
