import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function requireClerkAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.CLERK_SECRET_KEY) {
      throw new AppError("CLERK_SECRET_KEY is not configured", 500, "AUTH_CONFIG_ERROR");
    }

    const token = readBearerToken(req);
    if (!token) {
      throw new AppError("Missing bearer token", 401, "UNAUTHORIZED");
    }

    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      throw new AppError("Invalid auth token payload", 401, "UNAUTHORIZED");
    }

    req.auth = { userId: payload.sub };
    next();
  } catch (err) {
    next(err);
  }
}
