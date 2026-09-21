import assert from "node:assert/strict";
import FeedingStation from "../../dist/models/FeedingStationModel.js";
import FeedingLog from "../../dist/models/FeedingLogModel.js";
import { document } from "./contracts.mjs";

// Persistence seam only: verifies requested filter/sort, not MongoDB execution.
export function stubFeedingLogDatabase(t, state, stationId) {
  t.mock.method(FeedingStation, "findById", (id) => {
    assert.equal(id, stationId);
    state.events.push("station");
    return { lean: async () => state.station };
  });
  t.mock.method(FeedingLog, "create", async (data) => {
    state.events.push("create");
    state.created = data;
    return document(FeedingLog, data);
  });
  t.mock.method(FeedingLog, "find", (filter) => {
    assert.deepEqual(filter, { stationId });
    state.events.push("logs");
    return { sort(order) {
      assert.deepEqual(order, { fedAt: -1, createdAt: -1 });
      return { lean: async () => state.history };
    } };
  });
}
