import express from "express";
import { createAuthHandlers } from "../controllers/authController.js";
import { mongoUserStore } from "../users/mongoUserStore.js";
import type { UserStore } from "../users/userStore.js";
import { validateBody } from "../middleware/validateBody.js";
import { registerSchema, loginSchema } from "../validation/authSchemas.js";

export function createAuthRouter(users: UserStore) {
  const router = express.Router();
  const { register, login } = createAuthHandlers(users);

  router.post("/register", validateBody(registerSchema), register);
  router.post("/login", validateBody(loginSchema), login);
  return router;
}

export default createAuthRouter(mongoUserStore);
