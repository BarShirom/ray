import { z } from "zod";
import { createFeedingStationSchema } from "../validation/feedingStationSchemas.js";
import { createReportSchema } from "../validation/reportSchemas.js";
import { MAX_BYTES } from "./types.js";
import { boundedArray } from "../validation/inputBounds.js";
export const intentSchema = z.object({
  purpose: z.enum(["station", "report"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteLength: z.number().int().min(1).max(MAX_BYTES),
  checksum: z.string().length(44).regex(/^[A-Za-z0-9+/]{43}=$/).refine(s => s.length === 44 && Buffer.from(s, "base64").toString("base64") === s),
}).strict();
export const assetIdSchema = z.string().uuid();
export const mediaStationSchema = createFeedingStationSchema.extend({ image: z.never().optional(), imageAssetId: assetIdSchema.optional() });
export const mediaReportSchema = createReportSchema.extend({ media: boundedArray(z.never(), 0).optional(), mediaAssetIds: boundedArray(assetIdSchema, 3).refine(ids => new Set(ids).size === ids.length).optional() });
