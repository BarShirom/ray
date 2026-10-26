import "dotenv/config";
import mongoose from "mongoose";
import { createLegacyApp } from "./app.js";

const app = createLegacyApp();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const mongoURI = process.env.MONGO_URI!;

mongoose
  .connect(mongoURI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => {
      console.log(`Server running on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
