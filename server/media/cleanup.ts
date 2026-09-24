import { readFile } from "node:fs/promises";
import { createPostgres } from "../db/connection.js";
import { localConfigFromEnv, assertDatabaseIdentity } from "../db/local-config.js";
import { assertMigrationState } from "../preview/migration-state.js";
import { mediaConfig } from "./config.js";
import { openS3Storage } from "./s3.js";
import { createMediaService } from "./service.js";
import type { MediaStorage } from "./types.js";

// Only the exact dedicated local preview DB. Dry run does not resolve AWS credentials.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--apply")) throw new Error("Use no arguments for dry run, or --apply reviewed-manifest.json");
  const connection = createPostgres(localConfigFromEnv("preview"));
  let opened: Awaited<ReturnType<typeof openS3Storage>> | undefined;
  try {
    await assertDatabaseIdentity(connection.pool, "preview");
    await assertMigrationState(connection.pool);
    const unavailable = async (): Promise<never> => { throw new Error("Dry run cannot access S3"); };
    const dryStorage: MediaStorage = { signUpload: unavailable, source: unavailable, putOutput: unavailable, signRead: unavailable, deleteObject: unavailable };
    const candidates = await createMediaService(connection.db, dryStorage).cleanup();
    if (!args.length) console.log(JSON.stringify(candidates, null, 2));
    else {
      const reviewed: unknown = JSON.parse((await readFile(args[1], "utf8")).replace(/^\uFEFF/, ""));
      if (!Array.isArray(reviewed) || reviewed.length > 100) throw new Error("Invalid manifest");
      const eligible = new Map(candidates.map(row => [row.assetId, row]));
      for (const entry of reviewed) {
        const current = eligible.get(entry.assetId);
        if (!current || current.sourceKey !== entry.sourceKey || current.outputKey !== entry.outputKey) throw new Error("Manifest changed or is no longer eligible; regenerate dry run");
      }
      const config = mediaConfig();
      if (!config) throw new Error("Explicit S3 activation required for cleanup");
      opened = await openS3Storage(config);
      console.log(JSON.stringify(await createMediaService(connection.db, opened.storage).cleanup(reviewed.map(row => row.assetId)), null, 2));
    }
  } finally { opened?.close(); await connection.close(); }
} catch {
  console.error("Media cleanup refused or incomplete. Check the preview DB, reviewed exact manifest and restricted profile. Regenerate dry run before retrying; no raw storage details logged.");
  process.exitCode = 1;
}
