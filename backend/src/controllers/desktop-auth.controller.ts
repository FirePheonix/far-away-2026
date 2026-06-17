import type { NextFunction, Request, Response } from "express";
import {
  claimDesktopPairing,
  createDesktopPairing,
  getDesktopPairingStatus,
  revokeDesktopToken,
} from "../services/desktop-auth.service.js";
import { AppError } from "../utils/errors.js";

function requireUserId(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  return userId;
}

export async function postDesktopPairing(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deviceName =
      typeof req.body?.deviceName === "string" ? req.body.deviceName.slice(0, 120) : undefined;
    res.status(201).json(await createDesktopPairing(deviceName));
  } catch (err) {
    next(err);
  }
}

export async function getDesktopPairing(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await getDesktopPairingStatus(req.params.pairingId));
  } catch (err) {
    next(err);
  }
}

export async function postDesktopPairingClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    res.json(
      await claimDesktopPairing({
        pairingId: req.params.pairingId,
        code,
        clerkUserId: userId,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function postDesktopLogout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    res.json(await revokeDesktopToken(token));
  } catch (err) {
    next(err);
  }
}
