import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";

interface JwtPayload {
  id?: string;
  _id?: string;
}

export const optionalAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return next();

    const token = auth.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const decoded = jwt.verify(token, secret) as JwtPayload;
    const userId = decoded.id ?? decoded._id;
    if (!userId) return next();

    const user = await UserModel.findById(userId)
      .select("_id firstName lastName name email")
      .lean();

    if (user) {
      (req as any).user = {
        _id: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
        name: (user as any).name,
        email: user.email,
      };
    }
  } catch {
    // ignore and continue as guest
  }
  next();
};
