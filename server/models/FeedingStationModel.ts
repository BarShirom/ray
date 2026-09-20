import mongoose from "mongoose";

const feedingStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: {
      lat: { type: Number, required: true, validate: Number.isFinite },
      lng: { type: Number, required: true, validate: Number.isFinite },
    },
    estimatedCats: {
      type: Number,
      min: 0,
      default: 0,
      validate: Number.isInteger,
    },
    estimatedKittens: {
      type: Number,
      min: 0,
      default: 0,
      validate: Number.isInteger,
    },
    image: String,
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("FeedingStation", feedingStationSchema);
