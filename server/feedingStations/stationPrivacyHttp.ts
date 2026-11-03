import type { Request, Response } from "express";
import { FeedingStationInactiveError, FeedingStationMissingError } from "../feedingLogs/feedingPersistenceErrors.js";
import { isPublicId } from "../utils/publicId.js";
import { StationAuthenticationError, StationCursorError, StationMediaUnavailableError, type StationPageOptions } from "./stationPrivacyStore.js";

function validation(res: Response, field: string, message: string) {
  res.status(400).json({ message: "Validation failed", errors: [{ field, message }] });
}
export function stationIdOrReject(value: string, field: string, res: Response): string | null {
  if (!isPublicId(value)) { validation(res, field, "Invalid feeding station ID"); return null; }
  return value.toLowerCase();
}
export function pageOrReject(req: Request, res: Response, kind: "stations" | "logs"): StationPageOptions | null {
  const query = req.query;
  if (Object.keys(query).some(key => key !== "limit" && key !== "after")) {
    validation(res, "query", "Unsupported query field"); return null;
  }
  const max = kind === "stations" ? 200 : 100;
  const fallback = kind === "stations" ? 100 : 50;
  if (query.limit !== undefined && (typeof query.limit !== "string" || !/^[1-9][0-9]{0,2}$/.test(query.limit) || Number(query.limit) > max)) {
    validation(res, "limit", "Invalid page limit"); return null;
  }
  if (query.after !== undefined && (typeof query.after !== "string" || !/^[0-9a-f]{24}$/.test(query.after))) {
    validation(res, "after", "Invalid cursor"); return null;
  }
  return { limit: query.limit === undefined ? fallback : Number(query.limit),
    ...(query.after === undefined ? {} : { after: query.after as string }) };
}
export function noQueryOrReject(req: Request, res: Response): boolean {
  if (!Object.keys(req.query).length) return true;
  validation(res, "query", "Unsupported query field"); return false;
}
export function privacyError(error: unknown, res: Response): boolean {
  if (error instanceof FeedingStationMissingError) {
    res.status(404).json({ message: "Feeding station not found" }); return true;
  }
  if (error instanceof FeedingStationInactiveError) {
    res.status(409).json({ message: "Feeding station is inactive" }); return true;
  }
  if (error instanceof StationCursorError) {
    validation(res, "after", "Invalid cursor"); return true;
  }
  if (error instanceof StationAuthenticationError) {
    res.status(401).json({ error: "Invalid token" }); return true;
  }
  if (error instanceof StationMediaUnavailableError) {
    res.status(503).json({ message: error.message }); return true;
  }
  return false;
}
