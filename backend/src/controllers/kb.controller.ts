import type { Request, Response, NextFunction } from "express";
import {
  listKbEntries,
  upsertKbEntry,
  deleteKbEntry,
  lookupKbByName,
} from "../services/knowledge-base.service.js";
import { resolveDesktopToken } from "../services/desktop-auth.service.js";
import { env } from "../config/env.js";

function bearerToken(req: Request): string | undefined {
  const h = req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
}

async function resolveUser(req: Request): Promise<string | undefined> {
  const desktop = await resolveDesktopToken(bearerToken(req) ?? "");
  return desktop ?? req.auth?.userId ?? req.header("x-clerk-user-id") ?? env.ASSISTANT_DEFAULT_CLERK_USER_ID;
}

/** GET /api/kb  — list all KB entries, optionally filtered by ?kind= */
export async function listKb(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clerkUserId = await resolveUser(req);
    if (!clerkUserId) { res.status(401).json({ success: false, message: "Unauthenticated" }); return; }

    const kind = req.query.kind as string | undefined;
    const entries = await listKbEntries(clerkUserId, kind as any);
    res.json({ success: true, entries });
  } catch (err) { next(err); }
}

/** GET /api/kb/lookup?name=Shubham  — look up by name or alias */
export async function lookupKb(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clerkUserId = await resolveUser(req);
    if (!clerkUserId) { res.status(401).json({ success: false, message: "Unauthenticated" }); return; }

    const name = req.query.name as string | undefined;
    if (!name) { res.status(400).json({ success: false, message: "?name= is required" }); return; }

    const entries = await lookupKbByName(clerkUserId, name);
    res.json({ success: true, entries });
  } catch (err) { next(err); }
}

/** POST /api/kb  — create or update a single entry */
export async function upsertKb(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clerkUserId = await resolveUser(req);
    if (!clerkUserId) { res.status(401).json({ success: false, message: "Unauthenticated" }); return; }

    const { subject, key, value, kind, aliases, source, confidence, notes } = req.body as Record<string, any>;
    if (!subject || !key || !value) {
      res.status(400).json({ success: false, message: "subject, key, and value are required" });
      return;
    }

    const entry = await upsertKbEntry(clerkUserId, { subject, key, value, kind, aliases, source, confidence, notes });
    res.json({ success: true, entry });
  } catch (err) { next(err); }
}

/** DELETE /api/kb/:id  — delete a single entry */
export async function deleteKb(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clerkUserId = await resolveUser(req);
    if (!clerkUserId) { res.status(401).json({ success: false, message: "Unauthenticated" }); return; }

    await deleteKbEntry(clerkUserId, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}
