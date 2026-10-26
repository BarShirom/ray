import { t } from "./index";
import { he } from "./locales/he";

type Context = "generic" | "login" | "register" | "station" | "feeding" | "report" | "upload";
type ErrorKey = Exclude<keyof typeof he.errors, "fields" | "field">;
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value !== null && typeof value === "object" ? value as RecordValue : {};

// Exact messages from the existing API/client only. Unknown server text is never rendered.
const known: Record<string, ErrorKey> = {
  "First name is required": "firstName", "Last name is required": "lastName",
  "Invalid email": "email", "Password is required": "passwordRequired",
  "Password must be at least 8 characters": "passwordLength",
  "Text exceeds allowed length": "textLength",
  "Too many items": "collectionLength",
  "Request structure exceeds allowed limits": "requestStructure",
  "Unrecognized fields": "invalidValue",
  "Malformed request body": "requestStructure",
  "Request structure exceeds supported limits": "requestStructure",
  "Request body is too large": "requestSize",
  "Too many form fields": "requestStructure",
  "Unsupported request encoding": "requestFormat",
  "Invalid email or password": "invalidLogin", "User already exists": "userExists",
  "Authorization token required": "signIn", "Invalid or expired token": "expiredAuth", "User not found": "expiredAuth",
  "Please log in to add a feeding station.": "signIn", "Please log in to record a feeding.": "signIn",
  "Feeding station not found": "stationMissing", "Invalid feeding station ID": "stationMissing",
  "Feeding station is inactive": "stationInactive", "Station name is required.": "stationName", "Name is required": "stationName",
  "Select a location on the map.": "location", "Cat and kitten counts must be non-negative whole numbers.": "counts",
  "The image must be an uploaded web URL.": "imageUrl", "Description is required": "description",
  "Report not found": "reportMissing", "Report is already claimed or resolved": "alreadyClaimed",
  "Only assigned user can resolve the report": "forbidden",
  "Network Error": "network", "Offline": "network", "Failed to fetch": "network",
  "Internal Server Error": "server", "Internal server error": "server", "Server error": "server",
  "Choose one station image or up to three report images.": "uploadCount",
  "Choose JPEG, PNG or WebP images up to 8 MiB each. Animated images are not supported.": "uploadTypeSize",
  "Unsupported file type": "uploadTypeSize",
  "Choose an image no larger than 25 MB.": "uploadLegacySize",
  "Image service unavailable. Your form is preserved; retry when connected.": "network",
  "Image request failed. Please try again.": "upload",
  "S3 images require PostgreSQL preview.": "uploadUnavailable",
  "Sign in to add images. You can submit a report without images.": "uploadSignIn",
  "Sign in to use images": "uploadSignIn", "Sign in to attach images": "uploadSignIn",
  "Upload permission expired. Retry to request a new one.": "uploadExpired",
  "Image intent expired; select the image again": "uploadExpired",
  "Image transfer failed. Your form is preserved; retry the upload.": "uploadTransfer",
  "Image transfer was rejected. Check the S3 setup or select the image again.": "uploadTransfer",
  "Image verification did not finish. Please retry.": "uploadVerification",
  "Image uploads are disabled in local preview.": "uploadUnavailable",
  "Image uploads are disabled in local preview": "uploadUnavailable",
  "uploads unavailable in local preview": "uploadUnavailable",
  "Legacy media uploads are retired": "uploadUnavailable",
  "Image upload did not return a URL. Please try again.": "upload",
  "Could not upload the image. Please try again.": "upload",
  "Image rejected. Use a valid, non-animated JPEG, PNG or WebP within 8 MiB and 20 megapixels.": "uploadTypeSize",
  "Uploaded length, type or checksum does not match its intent": "uploadVerification",
  "Uploaded length does not match its intent": "uploadVerification",
  "Uploaded image exceeds its declared limit": "uploadVerification",
  "Uploaded image checksum mismatch": "uploadVerification",
  "Upload not found yet; finish uploading before completion": "uploadVerification",
  "Image verification already in progress": "uploadBusy",
  "Image verification lease expired; retry completion": "uploadVerification",
  "Image cannot be completed; select it again": "uploadVerification",
  "Media operation unavailable; please try again": "upload",
  "Too many image completion attempts; try again in a minute": "uploadBusy",
  "Image upload quota reached; finish existing uploads or wait before trying again": "uploadBusy",
  "Image processing busy; try again shortly": "uploadBusy",
  "Image completion limit reached; wait or select it again": "uploadBusy",
  "This image belongs to another user": "forbidden",
  "Image is not ready, has expired or is already attached": "uploadVerification",
  "Invalid image attachment list": "uploadCount",
  "Image not found": "uploadVerification", "Invalid asset ID": "uploadVerification",
  "Image is not attached to a public resource": "uploadVerification",
  "Use JPEG, PNG or WebP, 1 byte to 8 MiB, a SHA-256 checksum and station/report purpose": "uploadTypeSize",
};

