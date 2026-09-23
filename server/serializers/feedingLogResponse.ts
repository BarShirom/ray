import type { FeedingLogRecord } from "../feedingLogs/feedingLogStore.js";

export function serializeFeedingLog(log: FeedingLogRecord) {
  return {
    _id: log.publicId,
    stationId: log.stationId,
    userId: log.userId,
    fedAt: log.fedAt == null ? log.fedAt : log.fedAt.toJSON(),
    period: log.period,
    food: log.food,
    water: log.water,
    note: log.note,
    createdAt: log.createdAt == null ? log.createdAt : log.createdAt.toJSON(),
    updatedAt: log.updatedAt == null ? log.updatedAt : log.updatedAt.toJSON(),
    ...(log.legacyVersion === undefined ? {} : { __v: log.legacyVersion }),
  };
}
