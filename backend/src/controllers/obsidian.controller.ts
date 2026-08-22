import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { resolveDesktopToken } from "../services/desktop-auth.service.js";
import { inngest, ASSISTANT_EVENTS } from "../workflows/inngest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

async function requireDesktopUser(req: Request, res: Response): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Missing bearer token" });
    return null;
  }
  const clerkUserId = await resolveDesktopToken(token);
  if (!clerkUserId) {
    res.status(401).json({ success: false, message: "Invalid desktop token" });
    return null;
  }
  return clerkUserId;
}

// ---------------------------------------------------------------------------
// GET /api/obsidian/pending
//
// Called by the desktop app every ~2 seconds to check for Obsidian requests
// that need to be executed locally (file I/O on the vault).
// ---------------------------------------------------------------------------
export async function getObsidianPending(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkUserId = await requireDesktopUser(req, res);
    if (!clerkUserId) return;

    const { data: requests, error } = await supabaseAdmin
      .from("obsidian_requests")
      .select("id, action, params, created_at")
      .eq("clerk_user_id", clerkUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);

    res.json({ success: true, requests: requests ?? [] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/obsidian/:requestId/result
//
// Called by the desktop app after it has executed the Obsidian file operation
// locally. Updates the row and fires an Inngest event to resume the waiting
// assistant workflow.
// ---------------------------------------------------------------------------
export async function postObsidianResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkUserId = await requireDesktopUser(req, res);
    if (!clerkUserId) return;

    const requestId = req.params.requestId;
    const { result, error: resultError } = req.body as {
      result?: Record<string, unknown>;
      error?: string;
    };

    // Load the original request to verify ownership and get the run_id.
    const { data: obsReq, error: lookupError } = await supabaseAdmin
      .from("obsidian_requests")
      .select("id, request_id, status")
      .eq("id", requestId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (!obsReq) {
      res.status(404).json({ success: false, message: "Obsidian request not found" });
      return;
    }

    if (obsReq.status !== "pending") {
      res.status(400).json({ success: false, message: `Request is already ${obsReq.status}` });
      return;
    }

    // Update status.
    const newStatus = resultError ? "failed" : "completed";
    await supabaseAdmin
      .from("obsidian_requests")
      .update({
        status: newStatus,
        result: resultError ? { error: resultError } : result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // Fire Inngest event to resume the waiting workflow step.
    await inngest.send({
      name: ASSISTANT_EVENTS.obsidianResultReceived,
      data: {
        obsidianRequestId: requestId,
        requestId: obsReq.request_id,
        result: resultError ? { error: resultError } : result,
      },
    });

    res.json({ success: true, status: newStatus });
  } catch (err) {
    next(err);
  }
}
