import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { validateRequestShape } from "./validateBody.js";

// APIs carry text and media references, never image bytes. This also accommodates
// percent-encoded Unicode descriptions at the documented field limits.
export const REQUEST_BODY_BYTES = 512 * 1024;
export const FORM_PARAMETER_LIMIT = 32;
export const FORM_DEPTH_LIMIT = 4;

function guardParserErrors(parser: RequestHandler): RequestHandler {
  return (req, res, next) => parser(req, res, err => {
    // zlib failures are parser-origin 400s without a body-parser error type.
    // Normalize at this boundary rather than trusting domain errors' status.
    if (err?.status === 400 && !err.type) {
      next({ type: "entity.parse.failed" });
      return;
    }
    next(err);
  });
}

export function requestParsers() {
  // body-parser supports depth; the installed Express type package omits it.
  const formOptions = {
    extended: true,
    limit: REQUEST_BODY_BYTES,
    parameterLimit: FORM_PARAMETER_LIMIT,
    depth: FORM_DEPTH_LIMIT,
  };
  return [
    guardParserErrors(express.json({ limit: REQUEST_BODY_BYTES })),
    guardParserErrors(express.urlencoded(formOptions)),
    validateRequestShape,
  ];
}

const parserErrors: Record<string, { status: number; message: string }> = {
  "entity.parse.failed": { status: 400, message: "Malformed request body" },
  "request.aborted": { status: 400, message: "Malformed request body" },
  "request.size.invalid": { status: 400, message: "Malformed request body" },
  "querystring.parse.rangeError": { status: 400, message: "Request structure exceeds supported limits" },
  "entity.too.large": { status: 413, message: "Request body is too large" },
  "parameters.too.many": { status: 413, message: "Too many form fields" },
  "encoding.unsupported": { status: 415, message: "Unsupported request encoding" },
  "charset.unsupported": { status: 415, message: "Unsupported request encoding" },
};

// Keep four arguments and mount after routes. Never reflect parser messages,
// which may include submitted credentials/body fragments, or raw internal errors.
export const requestErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) { next(err); return; }
  const parserError = Object.prototype.hasOwnProperty.call(parserErrors, err?.type)
    ? parserErrors[err.type] : undefined;
  if (parserError) {
    res.status(parserError.status).json({ message: parserError.message });
    return;
  }
  console.error("Request failed");
  res.status(500).json({ error: "ServerError", message: "Internal Server Error" });
};
