import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { assistantRequestSchema } from "../ai/schemas.js";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { createAssistantRequest } from "../services/assistant-runs.service.js";
import { resolveDesktopToken } from "../services/desktop-auth.service.js";
import { inngest, ASSISTANT_EVENTS } from "../workflows/inngest.js";
import { runAssistantPipeline } from "../workflows/assistant.workflow.js";
import type { AssistantResponseBody } from "../types/index.js";

function headerValue(req: Request, name: string): string | undefined {
  const value = req.header(name);
  return value && value.trim() ? value.trim() : undefined;
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

async function assistantUserId(req: Request): Promise<string | undefined> {
  const desktopUserId = await resolveDesktopToken(bearerToken(req) ?? "");
  return (
    desktopUserId ??
    req.auth?.userId ??
    headerValue(req, "x-clerk-user-id") ??
    env.ASSISTANT_DEFAULT_CLERK_USER_ID
  );
}

function assistantSource(req: Request): "api" | "voice" | "local-stt" | "web" {
  const source = headerValue(req, "x-assistant-source");
  if (source === "local-stt" || source === "voice" || source === "web" || source === "api") {
    return source;
  }
  return "api";
}

export async function postAssistant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { transcript } = assistantRequestSchema.parse(req.body);
    const asyncMode = req.query.async === "true";
    const clerkUserId = await assistantUserId(req);
    const source = assistantSource(req);
    const persistedRequestId = clerkUserId
      ? await createAssistantRequest({
          clerkUserId,
          transcript,
          source,
          async: asyncMode,
        })
      : undefined;
    const requestId = persistedRequestId ?? randomUUID();

    if (asyncMode) {
      await inngest.send({
        name: ASSISTANT_EVENTS.voiceRequestReceived,
        data: {
          transcript,
          requestId,
          clerkUserId,
          source,
        },
      });

      res.status(202).json({
        success: true,
        message: "Voice request queued for processing",
        async: true,
        requestId,
      });
      return;
    }

    const result = await runAssistantPipeline(transcript, {
      clerkUserId,
      requestId: persistedRequestId,
      source,
    });

    const response: AssistantResponseBody = {
      success: result.success,
      stepsExecuted: result.stepsExecuted,
      results: result.results,
      plan: result.plan,
      message: result.message,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getAssistantRequestStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkUserId = await assistantUserId(req);
    if (!clerkUserId) {
      res.status(401).json({ success: false, message: "Missing assistant user id" });
      return;
    }

    const requestId = req.params.requestId;
    const { data: request, error: requestError } = await supabaseAdmin
      .from("assistant_requests")
      .select("id, transcript, status, created_at")
      .eq("id", requestId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);

    if (!request) {
      res.status(404).json({ success: false, message: "Assistant request not found" });
      return;
    }

    const { data: run, error: runError } = await supabaseAdmin
      .from("assistant_runs")
      .select("id, success, message, started_at, finished_at")
      .eq("request_id", request.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) throw new Error(runError.message);

    res.json({
      success: true,
      request,
      run: run ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTools(_req: Request, res: Response): Promise<void> {
  const { listToolMetadata } = await import("../tools/registry.js");
  res.json({ tools: listToolMetadata().map((t) => ({ name: t.name, description: t.description })) });
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  res.json({
    message: "Assistant backend is healthy",
    version: "0.1.0",
    healthy: true,
    integrations: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      google: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLIENT_EMAIL),
      mockMode: process.env.GOOGLE_MOCK_MODE === "true",
    },
  });
}

export async function getPendingTasks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkUserId = await assistantUserId(req);
    if (!clerkUserId) {
      res.status(401).json({ success: false, message: "Missing assistant user id" });
      return;
    }

    const { data: tasks, error } = await supabaseAdmin
      .from("pending_tasks")
      .select("id, description, required_fields, status, created_at, updated_at")
      .eq("clerk_user_id", clerkUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    res.json({ success: true, tasks: tasks ?? [] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve a pending task row — shared by submit/skip/abandon/edit
// ---------------------------------------------------------------------------
async function resolvePendingTaskRow(
  req: Request,
  res: Response,
  next: NextFunction,
  handler: (task: { id: string; run_id: string }, clerkUserId: string) => Promise<void>,
): Promise<void> {
  try {
    const clerkUserId = await assistantUserId(req);
    if (!clerkUserId) {
      res.status(401).json({ success: false, message: "Missing assistant user id" });
      return;
    }

    const taskId = req.params.taskId;
    const { data: task, error } = await supabaseAdmin
      .from("pending_tasks")
      .select("id, status, run_id")
      .eq("id", taskId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!task) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    if (task.status !== "pending") {
      res.status(400).json({ success: false, message: `Task is already ${task.status}` });
      return;
    }

    await handler(task, clerkUserId);
  } catch (err) {
    next(err);
  }
}

export async function submitPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task) => {
    const payload = req.body;

    await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "resolved",
        resolved_data: payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await inngest.send({
      name: ASSISTANT_EVENTS.userInputReceived,
      data: { taskId: task.id, payload, requestId: task.run_id },
    });

    res.json({ success: true });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/skip
 * Body: { reason?: string }
 *
 * Marks the task skipped and sends a taskSkipped event so the workflow
 * continues to the next action without this step's data.
 */
export async function skipPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task) => {
    const reason: string = req.body?.reason ?? "Skipped by user";

    await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "skipped",
        abandonment_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await inngest.send({
      name: ASSISTANT_EVENTS.taskSkipped,
      data: { taskId: task.id, requestId: task.run_id, reason },
    });

    res.json({ success: true, skipped: true, reason });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/abandon
 * Body: { reason: string }
 *
 * Marks the task abandoned (with reason), then fires a taskAbandoned event
 * which causes the workflow to stop and record the abandonment in the DB.
 */
export async function abandonPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task) => {
    const reason: string = req.body?.reason ?? "Abandoned by user";

    await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "abandoned",
        abandonment_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await inngest.send({
      name: ASSISTANT_EVENTS.taskAbandoned,
      data: { taskId: task.id, requestId: task.run_id, reason },
    });

    res.json({ success: true, abandoned: true, reason });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/edit
 * Body: { payload: Record<string, unknown>, editedFields?: string[] }
 *
 * Allows the user to change what they want the assistant to do for this step
 * before resuming. Works like submit but signals an edit occurred.
 */
export async function editPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task) => {
    const { payload, editedFields } = req.body as {
      payload: Record<string, unknown>;
      editedFields?: string[];
    };

    if (!payload || typeof payload !== "object") {
      res.status(400).json({ success: false, message: "payload is required and must be an object" });
      return;
    }

    await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "resolved",
        resolved_data: payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await inngest.send({
      name: ASSISTANT_EVENTS.taskEdited,
      data: { taskId: task.id, requestId: task.run_id, payload, editedFields: editedFields ?? [] },
    });

    res.json({ success: true, edited: true, editedFields: editedFields ?? [] });
  });
}

/**
 * POST /api/assistant/runs/:runId/abandon
 * Body: { reason: string, requestId: string }
 *
 * Sends a runAbandoned event which triggers cancelOn in the workflow,
 * immediately killing the entire in-progress run.
 * Also updates the DB directly so the status is consistent even if the
 * workflow was already between steps when this arrives.
 */
export async function abandonAssistantRunHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clerkUserId = await assistantUserId(req);
    if (!clerkUserId) {
      res.status(401).json({ success: false, message: "Missing assistant user id" });
      return;
    }

    const runId = req.params.runId;
    const { reason, requestId } = req.body as { reason: string; requestId: string };

    if (!reason || !requestId) {
      res.status(400).json({ success: false, message: "reason and requestId are required" });
      return;
    }

    // Verify ownership by embedding the parent request
    const { data: run, error: runLookupError } = await supabaseAdmin
      .from("assistant_runs")
      .select("id, request_id, assistant_requests!inner(clerk_user_id)")
      .eq("id", runId)
      .eq("assistant_requests.clerk_user_id", clerkUserId)
      .maybeSingle();

    if (runLookupError) throw new Error(runLookupError.message);

    if (!run) {
      res.status(404).json({ success: false, message: "Run not found" });
      return;
    }

    // Update immediately (cancelOn may take a moment to propagate)
    await supabaseAdmin
      .from("assistant_runs")
      .update({
        success: false,
        message: `Abandoned: ${reason}`,
        abandonment_reason: reason,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await supabaseAdmin
      .from("assistant_requests")
      .update({ status: "abandoned" })
      .eq("id", requestId);

    // Fire the cancelOn event — Inngest will kill the workflow
    await inngest.send({
      name: ASSISTANT_EVENTS.runAbandoned,
      data: { runId, requestId, reason },
    });

    res.json({ success: true, abandoned: true, reason });
  } catch (err) {
    next(err);
  }
}
