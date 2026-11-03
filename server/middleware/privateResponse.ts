import type { RequestHandler, Response } from "express";

const protectedResponses = new WeakSet<Response>();

// Remains effective when a mounted router forwards an error to the parent app.
// Disabling a child app's ETag setting alone does not cover that error response.
export const privateResponse: RequestHandler = (req, res, next) => {
  res.set({
    "Cache-Control": "private, no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
  });
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  if (!protectedResponses.has(res)) {
    protectedResponses.add(res);
    res.removeHeader("ETag");
    const setHeader = res.setHeader;
    res.setHeader = function (name, value) {
      if (name.toLowerCase() === "etag") return this;
      return setHeader.call(this, name, value);
    };
  }
  next();
};
