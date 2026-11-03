import type { RequestHandler } from "express";
import type { StationPrivacyStore } from "../feedingStations/stationPrivacyStore.js";
import { noQueryOrReject, pageOrReject, privacyError, stationIdOrReject } from "../feedingStations/stationPrivacyHttp.js";

export function createFeedingLogHandlers(stations: StationPrivacyStore) {
  const createFeedingLog: RequestHandler = async (req, res, next) => {
    const stationId = stationIdOrReject(req.params.stationId, "stationId", res);
    if (!stationId || !noQueryOrReject(req, res)) return;
    try {
      const { fedAt, period, food, water, note } = req.body;
      const log = await stations.createFeeding(req.user, stationId, { fedAt, period, food, water, note });
      res.status(201).json(log);
    } catch (error) { if (!privacyError(error, res)) next(error); }
  };
  const getLogsForStation: RequestHandler = async (req, res, next) => {
    const stationId = stationIdOrReject(req.params.stationId, "stationId", res);
    if (!stationId) return;
    const page = pageOrReject(req, res, "logs");
    if (!page) return;
    try {
      const result = await stations.ownLogs(req.user, stationId, page);
      if (result.nextCursor) res.set("X-Next-Cursor", result.nextCursor);
      res.json(result.items);
    } catch (error) { if (!privacyError(error, res)) next(error); }
  };
  const getFeedingSummary: RequestHandler = async (req, res, next) => {
    const stationId = stationIdOrReject(req.params.stationId, "stationId", res);
    if (!stationId || !noQueryOrReject(req, res)) return;
    try { res.json(await stations.summary(req.user, stationId)); }
    catch (error) { if (!privacyError(error, res)) next(error); }
  };
  return { createFeedingLog, getLogsForStation, getFeedingSummary };
}
