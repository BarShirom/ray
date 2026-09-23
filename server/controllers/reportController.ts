import { Request, Response, RequestHandler } from "express";
import { mongoReportStore as reports } from "../reports/mongoReportStore.js";
import { reportFullName } from "../reports/reportNames.js";
import type { ReportType } from "../reports/reportStore.js";
import { serializeReport } from "../serializers/reportResponse.js";

export const createReport: RequestHandler = async (req, res, next) => {
  try {
    const { description, type, location, media } = req.body as {
      description: string;
      type: ReportType;
      location: { lat: number; lng: number };
      media?: string[];
    };
    const user = req.user;
    const report = await reports.create({
      description,
      type,
      location,
      media,
      createdBy: user?._id ?? null,
      createdByName: user ? reportFullName(user) : "Guest",
    });
    res.status(201).json(serializeReport(report));
  } catch (err) {
    next(err);
  }
};

export const getAllReports = async (_req: Request, res: Response) => {
  try {
    res.json((await reports.listAll()).map(serializeReport));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getMyReports = async (req: Request, res: Response) => {
  try {
    res.json((await reports.listAssignedTo(req.user?._id)).map(serializeReport));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your reports" });
  }
};

export const claimReport = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const outcome = await reports.claim(req.params.id, {
      publicId: req.user._id,
      name: reportFullName(req.user),
    });
    if (outcome.kind === "not-found") {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (outcome.kind === "not-new") {
      res.status(400).json({ error: "Report is already claimed or resolved" });
      return;
    }
    res.json(serializeReport(outcome.report));
  } catch (err) {
    res.status(500).json({ error: "Failed to claim report" });
  }
};

export const resolveReport = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const outcome = await reports.resolve(req.params.id, req.user._id);
    if (outcome.kind === "not-found") {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (outcome.kind === "not-assignee") {
      res.status(403).json({ error: "Only assigned user can resolve the report" });
      return;
    }
    res.json(serializeReport(outcome.report));
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve report" });
  }
};

export const getGlobalStats = async (_req: Request, res: Response) => {
  try {
    const { total, resolved, inProgress, new: newReports } = await reports.getGlobalStats();
    res.json({ total, resolved, inProgress, new: newReports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch global stats" });
  }
};

export const getUserStats = async (req: Request, res: Response) => {
  try {
    const { total, resolved, inProgress } = await reports.getAssignedStats(req.user._id);
    res.json({ total, resolved, inProgress });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your stats" });
  }
};
