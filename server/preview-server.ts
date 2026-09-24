import { startPreview } from "./preview/runtime.js";

try {
  const runtime = await startPreview();
  console.log(`Ray local PostgreSQL preview ready at http://127.0.0.1:4001 (synthetic data; images ${runtime.mediaEnabled ? "S3 enabled" : "disabled"})`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    // Hard deadline also bounds active DB operations and a stalled pool shutdown.
    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();
    try { await runtime.close(); }
    catch { console.error("Preview shutdown failed"); process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  // Startup helpers deliberately replace database/listen errors with safe messages.
  console.error(error instanceof Error ? error.message : "Preview startup failed");
  process.exitCode = 1;
}
