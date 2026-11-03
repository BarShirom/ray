import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { mongoUserStore } from "../users/mongoUserStore.js";
import type { UserStore } from "../users/userStore.js";
import { isPublicId } from "../utils/publicId.js";

interface JwtPayload {
  id: string;
}

// Extend Express Request to include user field
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const createAuthMiddleware = (users: UserStore, getSecret = () => process.env.JWT_SECRET) => async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization token required" });
    return;
  }

  const token = authHeader.split(" ")[1];

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, getSecret()!) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (!decoded || typeof decoded !== "object" || decoded.id == null) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (!isPublicId(decoded.id)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // An identity-store outage is not an invalid session. Do not turn it into a
  // 401 that would make a protected client discard otherwise valid credentials.
  let user;
  try {
    user = await users.findIdentityByPublicId(decoded.id);
  } catch {
    next(new Error("Authentication service unavailable"));
    return;
  }
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  req.user = user;
  next();
};

// Report creation retains its existing permissive optional-auth middleware.
// Media reads instead reject any supplied invalid credential; only absence is
// optional. Reuse the required verifier so policy cannot drift between the two.
export const createStrictOptionalAuthMiddleware = (users: UserStore, getSecret = () => process.env.JWT_SECRET) => {
  const authenticate = createAuthMiddleware(users, getSecret);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization === undefined) return next();
    return authenticate(req, res, next);
  };
};

export const authMiddleware = createAuthMiddleware(mongoUserStore);
