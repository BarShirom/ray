import express from "express";
import { register, login } from "../controllers/authController.js";
import { validateBody } from "../middleware/validateBody.js";
import { registerSchema, loginSchema } from "../validation/authSchemas.js";

const router = express.Router();

router.post("/register", validateBody(registerSchema), register);
router.post("/login", validateBody(loginSchema), login);

export default router;
