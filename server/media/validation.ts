import { z } from "zod";
import { createFeedingStationSchema } from "../validation/feedingStationSchemas.js";
import { createReportSchema } from "../validation/reportSchemas.js";
import { MAX_BYTES } from "./types.js";
export const intentSchema = z.object({
  purpose: z.enum(["station", "report"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteLength: z.number().int().min(1).max(MAX_BYTES),
  checksum: z.string().regex(/^[A-Za-z0-9+/]{43}=$/).refine(s => Buffer.from(s, "base64").toString("base64") === s),
}).strict();
export const assetIdSchema = z.string().uuid();
export const mediaStationSchema = createFeedingStationSchema.extend({ image: z.never().optional(), imageAssetId: assetIdSchema.optional() });
export const mediaReportSchema = createReportSchema.extend({ media: z.array(z.never()).max(0).optional(), mediaAssetIds: z.array(assetIdSchema).max(3).refine(ids => new Set(ids).size === ids.length).optional() });
