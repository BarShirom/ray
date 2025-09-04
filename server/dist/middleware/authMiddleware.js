import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import dotenv from "dotenv";
dotenv.config();
export const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Authorization token required" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await UserModel.findById(decoded.id).select("_id firstName lastName email");
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }
        req.user = user;
        console.log("🔐 req.user in middleware:", req.user);
        next();
    }
    catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
};
