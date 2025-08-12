import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import reportRoutes from "./routes/reportRoutes";

dotenv.config();

const app = express();
const port = process.env.PORT 
const mongoURI = process.env.MONGO_URI!;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/uploads", express.static("uploads"));

mongoose
  .connect(mongoURI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

app.get("/", (req, res) => {
  res.send("Ray backend is running!");
});
