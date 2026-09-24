export const MEDIA_ACCOUNT = "438298964276";
export const MEDIA_BUCKET = "ray-media-438298964276-eu-north-1-an";
export const MEDIA_REGION = "eu-north-1";
export const MEDIA_ROLE = "arn:aws:iam::438298964276:role/RayMediaDevRole";
export type S3Config = { bucket: string; region: string; prefix: string; profile: string; account: string; role: string };
export function mediaConfig(env: NodeJS.ProcessEnv = process.env): S3Config | undefined {
  const mode = env.RAY_MEDIA_MODE ?? "disabled";
  if (mode === "disabled") return undefined;
  if (mode !== "s3") throw new Error("RAY_MEDIA_MODE must be disabled or s3");
  const required = { RAY_S3_BUCKET: MEDIA_BUCKET, RAY_S3_REGION: MEDIA_REGION, RAY_S3_PREFIX: "dev/", RAY_S3_PROFILE: "ray-s3-dev", RAY_S3_EXPECTED_ACCOUNT: MEDIA_ACCOUNT, RAY_S3_EXPECTED_ROLE: MEDIA_ROLE };
  if (Object.entries(required).some(([key, value]) => env[key] !== value)
    || Object.keys(env).some(key => ((key.startsWith("AWS_ENDPOINT_URL") || key === "RAY_S3_ENDPOINT") && env[key]))) {
    throw new Error("S3 preview requires the exact reviewed bucket, eu-north-1, dev/ prefix, ray-s3-dev profile, account and RayMediaDevRole; endpoint overrides are refused");
  }
  const run = env.RAY_S3_TEST_RUN;
  if (run && (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run) || env.RAY_S3_LIVE_TEST_APPROVED !== "synthetic-bounded-test")) throw new Error("Live test namespace requires an approved UUID run");
  return { bucket: MEDIA_BUCKET, region: MEDIA_REGION, prefix: run ? `dev/test-runs/${run}/` : "dev/", profile: "ray-s3-dev", account: MEDIA_ACCOUNT, role: MEDIA_ROLE };
}
export function assertMediaIdentity(identity: { Account?: string; Arn?: string }, config: S3Config) {
  const prefix = `arn:aws:sts::${config.account}:assumed-role/RayMediaDevRole/`;
  if (identity.Account !== config.account || !identity.Arn?.startsWith(prefix) || !identity.Arn.slice(prefix.length) || config.role !== MEDIA_ROLE) {
    throw new Error("S3 requires assumed RayMediaDevRole in the expected account; root, broad roles and other identities are refused");
  }
}
