import { Request, Response, RequestHandler } from "express";
import ReportModel from "../models/ReportModel.js";

type ReportType = "emergency" | "food" | "general";

// ---- shared helpers ----
const POPULATE = [
  { path: "createdBy", select: "firstName lastName name" },
  { path: "assignedTo", select: "firstName lastName name" },
] as const;

function fullNameFrom(u: any | null | undefined) {
  if (!u) return null;
  if (u.name) return u.name;
  const parts = [u.firstName, u.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function withComputedNames<T extends any>(r: T) {
  // NOTE: r could be a plain object from .lean() or a Mongoose doc.toObject()
  const createdByName =
    (r as any).createdByName ?? fullNameFrom((r as any).createdBy);
  const assignedToName =
    (r as any).assignedToName ?? fullNameFrom((r as any).assignedTo);

  return {
    ...(r as any),
    createdByName: createdByName ?? null,
    assignedToName: assignedToName ?? null,
  };
}

// ---- controllers ----

export const createReport: RequestHandler = async (req, res, next) => {
  try {
    const { description, type, location, media } = req.body as {
      description: string;
      type: ReportType;
      location: { lat: number; lng: number };
      media?: string[];
    };

    const user = (req as any).user; // expect {_id, firstName, lastName, (optional name)}
    const createdBy = user?._id ?? null;
    const createdByName = user ? fullNameFrom(user) : "Guest";

    const doc = await ReportModel.create({
      description,
      type,
      location,
      media: media ?? [],
      status: "new",
      createdBy,
      createdByName, // ensure set at creation
    });

    // Populate for a consistent response shape, then compute names as a fallback
    const populated = await doc.populate(POPULATE as any);
    const out = withComputedNames(populated.toObject());
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
};

export const getAllReports = async (req: Request, res: Response) => {
  try {
    const reports = await ReportModel.find()
      .sort({ createdAt: -1 })
      .populate(POPULATE as any)
      .lean(); // return plain objects

    // Ensure names are present even if stored fields were null
    const out = reports.map(withComputedNames);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getMyReports = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const reports = await ReportModel.find({
      assignedTo: user?._id, // your logic currently returns "assigned to me"
    })
      .sort({ createdAt: -1 })
      .populate(POPULATE as any)
      .lean();

    const out = reports.map(withComputedNames);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your reports" });
  }
};

export const claimReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const report = await ReportModel.findById(req.params.id);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    if (report.status !== "new") {
      res.status(400).json({ error: "Report is already claimed or resolved" });
      return;
    }

    const user = (req as any).user;
    report.assignedTo = user._id;
    report.assignedToName = fullNameFrom(user) ?? report.assignedToName ?? null;
    report.status = "in-progress";
    await report.save();

    const populated = await report.populate(POPULATE as any);
    const out = withComputedNames(populated.toObject());
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: "Failed to claim report" });
  }
};

export const resolveReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const report = await ReportModel.findById(req.params.id);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const user = (req as any).user;
    if (report.assignedTo?.toString() !== user._id.toString()) {
      res
        .status(403)
        .json({ error: "Only assigned user can resolve the report" });
      return;
    }

    report.status = "resolved";
    await report.save();

    const populated = await report.populate(POPULATE as any);
    const out = withComputedNames(populated.toObject());
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve report" });
  }
};

export const getGlobalStats = async (req: Request, res: Response) => {
  try {
    const total = await ReportModel.countDocuments();
    const resolved = await ReportModel.countDocuments({ status: "resolved" });
    const inProgress = await ReportModel.countDocuments({
      status: "in-progress",
    });
    const newReports = await ReportModel.countDocuments({ status: "new" });

    res.json({ total, resolved, inProgress, new: newReports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch global stats" });
  }
};

export const getUserStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const total = await ReportModel.countDocuments({ assignedTo: user._id });
    const resolved = await ReportModel.countDocuments({
      assignedTo: user._id,
      status: "resolved",
    });
    const inProgress = await ReportModel.countDocuments({
      assignedTo: user._id,
      status: "in-progress",
    });

    res.json({ total, resolved, inProgress });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your stats" });
  }
};
