import mongoose from "mongoose";
const reportSchema = new mongoose.Schema({
    description: { type: String, required: true },
    type: {
        type: String,
        enum: ["emergency", "food", "general"],
        required: true,
    },
    status: {
        type: String,
        enum: ["new", "in-progress", "resolved"],
        default: "new",
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    createdByName: { type: String, default: null },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    assignedToName: { type: String, default: null },
    media: {
        type: [String],
        default: [],
    },
}, { timestamps: true });
reportSchema.index({ status: 1 });
reportSchema.index({ assignedTo: 1 });
export default mongoose.model("Report", reportSchema);
