import { localizeError } from "../i18n/errors";
import { he } from "../i18n/locales/he";
import { retryAfterSeconds } from "./retryAfter";

export type ApiFailureKind = "authentication" | "not-found" | "rate-limit" | "validation"
  | "network" | "server" | "cancelled" | "stale" | "protocol";
export type ApiContext = "generic" | "login" | "register" | "station" | "feeding" | "report" | "upload";
export interface FailureIdentity { sessionId: string; requestId: string }
export interface ApiFailure extends FailureIdentity {
  kind: ApiFailureKind;
  source: "http" | "client";
  status?: number;
  message: string;
  retryAfter?: number;
  fields?: { field: string; message: string }[];
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
const kinds: ApiFailureKind[] = ["authentication", "not-found", "rate-limit", "validation",
  "network", "server", "cancelled", "stale", "protocol"];
export const isApiFailure = (value: unknown): value is ApiFailure => {
  const item = record(value);
  return kinds.includes(item.kind as ApiFailureKind) && typeof item.message === "string"
    && (item.source === "http" || item.source === "client")
    && typeof item.sessionId === "string" && typeof item.requestId === "string";
};

/** Metadata, never server bodies, credentials, signed URLs or arbitrary error text,
 * crosses this boundary. Localized messages are presentation, never policy. */
export function toApiFailure(error: unknown, options: FailureIdentity & { context: ApiContext }): ApiFailure {
  const outer = record(error), response = record(outer.response), data = record(response.data ?? outer.data);
  const rawStatus = response.status ?? outer.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
    ? rawStatus : undefined;
  const retryAfter = retryAfterSeconds(response.headers ?? outer.headers);
  const rawIssues = status === 400 || status === 422 ? data.errors ?? data.issues : [];
  const issues = (Array.isArray(rawIssues) ? rawIssues.slice(0, 10) : []).flatMap(value => {
    const issue = record(value);
    const field = typeof issue.field === "string" ? issue.field : Array.isArray(issue.path) ? issue.path.slice(0, 4).join(".") : "";
    if (!/^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(field)
      || !Object.prototype.hasOwnProperty.call(he.errors.fields, field.split(".")[0])) return [];
    const message = typeof issue.message === "string" ? issue.message.slice(0, 256) : "";
    return [{ field, message }];
  });
  const rawMessage = data.message ?? data.error ?? outer.message ?? (typeof error === "string" ? error : "");
  const message = typeof rawMessage === "string" ? rawMessage.slice(0, 512) : "";
  const code = ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED", "UNAUTHORIZED", "TOKEN_EXPIRED", "FORBIDDEN"]
    .includes(String(outer.code)) ? String(outer.code) : undefined;
  const kind: ApiFailureKind = code === "ERR_CANCELED" || outer.name === "AbortError" ? "cancelled"
    : status === 401 ? "authentication" : status === 404 ? "not-found" : status === 429 ? "rate-limit"
    : status === 400 || status === 409 || status === 413 || status === 415 || status === 422 ? "validation"
    : status === undefined ? "network" : "server";
  const safe = { code, message, response: { status, headers: { "retry-after": retryAfter?.toString() }, data: { message, errors: issues } } };
  return {
    kind, source: status === undefined ? "client" : "http", sessionId: options.sessionId, requestId: options.requestId,
    ...(status === undefined ? {} : { status }),
    message: localizeError(safe, options.context).slice(0, 2048),
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(issues.length ? { fields: issues.map(issue => ({ field: issue.field,
      message: localizeError({ response: { status: 400, data: { errors: [issue] } } }, options.context).slice(0, 256) })) } : {}),
  };
}

export function apiFailure(kind: ApiFailureKind, identity: FailureIdentity, context: ApiContext = "generic"): ApiFailure {
  const status = kind === "authentication" ? 401 : kind === "not-found" ? 404 : kind === "rate-limit" ? 429 : undefined;
  return { ...identity, kind, source: "client", ...(status === undefined ? {} : { status }),
    message: localizeError({ status, ...(kind === "network" ? { code: "ERR_NETWORK" } : {}) }, context) };
}
