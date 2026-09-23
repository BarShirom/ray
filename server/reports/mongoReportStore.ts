import Report from "../models/ReportModel.js";
import type { ReportRecord, ReportStore, ReportUserSummary, ReportNameFields } from "./reportStore.js";

const POPULATE = [
  { path: "createdBy", select: "firstName lastName name" },
  { path: "assignedTo", select: "firstName lastName name" },
];

type UserSource = ReportNameFields & { _id: { toString(): string } };
type PopulatedUsers = { createdBy?: UserSource | null; assignedTo?: UserSource | null };
type ReportSource = Omit<ReportRecord, "publicId" | "createdBy" | "assignedTo" | "legacyVersion"> & PopulatedUsers & {
  _id: { toString(): string };
  __v?: number | null;
};

function userSummary(user: UserSource | null | undefined): ReportUserSummary | null | undefined {
  if (user == null) return user;
  return {
    publicId: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
  };
}

function reportRecord(report: ReportSource): ReportRecord {
  return {
    publicId: report._id.toString(),
    description: report.description,
    type: report.type,
    status: report.status,
    location: report.location == null ? report.location : { lat: report.location.lat, lng: report.location.lng },
    media: report.media == null ? report.media : [...report.media],
    createdBy: userSummary(report.createdBy),
    assignedTo: userSummary(report.assignedTo),
    createdByName: report.createdByName,
    assignedToName: report.assignedToName,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    ...(report.__v === undefined ? {} : { legacyVersion: report.__v }),
  };
}

export const mongoReportStore: ReportStore = {
  async create(input) {
    const report = await Report.create({
      description: input.description,
      type: input.type,
      location: { lat: input.location.lat, lng: input.location.lng },
      media: input.media ?? [],
      status: "new",
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    });
    const populated = await report.populate<PopulatedUsers>(POPULATE);
    return reportRecord(populated.toObject());
  },

  async listAll() {
    const reports = await Report.find().sort({ createdAt: -1 }).populate<PopulatedUsers>(POPULATE).lean();
    return reports.map(reportRecord);
  },

  async listAssignedTo(userId) {
    const reports = await Report.find({ assignedTo: userId })
      .sort({ createdAt: -1 }).populate<PopulatedUsers>(POPULATE).lean();
    return reports.map(reportRecord);
  },

  async claim(publicId, assignee) {
    const report = await Report.findById(publicId);
    if (!report) return { kind: "not-found" };
    if (report.status !== "new") return { kind: "not-new" };

    // Keep the existing read/check/save sequence (not an atomic claim).
    report.set("assignedTo", assignee.publicId);
    report.assignedToName = assignee.name ?? report.assignedToName ?? null;
    report.status = "in-progress";
    await report.save();
    const populated = await report.populate<PopulatedUsers>(POPULATE);
    return { kind: "claimed", report: reportRecord(populated.toObject()) };
  },

  async resolve(publicId, userId) {
    const report = await Report.findById(publicId);
    if (!report) return { kind: "not-found" };
    // Authorize with the stored ID before population can replace a dangling ref with null.
    const assignedToId = report.assignedTo?.toString();
    if (assignedToId !== userId) return { kind: "not-assignee" };

    report.status = "resolved";
    await report.save();
    const populated = await report.populate<PopulatedUsers>(POPULATE);
    return { kind: "resolved", report: reportRecord(populated.toObject()) };
  },

  async getGlobalStats() {
    const total = await Report.countDocuments();
    const resolved = await Report.countDocuments({ status: "resolved" });
    const inProgress = await Report.countDocuments({ status: "in-progress" });
    const newReports = await Report.countDocuments({ status: "new" });
    return { total, resolved, inProgress, new: newReports };
  },

  async getAssignedStats(userId) {
    const total = await Report.countDocuments({ assignedTo: userId });
    const resolved = await Report.countDocuments({ assignedTo: userId, status: "resolved" });
    const inProgress = await Report.countDocuments({ assignedTo: userId, status: "in-progress" });
    return { total, resolved, inProgress };
  },
};
