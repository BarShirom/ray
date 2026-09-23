import { localConfig } from "../db/local-config.js";

export function previewConfig(env: NodeJS.ProcessEnv = process.env) {
  const database = localConfig("preview", env.RAY_PREVIEW_DATABASE_URL);
  const secret = env.RAY_PREVIEW_JWT_SECRET;
  if (!secret || secret.trim().length < 32 || secret === env.JWT_SECRET) {
    throw new Error("Set RAY_PREVIEW_JWT_SECRET to a dedicated local-only secret of at least 32 characters, different from JWT_SECRET");
  }
  return { database, secret };
}
