import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const mongoURI = process.env.MONGO_URI;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
// --- middlewares ---
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});
app.use(cors({
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true); // allow curl/postman
        if (allowedOrigins.includes(origin))
            return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// --- routes ---
app.use("/api/upload", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
// health
app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
});
app.get("/", (_req, res) => {
    res.send("Ray backend is running!");
});
// NOTE: avoid local disk on Railway
// app.use("/uploads", express.static("uploads"));
// --- error handler (must have 4 args) ---
app.use((err, _req, res, _next) => {
    console.error("[error]", err?.name, err?.message, err?.stack);
    res.status(500).json({
        error: err?.name || "ServerError",
        message: err?.message || "Internal Server Error",
    });
});
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
