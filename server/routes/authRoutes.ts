import express from "express";
import { createAuthHandlers } from "../controllers/authController.js";
import { mongoUserStore } from "../users/mongoUserStore.js";
import type { UserStore } from "../users/userStore.js";
import { validateBody } from "../middleware/validateBody.js";
import { registerSchema, loginSchema } from "../validation/authSchemas.js";
import { createAbuseProtection, type AbuseProtection } from "../security/abuseProtection.js";

export function createAuthRouter(users: UserStore, getSecret = () => process.env.JWT_SECRET, abuse: AbuseProtection = createAbuseProtection()) {
  const router = express.Router();
  const { register, login } = createAuthHandlers(users, getSecret);

  router.post("/register", abuse.registration, validateBody(registerSchema), register);
  router.post("/login", abuse.login, validateBody(loginSchema), login);
  return router;
}

export default createAuthRouter(mongoUserStore);
