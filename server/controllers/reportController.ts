import { Request, Response } from "express";
import ReportModel from "../models/ReportModel";

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
    const reports = await ReportModel.find({ assignedTo: req.user?._id })
      .populate("createdBy", "firstName lastName")
      .populate("assignedTo", "firstName lastName");
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your reports" });
  }
};

export const createReport = async (req: Request, res: Response) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    const userId = req.user?.id || null;
    const { description, type, location } = req.body;
    const parsedLocation = JSON.parse(location);

    const media = Array.isArray(req.files)
      ? (req.files as Express.Multer.File[]).map(
          (file) =>
            `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
        )
      : [];
    console.log("MEDIA URLS TO SAVE:", media);
    const newReport = new ReportModel({
      description,
      type,
      location: parsedLocation,
      media,
      status: "new",
      createdBy: req.user?._id ?? null,
      createdByName:
        req.user?.firstName && req.user?.lastName
          ? `${req.user.firstName} ${req.user.lastName}`
          : null,
      createdAt: new Date(),
    });

    console.log("✅ Saving Report:", {
      createdBy: req.user?._id,
      createdByName: req.user?.firstName + " " + req.user?.lastName,
    });
    const saved = await newReport.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Failed to create report" });
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

    // Assign to current user
    report.assignedTo = req.user._id;
    report.assignedToName = `${req.user.firstName} ${req.user.lastName}`;
    report.status = "in-progress";
    await report.save();

    // ✅ Return plain object with string ID
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

    if (report.assignedTo?.toString() !== req.user._id.toString()) {
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
    const total = await ReportModel.countDocuments({
      assignedTo: req.user!._id,
    });
    const resolved = await ReportModel.countDocuments({
      assignedTo: req.user!._id,
      status: "resolved",
    });
    const inProgress = await ReportModel.countDocuments({
      assignedTo: req.user!._id,
      status: "in-progress",
    });

    res.json({ total, resolved, inProgress });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your stats" });
  }
};
