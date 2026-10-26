import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { bodyShapeError, INPUT_LIMITS } from "../validation/inputBounds.js";

const checkedBodies = new WeakMap<object, unknown>();

export const validateRequestShape: RequestHandler = (req, res, next) => {
  // Reads and bodyless actions have nothing to traverse. Endpoint schemas still
  // reject a missing body wherever a body is required.
  if (req.body === undefined) { next(); return; }
  if (!checkedBodies.has(req) || checkedBodies.get(req) !== req.body) {
    const issue = bodyShapeError(req.body);
    if (issue) {
      res.status(400).json({ message: "Validation failed", errors: [issue] });
      return;
    }
    checkedBodies.set(req, req.body);
  }
  next();
};

export const validateBody = (schema: ZodType): RequestHandler => {
  return (req, res, next) => {
    // Router factories also work safely when mounted without the global parsers.
    let validShape = false;
    validateRequestShape(req, res, () => { validShape = true; });
    if (!validShape) return;
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.slice(0, INPUT_LIMITS.errors).map((issue) => ({
          field: issue.path.slice(0, INPUT_LIMITS.depth + 1).map(part => String(part).slice(0, INPUT_LIMITS.fieldName)).join(".").slice(0, INPUT_LIMITS.fieldName) || "body",
          message: issue.code === "unrecognized_keys" ? "Unrecognized fields" : issue.message.slice(0, 200),
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
};
