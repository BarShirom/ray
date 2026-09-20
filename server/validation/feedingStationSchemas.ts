import { z } from "zod";

export const createFeedingStationSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  estimatedCats: z.number().int().nonnegative().default(0),
  estimatedKittens: z.number().int().nonnegative().default(0),
  image: z.string().optional(),
  notes: z.string().optional(),
});
