// src/controllers/reportController.ts
import { Request, Response, RequestHandler } from "express";
import ReportModel from "../models/ReportModel.js";

type ReportType = "emergency" | "food" | "general"; // adjust to your union

export const createReport: RequestHandler = async (req, res, next) => {
  try {
    const { description, type, location, media } = req.body as {
      description: string;
      type: ReportType;
      location: { lat: number; lng: number };
      media?: string[];
    };

    const doc = await ReportModel.create({
      description,
      type,
      location,
      media: media ?? [],
      status: "new",
      createdBy: (req as any).user?.id ?? null, // if optionalAuth attaches user
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

export const getAllReports = async (req: Request, res: Response) => {
  try {
    const reports = await ReportModel.find()
      .populate("createdBy", "firstName lastName")
      .populate("assignedTo", "firstName lastName");
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getMyReports = async (req: Request, res: Response) => {
  try {
    const reports = await ReportModel.find({
      assignedTo: (req as any).user?._id,
    })
      .populate("createdBy", "firstName lastName")
      .populate("assignedTo", "firstName lastName");
    res.json(reports);
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
    report.assignedToName = `${user.firstName} ${user.lastName}`;
    report.status = "in-progress";
    await report.save();

    res.json({
      ...report.toObject(),
      assignedTo: report.assignedTo.toString(),
      assignedToName: report.assignedToName,
    });
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

    res.json(report);
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
