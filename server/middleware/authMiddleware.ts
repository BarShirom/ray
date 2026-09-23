import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { mongoUserStore } from "../users/mongoUserStore.js";
import type { UserStore } from "../users/userStore.js";

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

  try {
    const decoded = jwt.verify(token, getSecret()!) as JwtPayload;
    const user = await users.findIdentityByPublicId(decoded.id);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const authMiddleware = createAuthMiddleware(mongoUserStore);
