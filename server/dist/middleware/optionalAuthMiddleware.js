import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import dotenv from "dotenv";
dotenv.config();
export const optionalAuthMiddleware = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await UserModel.findById(decoded.id).select("_id firstName lastName email");
            if (user) {
                req.user = user;
            }
        }
        catch (err) {
            console.log("⚠️ Optional auth failed:", err);
            // Don't stop the request — just continue as guest
        }
    }
    next();
};
