import type { RequestHandler } from "express";
import type { StationPrivacyStore } from "../feedingStations/stationPrivacyStore.js";
import { noQueryOrReject, pageOrReject, privacyError, stationIdOrReject } from "../feedingStations/stationPrivacyHttp.js";

export function createFeedingStationHandlers(stations: StationPrivacyStore) {
  const createFeedingStation: RequestHandler = async (req, res, next) => {
    if (!noQueryOrReject(req, res)) return;
    try {
      const { name, location, estimatedCats, estimatedKittens, notes, imageAssetId } = req.body;
      const station = await stations.create(req.user, {
        name, location, estimatedCats, estimatedKittens, notes,
        ...(imageAssetId === undefined ? {} : { imageAssetId }),
      });
      res.status(201).json(station);
    } catch (error) { if (!privacyError(error, res)) next(error); }
  };
  const getAllFeedingStations: RequestHandler = async (req, res, next) => {
    const page = pageOrReject(req, res, "stations");
    if (!page) return;
    try {
      const result = await stations.list(req.user, page);
      if (result.nextCursor) res.set("X-Next-Cursor", result.nextCursor);
      res.json(result.items);
    } catch (error) { if (!privacyError(error, res)) next(error); }
  };
  const getFeedingStationById: RequestHandler = async (req, res, next) => {
    const id = stationIdOrReject(req.params.id, "id", res);
    if (!id || !noQueryOrReject(req, res)) return;
    try {
      const station = await stations.detail(req.user, id);
      if (!station) { res.status(404).json({ message: "Feeding station not found" }); return; }
      res.json(station);
    } catch (error) { if (!privacyError(error, res)) next(error); }
  };
  return { createFeedingStation, getAllFeedingStations, getFeedingStationById };
}
