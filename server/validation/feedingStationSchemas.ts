import { z } from "zod";
import { INPUT_LIMITS, TEXT_LIMIT_MESSAGE } from "./inputBounds.js";

export const createFeedingStationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(INPUT_LIMITS.stationName, TEXT_LIMIT_MESSAGE),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  estimatedCats: z.number().int().nonnegative().default(0),
  estimatedKittens: z.number().int().nonnegative().default(0),
  // Legacy strings are preserved in storage, but new external station URLs are
  // never accepted or reflected through the protected API.
  image: z.never().optional(),
  imageAssetId: z.string().uuid().optional(),
  notes: z.string().max(INPUT_LIMITS.description, TEXT_LIMIT_MESSAGE).optional(),
  // Classification is dormant metadata for beta. Never accept an input that
  // could falsely promise restriction to a subset of authenticated accounts.
  visibility: z.never().optional(),
});
