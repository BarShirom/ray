// src/api/upload.ts
import axios from "axios";

const BASE =
  import.meta.env.MODE === "development"
    ? ""
    : (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

type UploadedItem = { url: string; public_id: string };

export async function uploadMedia(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("media", f)); // field name MUST be "media"

  // Let the browser set the multipart boundary automatically.
  const { data } = await axios.post<{ items: UploadedItem[] }>(
    `${BASE}/api/upload/media`, // you mounted app.use("/api/upload", uploadRoutes) + router.post("/media")
    form
  );

  return (data.items ?? []).map((i) => i.url); // return Cloudinary URLs
}
