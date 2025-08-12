import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel";
import dotenv from "dotenv";

dotenv.config();

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

export const authMiddleware = async (
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    const user = await UserModel.findById(decoded.id).select(
      "_id firstName lastName email"
    );

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    req.user = user;
    console.log("🔐 req.user in middleware:", req.user);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
