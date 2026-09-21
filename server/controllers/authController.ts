import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { mongoUserStore as users } from "../users/mongoUserStore.js";
import { serializeAuthResponse } from "../serializers/authResponse.js";

export const register = async (req: Request, res: Response): Promise<void> => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in environment variables");
    res.status(500).json({ msg: "Internal server error" });
    return;
  }

  const { firstName, lastName, email, password, company } = req.body;

  try {
    const existingUser = await users.findByEmail(email);
    if (existingUser) {
      res.status(400).json({ msg: "User already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await users.create({
      firstName,
      lastName,
      email,
      passwordHash: hashedPassword,
      company,
    });

    const token = jwt.sign({ id: newUser.publicId }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json(serializeAuthResponse(newUser, token));
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in environment variables");
    res.status(500).json({ msg: "Internal server error" });
    return;
  }

  const { email, password } = req.body;

  try {
    const user = await users.findCredentialsByEmail(email);
    if (!user) {
      res.status(400).json({ msg: "Invalid email or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ id: user.publicId }, JWT_SECRET, { expiresIn: "7d" });

    res.json(serializeAuthResponse(user, token));
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};
