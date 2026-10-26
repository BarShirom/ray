import express, { type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import feedingStationRoutes from "./routes/feedingStationRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { requestParsers, requestErrorHandler } from "./middleware/requestParsing.js";

export function createLegacyApp() {
  const app = express();

  // Behind Railway proxy (needed if you set Secure cookies)
  app.set("trust proxy", 1);

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
  app.use(requestParsers());

  // --- routes ---
  // If TS still whines (e.g., if routes are JS), cast as Router at mount:
  app.use("/api/auth", authRoutes as Router);
  app.use("/api/reports", reportRoutes as Router);
  app.use("/api/feeding-stations", feedingStationRoutes);

  // health
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });
  app.get("/", (_req, res) => {
    res.send("Ray backend is running!");
  });

  app.use(requestErrorHandler);
  return app;
}
