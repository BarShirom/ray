import { z } from "zod";
import { INPUT_LIMITS, TEXT_LIMIT_MESSAGE } from "./inputBounds.js";

export const createFeedingStationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(INPUT_LIMITS.stationName, TEXT_LIMIT_MESSAGE),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  estimatedCats: z.number().int().nonnegative().default(0),
  estimatedKittens: z.number().int().nonnegative().default(0),
  image: z.string().max(INPUT_LIMITS.url, TEXT_LIMIT_MESSAGE).optional(),
  notes: z.string().max(INPUT_LIMITS.description, TEXT_LIMIT_MESSAGE).optional(),
});
