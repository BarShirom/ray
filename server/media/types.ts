export class MediaError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "MediaError"; }
}
export const unavailable = () => new MediaError(503, "Media storage unavailable. Check the restricted ray-s3-dev profile; renew its source login session and try again.");
export const MAX_BYTES = 8 * 1024 * 1024;
export const UPLOAD_SECONDS = 300;
export const READ_SECONDS = 60;
export type Purpose = "station" | "report";
export type Intent = { purpose: Purpose; contentType: string; byteLength: number; checksum: string };
export type UploadPermission = { url: string; headers: Record<string, string> };
export interface MediaStorage {
  signUpload(key: string, intent: Intent): Promise<UploadPermission>;
  source(key: string, intent: Intent): Promise<Buffer>;
  putOutput(key: string, bytes: Buffer, checksum: string): Promise<void>;
  signRead(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
