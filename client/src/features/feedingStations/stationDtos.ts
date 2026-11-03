import type { FeedingLog, FeedingRecency, FeedingSummary } from "../feedingLogs/types";
import { StationProtocolError } from "./protectedStationApi";
import type { FeedingStation } from "./types";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const instant = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

export function readStation(value: unknown, detail = false): FeedingStation {
  if (!object(value) || !id(value._id) || typeof value.name !== "string" || value.name.length > 400 ||
    !object(value.location) || typeof value.location.lat !== "number" || !Number.isFinite(value.location.lat) || Math.abs(value.location.lat) > 90 ||
    typeof value.location.lng !== "number" || !Number.isFinite(value.location.lng) || Math.abs(value.location.lng) > 180 ||
    !count(value.estimatedCats) || !count(value.estimatedKittens) || typeof value.active !== "boolean" ||
    !object(value.permissions) || typeof value.permissions.canManage !== "boolean" || typeof value.permissions.canFeed !== "boolean" ||
    value.permissions.canFeed !== value.active || "visibility" in value || "createdBy" in value ||
    (detail && value.notes !== undefined && value.notes !== null && (typeof value.notes !== "string" || value.notes.length > 20_000)) ||
    (detail && value.image !== undefined && (typeof value.image !== "string" || value.image.length > 2048))) throw new StationProtocolError();
  return {
    _id: value._id, name: value.name,
    location: { lat: value.location.lat, lng: value.location.lng },
    estimatedCats: value.estimatedCats, estimatedKittens: value.estimatedKittens,
    active: value.active,
    permissions: { canManage: value.permissions.canManage, canFeed: value.permissions.canFeed },
    ...(detail && value.notes !== undefined ? { notes: value.notes as string | null } : {}),
    ...(detail && value.image !== undefined ? { image: value.image as string } : {}),
  };
}

export function readOwnLog(value: unknown, stationId: string): FeedingLog {
  if (!object(value) || !id(value._id) || value.stationId !== stationId || "userId" in value ||
    !instant(value.fedAt) || !instant(value.createdAt) || !instant(value.updatedAt) ||
    typeof value.food !== "boolean" || typeof value.water !== "boolean" ||
    (value.period !== undefined && value.period !== null && !["morning", "noon", "evening"].includes(value.period as string)) ||
    (value.note !== undefined && value.note !== null && (typeof value.note !== "string" || value.note.length > 8_000))) throw new StationProtocolError();
  return {
    _id: value._id, stationId, fedAt: value.fedAt, food: value.food, water: value.water,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(value.period === undefined ? {} : { period: value.period as FeedingLog["period"] }),
    ...(value.note === undefined ? {} : { note: value.note as string | null }),
  };
}

const recencies: FeedingRecency[] = ["under-2h", "2-to-6h", "6-to-12h", "12-to-24h", "older", "no-record"];
export function readSummary(value: unknown): FeedingSummary {
  if (!object(value) || !object(value.food) || !object(value.water) ||
    !recencies.includes(value.food.recency as FeedingRecency) || !recencies.includes(value.water.recency as FeedingRecency)) throw new StationProtocolError();
  return { food: { recency: value.food.recency as FeedingRecency }, water: { recency: value.water.recency as FeedingRecency } };
}
