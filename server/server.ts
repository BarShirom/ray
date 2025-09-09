import express, { type Router, type ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const mongoURI = process.env.MONGO_URI!;

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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- routes ---
// If TS still whines (e.g., if routes are JS), cast as Router at mount:
app.use("/api/upload", uploadRoutes as Router);
app.use("/api/auth", authRoutes as Router);
app.use("/api/reports", reportRoutes as Router);

// health
app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});
app.get("/", (_req, res) => {
  res.send("Ray backend is running!");
});

// --- typed error handler (4 args, fixes overload confusion) ---
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[error]", err?.name, err?.message, err?.stack);
  res.status(500).json({
    error: err?.name || "ServerError",
    message: err?.message || "Internal Server Error",
  });
};
app.use(errorHandler);

// --- boot ---
mongoose
  .connect(mongoURI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
