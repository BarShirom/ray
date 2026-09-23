export class FeedingStationMissingError extends Error {
  constructor() { super("Feeding station not found"); }
}

export class FeedingStationInactiveError extends Error {
  constructor() { super("Feeding station is inactive"); }
}

// Drizzle errors can include SQL and bound values. Do not forward their message,
// cause or properties to the existing HTTP error handler or application logs.
export async function safeFeedingPersistence<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FeedingStationMissingError || error instanceof FeedingStationInactiveError) throw error;
    const safe = new Error("Feeding persistence operation failed");
    safe.name = "PersistenceError";
    throw safe;
  }
}
