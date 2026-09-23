import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { mongoUserStore } from "../users/mongoUserStore.js";
import type { UserStore } from "../users/userStore.js";

interface JwtPayload {
  id?: string;
  _id?: string;
}

export const createOptionalAuthMiddleware = (users: UserStore, getSecret = () => process.env.JWT_SECRET) => async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return next();

    const token = auth.slice(7);
    const secret = getSecret();
    if (!secret) return next();

    const decoded = jwt.verify(token, secret) as JwtPayload;
    const userId = decoded.id ?? decoded._id;
    if (!userId) return next();

    const user = await users.findIdentityByPublicId(userId, { includeLegacyName: true });

    if (user) {
      req.user = user;
    }
  } catch {
    // ignore and continue as guest
  }
  next();
};

export const optionalAuthMiddleware = createOptionalAuthMiddleware(mongoUserStore);
