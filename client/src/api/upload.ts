// api/upload.ts
import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
if (!BASE) {
  throw new Error(
    "VITE_API_URL is not set. Define it in client/.env.local / Vercel."
  );
}

type UploadedItem = { url: string; public_id: string };

export async function uploadMedia(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("media", f)); // field name "media" matches your router

  const { data } = await axios.post<{ items: UploadedItem[] }>(
    `${BASE}/api/upload/media`,
    form
    // no headers: the browser sets multipart/form-data with boundary automatically
  );

  return (data.items ?? []).map((i) => i.url);
}
