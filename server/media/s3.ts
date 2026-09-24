import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromIni } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { assertMediaIdentity, type S3Config } from "./config.js";
import { digest } from "./image.js";
import { MediaError, unavailable, MAX_BYTES, UPLOAD_SECONDS, READ_SECONDS, type MediaStorage } from "./types.js";

// No ambient provider chain: every resolved session must identify as the restricted role.
// Both STS identity verification and S3 signing/operations use the SAME credential object.
export function restrictedCredentials(config: S3Config) {
  const base = fromIni({ profile: config.profile, ignoreCache: true,
    clientConfig: { region: config.region, ignoreConfiguredEndpointUrls: true } });
  let verified: { accessKeyId: string; sessionToken?: string } | undefined;
  return async () => {
    try {
      const credentials = await base();
      if (!credentials.sessionToken || !credentials.expiration || credentials.expiration.getTime() <= Date.now() + 30_000) throw unavailable();
      if (!verified || verified.accessKeyId !== credentials.accessKeyId || verified.sessionToken !== credentials.sessionToken) {
        const sts = new STSClient({ region: config.region, credentials, ignoreConfiguredEndpointUrls: true, maxAttempts: 2 });
        try { assertMediaIdentity(await sts.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(10_000) }), config); }
        finally { sts.destroy(); }
        verified = { accessKeyId: credentials.accessKeyId, sessionToken: credentials.sessionToken };
      }
      return credentials;
    } catch { throw unavailable(); }
  };
}

// Caller owns the client. Static synthetic credentials can be injected for offline signing tests.
export function createS3Storage(client: S3Client, config: S3Config): MediaStorage {
  const object = (key: string) => {
    if (!/^dev\/(?:test-runs\/[0-9a-f-]{36}\/)?(?:incoming\/[0-9a-f-]{36}|ready\/[0-9a-f-]{36}\.webp)$/.test(key)) throw new MediaError(400, "Invalid media storage key");
    return { Bucket: config.bucket, Key: key, ExpectedBucketOwner: config.account };
  };
  const isMissing = (e: unknown) => ["NoSuchKey", "NotFound"].includes((e as { name?: string })?.name ?? "");
  return {
    async signUpload(key, intent) {
      try {
        if (!key.startsWith(config.prefix + "incoming/")) throw new Error();
        const headers = { "content-type": intent.contentType, "if-none-match": "*", "x-amz-checksum-sha256": intent.checksum,
          "x-amz-server-side-encryption": "AES256", "x-amz-expected-bucket-owner": config.account };
        const command = new PutObjectCommand({ ...object(key), ContentType: intent.contentType, ContentLength: intent.byteLength,
          ChecksumSHA256: intent.checksum, IfNoneMatch: "*", ServerSideEncryption: "AES256" });
        const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_SECONDS,
          signableHeaders: new Set([...Object.keys(headers), "content-length"]), unhoistableHeaders: new Set(Object.keys(headers).filter(h => h.startsWith("x-amz-"))) });
        const signed = new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
        if (![...Object.keys(headers), "content-length"].every(h => signed.includes(h))) throw new Error();
        // Browser sets the signed Content-Length from the raw File/Blob; JS must not set it.
        return { url, headers };
      } catch { throw unavailable(); }
    },
    async source(key, intent) {
      const controller = new AbortController();
      let body: { destroy?: () => void } | undefined;
      const timer = setTimeout(() => { controller.abort(); body?.destroy?.(); }, 15_000);
      try {
        if (!key.includes("/incoming/")) throw new MediaError(400, "Invalid source key");
        const head = await client.send(new HeadObjectCommand({ ...object(key), ChecksumMode: "ENABLED" }), { abortSignal: controller.signal });
        if (head.ContentLength !== intent.byteLength || head.ContentLength > MAX_BYTES || head.ChecksumSHA256 !== intent.checksum || head.ContentType !== intent.contentType || !head.ETag) {
          throw new MediaError(422, "Uploaded length, type or checksum does not match its intent");
        }
        const result = await client.send(new GetObjectCommand({ ...object(key), IfMatch: head.ETag, ChecksumMode: "ENABLED" }), { abortSignal: controller.signal });
        body = result.Body as typeof body;
        if (!result.Body || result.ContentLength !== intent.byteLength) throw new MediaError(422, "Uploaded length does not match its intent");
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          length += chunk.length;
          if (length > intent.byteLength || length > MAX_BYTES) throw new MediaError(422, "Uploaded image exceeds its declared limit");
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        if (length !== intent.byteLength || digest(bytes) !== intent.checksum) throw new MediaError(422, "Uploaded image checksum mismatch");
        return bytes;
      } catch (e) {
        if (e instanceof MediaError) throw e;
        if (isMissing(e)) throw new MediaError(409, "Upload not found yet; finish uploading before completion");
        throw unavailable();
      } finally { clearTimeout(timer); controller.abort(); body?.destroy?.(); }
    },
    async putOutput(key, bytes, checksum) {
      try {
        if (!key.includes("/ready/")) throw new Error();
        await client.send(new PutObjectCommand({ ...object(key), Body: bytes, ContentLength: bytes.length, ContentType: "image/webp",
          ChecksumSHA256: checksum, IfNoneMatch: "*", ServerSideEncryption: "AES256", CacheControl: "private, max-age=60", ContentDisposition: "inline" }), { abortSignal: AbortSignal.timeout(15_000) });
      } catch (e) {
        if ((e as { name?: string })?.name !== "PreconditionFailed") throw unavailable();
        // Retry after a successful S3 write but failed DB update: accept only identical output.
        try {
          const head = await client.send(new HeadObjectCommand({ ...object(key), ChecksumMode: "ENABLED" }), { abortSignal: AbortSignal.timeout(10_000) });
          if (head.ChecksumSHA256 !== checksum || head.ContentLength !== bytes.length || head.ContentType !== "image/webp") throw new Error();
        } catch { throw unavailable(); }
      }
    },
    async signRead(key) {
      try {
        if (!key.includes("/ready/")) throw new Error();
        return await getSignedUrl(client, new GetObjectCommand({ ...object(key), ResponseContentType: "image/webp", ResponseContentDisposition: "inline" }), { expiresIn: READ_SECONDS });
      } catch { throw unavailable(); }
    },
    async deleteObject(key) {
      try { await client.send(new DeleteObjectCommand(object(key)), { abortSignal: AbortSignal.timeout(10_000) }); }
      catch (e) { if (!isMissing(e)) throw unavailable(); }
    },
  };
}
export async function openS3Storage(config: S3Config) {
  const credentials = restrictedCredentials(config);
  await credentials(); // Explicit activation only; imports and disabled mode do not resolve credentials.
  const client = new S3Client({ region: config.region, credentials, ignoreConfiguredEndpointUrls: true, maxAttempts: 2 });
  return { storage: createS3Storage(client, config), close: () => client.destroy() };
}
