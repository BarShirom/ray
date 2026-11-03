import { isPostgresPreview } from "../preview";
import { t } from "../i18n";
import { formatNumber } from "../i18n/formatters";
import { retryAfterSeconds } from "./retryAfter";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export function validateImages(files: File[], purpose: "station" | "report") {
  if (files.length > (purpose === "station" ? 1 : 3)) throw new Error("Choose one station image or up to three report images.");
  if (files.some(f => !IMAGE_TYPES.includes(f.type) || f.size < 1 || f.size > 8 * 1024 * 1024)) throw new Error("Choose JPEG, PNG or WebP images up to 8 MiB each. Animated images are not supported.");
}
type Permission = { assetId: string; url: string; headers: Record<string, string>; uploadExpiresAt: string };
type Upload = { permission: Permission; uploaded: boolean; ready: boolean; token: string };
export type ImageUploads = WeakMap<File, Upload>;

export async function mediaEnabled(signal: AbortSignal): Promise<boolean> {
  if (!isPostgresPreview) return false;
  try {
    const response = await fetch(`${BASE}/api/media/capabilities`, { signal, cache: "no-store" });
    return response.ok && (await response.json()).enabled === true;
  } catch { return false; }
}
// Stored station strings are untrusted. Credentials go only to the configured
// application origin and a reconstructed UUID route, never to a stored URL.
export function stationAssetId(source: string): string | null {
  try {
    const base = new URL(BASE || window.location.origin);
    const value = new URL(source);
    if (value.origin !== base.origin || value.username || value.password || value.search || value.hash) return null;
    return /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/content$/i.exec(value.pathname)?.[1].toLowerCase() ?? null;
  } catch { return null; }
}
export async function loadStationImage(source: string, token: string, signal: AbortSignal, isCurrent: () => boolean): Promise<Blob> {
  const assetId = stationAssetId(source);
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const current = () => !requestSignal.aborted && isCurrent();
  if (!assetId || !token || !current()) throw new Error("Image unavailable");
  const response = await fetch(`${BASE}/api/media/${assetId}/read-url`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: requestSignal,
  });
  if (!current()) throw new Error("Image unavailable");
  if (!response.ok) {
    const retryAfter = retryAfterSeconds(response.headers);
    // Only the application issuer can report an auth failure. A private byte
    // response must never expire the Ray session or disclose its capability.
    throw { response: { status: response.status, data: {}, ...(retryAfter === undefined ? {} : { headers: { "retry-after": String(retryAfter) } }) } };
  }
  const permission: unknown = await response.json();
  if (!current() || !permission || typeof permission !== "object" || !("url" in permission) || typeof permission.url !== "string" || permission.url.length > 8192 || !("expiresIn" in permission) || permission.expiresIn !== 60) throw new Error("Image unavailable");
  const capability = new URL(permission.url);
  if (capability.protocol !== "https:" || capability.username || capability.password || capability.hash) throw new Error("Image unavailable");
  // The second request carries neither the Ray Bearer nor browser credentials.
  const bytes = await fetch(capability.href, { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error", signal: requestSignal });
  if (!bytes.ok || !current()) throw new Error("Image unavailable");
  if (!bytes.body || bytes.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "image/webp") throw new Error("Image unavailable");
  const reader = bytes.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (!current()) throw new Error("Image unavailable");
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error("Image unavailable");
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!size || !current()) throw new Error("Image unavailable");
  return new Blob(chunks, { type: "image/webp" });
}
/** Effect-owned lifecycle, also exercised with controlled promises in tests. */
export function beginStationImageLoad(source: string, token: string, isCurrent: () => boolean,
  onLoaded: (url: string) => void, onFailure: (error: unknown) => void) {
  const controller = new AbortController();
  let disposed = false;
  let objectUrl: string | undefined;
  const current = () => !disposed && isCurrent();
  const completed = loadStationImage(source, token, controller.signal, current).then(blob => {
    if (!current()) return;
    objectUrl = URL.createObjectURL(blob);
    if (current()) onLoaded(objectUrl);
    else { URL.revokeObjectURL(objectUrl); objectUrl = undefined; }
  }).catch(error => { if (current()) onFailure(error); });
  return {
    completed,
    dispose() {
      disposed = true;
      controller.abort();
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = undefined; }
    },
  };
}
async function api(path: string, token: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/media/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch { throw new Error("Image service unavailable. Your form is preserved; retry when connected."); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Keep structured status/field feedback for the presentation mapper without
    // exposing an untrusted server message as an Error's public message.
    const error = new Error("Image request failed. Please try again.") as Error & { response: { status: number; data: unknown; headers?: Record<string, string> } };
    const retryAfter = retryAfterSeconds(response.headers);
    error.response = { status: response.status, data, ...(retryAfter === undefined ? {} : { headers: { "retry-after": String(retryAfter) } }) };
    throw error;
  }
  return data;
}
// Retry completion with the same intent after an uncertain PUT; never overwrite it.
// WeakMap entries and permissions exist only in this mounted form's memory.
export async function uploadImages(files: File[], purpose: "station" | "report", token: string | null, cache: ImageUploads, progress: (message: string) => void, isCurrent: () => boolean = () => true): Promise<string[]> {
  if (!isPostgresPreview) throw new Error("S3 images require PostgreSQL preview.");
  if (!token) throw new Error("Sign in to add images. You can submit a report without images.");
  validateImages(files, purpose);
  const ids: string[] = [];
  for (const [index, file] of files.entries()) {
    if (!isCurrent()) throw new Error("Image unavailable");
    let item = cache.get(file);
    if (item?.token !== token) item = undefined;
    if (!item) {
      progress(t("media.preparing", { current: formatNumber(index + 1), total: formatNumber(files.length) }));
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      if (!isCurrent()) throw new Error("Image unavailable");
      const checksum = btoa(Array.from(hash, b => String.fromCharCode(b)).join(""));
      const permission = await api("uploads", token, { purpose, contentType: file.type, byteLength: file.size, checksum }) as Permission;
      if (!isCurrent()) throw new Error("Image unavailable");
      item = { permission, uploaded: false, ready: false, token }; cache.set(file, item);
    }
    if (!item.uploaded && !item.ready) {
      if (Date.parse(item.permission.uploadExpiresAt) <= Date.now()) { cache.delete(file); throw new Error("Upload permission expired. Retry to request a new one."); }
      progress(t("media.uploading", { current: formatNumber(index + 1), total: formatNumber(files.length) }));
      let response: Response;
      try {
        // No Ray token, cookies, multipart encoding or manually set Content-Length.
        response = await fetch(item.permission.url, { method: "PUT", headers: item.permission.headers, body: file, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(60_000) });
      } catch { throw new Error("Image transfer failed. Your form is preserved; retry the upload."); }
      if (!isCurrent()) throw new Error("Image unavailable");
      // A prior PUT may have succeeded before its response was lost. Completion
      // verifies the stored bytes; 412 alone is never considered ready.
      if (!response.ok && response.status !== 412) throw new Error("Image transfer was rejected. Check the S3 setup or select the image again.");
      item.uploaded = true;
    }
    if (!item.ready) {
      progress(t("media.verifying", { current: formatNumber(index + 1), total: formatNumber(files.length) }));
      const completed = await api(`${item.permission.assetId}/complete`, token, {});
      if (!isCurrent()) throw new Error("Image unavailable");
      if (completed.state !== "ready") throw new Error("Image verification did not finish. Please retry.");
      item.ready = true;
    }
    ids.push(item.permission.assetId);
  }
  progress(t("media.saving"));
  return ids;
}
