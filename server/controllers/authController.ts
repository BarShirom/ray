import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/UserModel";

export const register = async (req: Request, res: Response): Promise<void> => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in environment variables");
    res.status(500).json({ msg: "Internal server error" });
    return;
  }

  const { firstName, lastName, email, password, company } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ msg: "User already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      company,
      
    });

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        company: newUser.company,
        token
      },
      
    });
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
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ msg: "Invalid email or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        company: user.company,
        token
      },
     
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};
