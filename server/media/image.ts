import sharp from "sharp";
import { createHash } from "node:crypto";
import { MAX_BYTES, MediaError } from "./types.js";
export const PIXEL_LIMIT = 20_000_000;
export const digest = (data: Buffer) => createHash("sha256").update(data).digest("base64");
function animatedPng(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += 12 + size;
  }
  return false;
}
export async function normalizeImage(bytes: Buffer, declaredType: string) {
  try {
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error();
    const format = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : "unsupported";
    if (`image/${format}` !== declaredType || (format === "png" && animatedPng(bytes))) throw new Error();
    const options = { limitInputPixels: PIXEL_LIMIT, failOn: "warning" as const };
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > PIXEL_LIMIT) throw new Error();
    const { data, info } = await sharp(bytes, options).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_BYTES) throw new Error();
    return { data, checksum: digest(data), width: info.width, height: info.height };
  } catch { throw new MediaError(422, "Image rejected. Use a valid, non-animated JPEG, PNG or WebP within 8 MiB and 20 megapixels."); }
}
