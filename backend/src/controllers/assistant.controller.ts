import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { assistantRequestSchema } from "../ai/schemas.js";
import { env } from "../config/env.js";
import { db } from "../config/db.js";
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
    let request;
    try {
      request = db.prepare(`
        SELECT id, transcript, status, created_at
        FROM assistant_requests
        WHERE id = ? AND clerk_user_id = ?
      `).get(requestId, clerkUserId) as any;
    } catch (requestError) {
      throw requestError;
    }

    if (!request) {
      res.status(404).json({ success: false, message: "Assistant request not found" });
      return;
    }

    let run;
    try {
      run = db.prepare(`
        SELECT id, success, message, started_at, finished_at
        FROM assistant_runs
        WHERE request_id = ?
        ORDER BY started_at DESC
        LIMIT 1
      `).get(request.id) as any;
      
      // SQLite stores boolean as 1 or 0, map to boolean if present
      if (run && run.success !== null) {
        run.success = run.success === 1;
      }
    } catch (runError) {
      throw runError;
    }

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

    const tasks = db.prepare(`
      SELECT id, description, required_fields, status, created_at, updated_at
      FROM pending_tasks
      WHERE clerk_user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(clerkUserId);

    res.json({ success: true, tasks: tasks.map((t: any) => ({
      ...t,
      required_fields: JSON.parse(t.required_fields)
    })) });
  } catch (err) {
    next(err);
  }
}

export async function submitPendingTask(
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

    const taskId = req.params.taskId;
    const payload = req.body;

    const task = db.prepare(`SELECT id, status, run_id FROM pending_tasks WHERE id = ? AND clerk_user_id = ?`).get(taskId, clerkUserId) as any;
    if (!task) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    if (task.status !== 'pending') {
      res.status(400).json({ success: false, message: "Task is not pending" });
      return;
    }

    db.prepare(`
      UPDATE pending_tasks 
      SET status = 'resolved', resolved_data = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(JSON.stringify(payload), taskId);

    await inngest.send({
      name: ASSISTANT_EVENTS.userInputReceived,
      data: { taskId, payload, requestId: task.run_id }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
