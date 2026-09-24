import { isPostgresPreview } from "../preview";

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
async function api(path: string, token: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/media/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch { throw new Error("Image service unavailable. Your form is preserved; retry when connected."); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "Image request failed. Please try again.");
  return data;
}
// Retry completion with the same intent after an uncertain PUT; never overwrite it.
// WeakMap entries and permissions exist only in this mounted form's memory.
export async function uploadImages(files: File[], purpose: "station" | "report", token: string | null, cache: ImageUploads, progress: (message: string) => void): Promise<string[]> {
  if (!isPostgresPreview) throw new Error("S3 images require PostgreSQL preview.");
  if (!token) throw new Error("Sign in to add images. You can submit a report without images.");
  validateImages(files, purpose);
  const ids: string[] = [];
  for (const [index, file] of files.entries()) {
    let item = cache.get(file);
    if (item?.token !== token) item = undefined;
    if (!item) {
      progress(`Preparing image ${index + 1}/${files.length}...`);
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const checksum = btoa(Array.from(hash, b => String.fromCharCode(b)).join(""));
      const permission = await api("uploads", token, { purpose, contentType: file.type, byteLength: file.size, checksum }) as Permission;
      item = { permission, uploaded: false, ready: false, token }; cache.set(file, item);
    }
    if (!item.uploaded && !item.ready) {
      if (Date.parse(item.permission.uploadExpiresAt) <= Date.now()) { cache.delete(file); throw new Error("Upload permission expired. Retry to request a new one."); }
      progress(`Uploading image ${index + 1}/${files.length}...`);
      let response: Response;
      try {
        // No Ray token, cookies, multipart encoding or manually set Content-Length.
        response = await fetch(item.permission.url, { method: "PUT", headers: item.permission.headers, body: file, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(60_000) });
      } catch { throw new Error("Image transfer failed. Your form is preserved; retry the upload."); }
      // A prior PUT may have succeeded before its response was lost. Completion
      // verifies the stored bytes; 412 alone is never considered ready.
      if (!response.ok && response.status !== 412) throw new Error("Image transfer was rejected. Check the S3 setup or select the image again.");
      item.uploaded = true;
    }
    if (!item.ready) {
      progress(`Verifying image ${index + 1}/${files.length}...`);
      const completed = await api(`${item.permission.assetId}/complete`, token, {});
      if (completed.state !== "ready") throw new Error("Image verification did not finish. Please retry.");
      item.ready = true;
    }
    ids.push(item.permission.assetId);
  }
  progress("Saving...");
  return ids;
}
