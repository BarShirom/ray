import mongoose from "mongoose";

const feedingLogSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedingStation",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fedAt: { type: Date, default: Date.now },
    period: { type: String, enum: ["morning", "noon", "evening"] },
    food: { type: Boolean, default: true },
    water: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("FeedingLog", feedingLogSchema);
