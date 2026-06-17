import { Router } from "express";
import {
  getDesktopPairing,
  postDesktopLogout,
  postDesktopPairing,
  postDesktopPairingClaim,
} from "../controllers/desktop-auth.controller.js";
import { requireClerkAuth } from "../middleware/auth.js";

export const desktopAuthRouter = Router();

desktopAuthRouter.post("/desktop/pairings", postDesktopPairing);
desktopAuthRouter.get("/desktop/pairings/:pairingId", getDesktopPairing);
desktopAuthRouter.post("/desktop/logout", postDesktopLogout);
desktopAuthRouter.post(
  "/desktop/pairings/:pairingId/claim",
  requireClerkAuth,
  postDesktopPairingClaim,
);
