import FeedingLog from "../models/FeedingLogModel.js";
import type { FeedingLogRecord, FeedingLogStore } from "./feedingLogStore.js";

type LogSource = Omit<FeedingLogRecord, "publicId" | "stationId" | "userId" | "legacyVersion"> & {
  _id: { toString(): string };
  stationId?: { toString(): string } | null;
  userId?: { toString(): string } | null;
  __v?: number | null;
};

function logRecord(log: LogSource): FeedingLogRecord {
  return {
    publicId: log._id.toString(),
    stationId: log.stationId == null ? log.stationId : log.stationId.toString(),
    userId: log.userId == null ? log.userId : log.userId.toString(),
    fedAt: log.fedAt,
    period: log.period,
    food: log.food,
    water: log.water,
    note: log.note,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    ...(log.__v === undefined ? {} : { legacyVersion: log.__v }),
  };
}

export const mongoFeedingLogStore: FeedingLogStore = {
  async create(input) {
    const log = await FeedingLog.create({
      stationId: input.stationId,
      userId: input.userId,
      fedAt: input.fedAt,
      period: input.period,
      food: input.food,
      water: input.water,
      note: input.note,
    });
    return logRecord(log.toObject());
  },

  async listForStation(stationId) {
    const logs = await FeedingLog.find({ stationId }).sort({ fedAt: -1, createdAt: -1 }).lean();
    return logs.map(logRecord);
  },
};