function strings(value: unknown): string[] {
  if (typeof value === "string") return value.includes("{{") ? [] : [value];
  return Object.values(object(value)).flatMap(strings);
}
const safeText = new Set(strings(he));
// Only locally generated field feedback is cached, never untrusted server text.
const fieldFeedback = new Set<string>();
function fieldError(issue: unknown): string | null {
  const data = object(issue);
  const path = Array.isArray(data.path) ? data.path.join(".") : data.field;
  if (typeof path !== "string") return null;
  const field = path.split(".")[0];
  if (!Object.prototype.hasOwnProperty.call(he.errors.fields, field)) return null;
  const label = t(`errors.fields.${field as keyof typeof he.errors.fields}`);
  const key = typeof data.message === "string" ? known[data.message] : undefined;
  const text = t("errors.field", { field: label, message: t(`errors.${key ?? "invalidValue"}`) });
  if (fieldFeedback.size >= 256) fieldFeedback.clear();
  fieldFeedback.add(text);
  return text;
}

export function localizeError(error: unknown, context: Context = "generic"): string {
  const outer = object(error);
  const response = object(outer.response);
  const data = object(response.data ?? outer.data);
  const status = response.status ?? outer.status;
  const issues = data.errors ?? data.issues;
  if (Array.isArray(issues)) {
    const feedback = issues.map(fieldError).filter((item): item is string => item !== null);
    if (feedback.length) {
      const text = feedback.join("; ");
      fieldFeedback.add(text);
      return text;
    }
  }
  const message = typeof error === "string" ? error : data.message ?? data.error ?? data.msg ?? outer.message;
  if (typeof message === "string") {
    if (safeText.has(message) || fieldFeedback.has(message)) return message;
    // The media helper's generic wrapper carries structured HTTP status as well.
    if (Object.prototype.hasOwnProperty.call(known, message) && !(message === "Image request failed. Please try again." && typeof status === "number")) return t(`errors.${known[message]}`);
  }
  switch (outer.code ?? data.code) {
    case "ERR_NETWORK": case "ECONNABORTED": case "ETIMEDOUT": return t("errors.network");
    case "UNAUTHORIZED": case "TOKEN_EXPIRED": return t("errors.expiredAuth");
    case "FORBIDDEN": return t("errors.forbidden");
  }
  if (status === 401) return t("errors.expiredAuth");
  if (status === 403) return t("errors.forbidden");
  if (status === 404 && (context === "station" || context === "feeding")) return t("errors.stationMissing");
  if (status === 404 && context === "report") return t("errors.reportMissing");
  if (status === 409 && context === "feeding") return t("errors.stationInactive");
  if (status === 429 && context === "upload") return t("errors.uploadBusy");
  if (status === 422 && context === "upload") return t("errors.uploadVerification");
  if (typeof status === "number" && status >= 500) return t("errors.server");
  return t(context === "upload" ? "errors.upload" : "errors.generic");
}
