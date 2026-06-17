import { Router } from "express";
import {
  getDashboardSummary,
  getGoogleConnectionStatus,
  getMe,
  googleOAuthCallback,
  startIntegrationOAuth,
  startGoogleOAuth,
} from "../controllers/auth.controller.js";
import { requireClerkAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.get("/me", requireClerkAuth, getMe);
authRouter.get("/dashboard/summary", requireClerkAuth, getDashboardSummary);
authRouter.get("/auth/:provider/start", requireClerkAuth, startIntegrationOAuth);
authRouter.get("/auth/google/status", requireClerkAuth, getGoogleConnectionStatus);
authRouter.get("/auth/google/start", requireClerkAuth, startGoogleOAuth);
authRouter.get("/auth/google/callback", googleOAuthCallback);
