import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { assistantRequestSchema } from "../ai/schemas.js";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { createAssistantRequest } from "../services/assistant-runs.service.js";
import { resolveDesktopToken } from "../services/desktop-auth.service.js";
import { loadTrace } from "../services/run-trace.service.js";
import {
  CLOSURE_REASONS,
  closeRun,
  closeTask,
  loadUnresolved,
  resolveClosure,
  teachFromClosure,
} from "../services/closure.service.js";
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
        // Deterministic id so a double hotkey tap can't launch the same
        // request twice — Inngest dedupes on it.
        id: `voice-request-${requestId}`,
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
      stepsExecuted: [],
      results: result.results,
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

/**
 * GET /api/assistant/requests/:requestId/trace
 *
 * The live agent flow: the plan, each step's status, and the readable reason a
 * step failed. Polled by the desktop overlay about once a second while a run
 * is in flight.
 */
export async function getAssistantRequestTrace(
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

    const trace = await loadTrace(req.params.requestId, clerkUserId);
    if (!trace) {
      res.status(404).json({ success: false, message: "Assistant request not found" });
      return;
    }

    res.json({ success: true, ...trace });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/assistant/unresolved
 *
 * Handback inbox: what is still waiting on the user, plus recently closed work
 * that was flagged as leaving something behind.
 */
export async function getUnresolved(
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

    const unresolved = await loadUnresolved(clerkUserId);
    res.json({ success: true, ...unresolved });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/assistant/closure-reasons
 * Lets the desktop render reason chips without hardcoding the vocabulary.
 */
export async function getClosureReasons(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    reasons: CLOSURE_REASONS.filter((reason) => reason.userSelectable).map((reason) => ({
      code: reason.code,
      label: reason.label,
    })),
  });
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

    // Optional ?requestId= filter — when provided only return tasks for that
    // specific assistant run so the overlay never shows stale tasks from old runs.
    const requestId = req.query.requestId as string | undefined;

    let q = supabaseAdmin
      .from("pending_tasks")
      .select(
        "id, run_id, kind, step_index, description, required_fields, context_json, status, resume_at, wait_expires_at, created_at, updated_at",
      )
      .eq("clerk_user_id", clerkUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }); // oldest first — process in order

    if (requestId) {
      // context_json stores the requestId (assistant_requests.id) so we can
      // filter tasks by the active run without a JOIN.
      q = q.eq("context_json->>requestId", requestId);
    }

    const { data: tasks, error } = await q;

    if (error) throw new Error(error.message);

    // A snoozed task is still pending in the workflow's eyes, but it should
    // stay out of the overlay until the user asked to see it again.
    const now = Date.now();
    const visible = (tasks ?? []).filter(
      (task) => !task.resume_at || new Date(task.resume_at).getTime() <= now,
    );

    res.json({ success: true, tasks: visible, snoozed: (tasks ?? []).length - visible.length });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve a pending task row — shared by submit/skip/abandon/edit
// ---------------------------------------------------------------------------
interface TaskRow {
  id: string;
  run_id: string;
  status: string;
  kind: string | null;
  step_index: number | null;
  description: string | null;
  wait_expires_at: string | null;
}

async function resolvePendingTaskRow(
  req: Request,
  res: Response,
  next: NextFunction,
  handler: (task: TaskRow, clerkUserId: string) => Promise<void>,
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
      .select("id, status, run_id, kind, step_index, description, wait_expires_at")
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

/** Reads the closure fields the desktop sends, tolerating the older `reason`. */
function closureFromBody(req: Request) {
  const body = (req.body ?? {}) as {
    reasonCode?: string;
    note?: string;
    reason?: string;
  };
  return {
    reasonCode: body.reasonCode ?? undefined,
    note: body.note ?? body.reason ?? undefined,
  };
}

/**
 * POST /api/assistant/tasks/:taskId/skip
 * Body: { reasonCode?: string, note?: string }
 *
 * Records why this step was skipped, then resumes the workflow so it continues
 * to the next action without this step's data.
 */
export async function skipPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task, clerkUserId) => {
    const { reasonCode, note } = closureFromBody(req);
    const closure = resolveClosure({
      reasonCode: reasonCode ?? "deferred",
      note,
      closedBy: "user",
      // Skipping leaves that piece of work undone by definition.
      followUpRequired: true,
    });

    await closeTask({ taskId: task.id, status: "skipped", closure });

    const event =
      task.kind === "step_failure" ? ASSISTANT_EVENTS.stepDecision : ASSISTANT_EVENTS.taskSkipped;

    await inngest.send({
      name: event,
      data: {
        taskId: task.id,
        requestId: task.run_id,
        stepIndex: task.step_index,
        decision: "skip",
        reasonCode: closure.closure_reason_code,
        note: closure.closure_note,
        reason: closure.abandonment_reason,
      },
    });

    await teachFromClosure({
      clerkUserId,
      closure,
      subject: task.description,
      requestId: task.run_id,
    });

    res.json({
      success: true,
      skipped: true,
      reasonCode: closure.closure_reason_code,
      reason: closure.abandonment_reason,
      followUpRequired: closure.follow_up_required,
    });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/abandon
 * Body: { reasonCode?: string, note?: string }
 *
 * Records the closure and stops the run. The workflow writes the run-level
 * closure when it unwinds; this handler owns the task-level record.
 */
export async function abandonPendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task, clerkUserId) => {
    const { reasonCode, note } = closureFromBody(req);
    const closure = resolveClosure({
      reasonCode: reasonCode ?? "no_longer_needed",
      note,
      closedBy: "user",
    });

    await closeTask({ taskId: task.id, status: "abandoned", closure });

    const event =
      task.kind === "step_failure" ? ASSISTANT_EVENTS.stepDecision : ASSISTANT_EVENTS.taskAbandoned;

    await inngest.send({
      name: event,
      data: {
        taskId: task.id,
        requestId: task.run_id,
        stepIndex: task.step_index,
        decision: "abandon",
        reasonCode: closure.closure_reason_code,
        note: closure.closure_note,
        reason: closure.abandonment_reason,
      },
    });

    await teachFromClosure({
      clerkUserId,
      closure,
      subject: task.description,
      requestId: task.run_id,
    });

    res.json({
      success: true,
      abandoned: true,
      reasonCode: closure.closure_reason_code,
      reason: closure.abandonment_reason,
      followUpRequired: closure.follow_up_required,
    });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/pause
 * Body: { minutes?: number, reasonCode?: string, note?: string }
 *
 * Snooze. The workflow is already parked in waitForEvent, so pausing needs no
 * event at all — it records the reason and hides the prompt until resume_at.
 * The snooze is capped inside the wait window so a paused task always resumes
 * into the same run.
 */
export async function pausePendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task) => {
    const requested = Number((req.body as { minutes?: number })?.minutes ?? 60);
    const minutes = Number.isFinite(requested) ? Math.max(5, Math.floor(requested)) : 60;

    // Leave a margin so the task resurfaces before the workflow gives up.
    const deadline = task.wait_expires_at
      ? new Date(task.wait_expires_at).getTime() - 5 * 60 * 1000
      : Date.now() + 23 * 60 * 60 * 1000;

    const requestedAt = Date.now() + minutes * 60 * 1000;
    const capped = Math.min(requestedAt, deadline);

    if (capped <= Date.now()) {
      res.status(400).json({
        success: false,
        message: "This task is too close to its deadline to snooze",
      });
      return;
    }

    const { reasonCode, note } = closureFromBody(req);

    await supabaseAdmin
      .from("pending_tasks")
      .update({
        paused_at: new Date().toISOString(),
        resume_at: new Date(capped).toISOString(),
        closure_reason_code: reasonCode ?? "deferred",
        closure_note: note ?? null,
        follow_up_required: true,
        follow_up_owner: "user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    res.json({
      success: true,
      paused: true,
      resumeAt: new Date(capped).toISOString(),
      cappedTo: capped < requestedAt ? "wait_window" : null,
      maxMinutes: Math.max(0, Math.floor((deadline - Date.now()) / 60000)),
    });
  });
}

/**
 * POST /api/assistant/tasks/:taskId/decide
 * Body: { decision: "retry" | "skip" | "abandon", reasonCode?, note? }
 *
 * Answers a step_failure handback. Retry re-executes the failed step under a
 * fresh Inngest step id; skip and abandon close it out with a reason.
 */
export async function decidePendingTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await resolvePendingTaskRow(req, res, next, async (task, clerkUserId) => {
    const { decision } = (req.body ?? {}) as { decision?: string };

    if (decision !== "retry" && decision !== "skip" && decision !== "abandon") {
      res.status(400).json({
        success: false,
        message: 'decision must be one of "retry", "skip", "abandon"',
      });
      return;
    }

    const { reasonCode, note } = closureFromBody(req);
    const closure = resolveClosure({
      reasonCode: reasonCode ?? (decision === "retry" ? "deferred" : "ai_got_it_wrong"),
      note,
      closedBy: "user",
      followUpRequired: decision !== "retry",
    });

    if (decision === "retry") {
      await supabaseAdmin
        .from("pending_tasks")
        .update({
          status: "resolved",
          closure_reason_code: "retried",
          closure_note: closure.closure_note,
          closed_by: "user",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);
    } else {
      await closeTask({
        taskId: task.id,
        status: decision === "skip" ? "skipped" : "abandoned",
        closure,
      });

      await teachFromClosure({
        clerkUserId,
        closure,
        subject: task.description,
        requestId: task.run_id,
      });
    }

    await inngest.send({
      name: ASSISTANT_EVENTS.stepDecision,
      data: {
        taskId: task.id,
        requestId: task.run_id,
        stepIndex: task.step_index,
        decision,
        reasonCode: closure.closure_reason_code,
        note: closure.closure_note,
      },
    });

    res.json({ success: true, decision, reasonCode: closure.closure_reason_code });
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
    const { requestId } = req.body as { requestId?: string };
    const { reasonCode, note } = closureFromBody(req);

    if (!requestId) {
      res.status(400).json({ success: false, message: "requestId is required" });
      return;
    }

    if (!reasonCode && !note) {
      res.status(400).json({
        success: false,
        message: "a reasonCode or note is required to close a run",
      });
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

    const closure = resolveClosure({
      reasonCode: reasonCode ?? "no_longer_needed",
      note,
      closedBy: "user",
    });

    // Write closure immediately. A cancelled function never reaches its own
    // catch block or onFailure, so this handler is the only place the reason
    // can be recorded.
    await closeRun({
      runId,
      requestId,
      requestStatus: "abandoned",
      message: `Closed: ${closure.abandonment_reason}`,
      closure,
    });

    // Any task still waiting on this run is closed by the same decision.
    await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "abandoned",
        abandonment_reason: closure.abandonment_reason,
        closure_reason_code: closure.closure_reason_code,
        closure_note: closure.closure_note,
        closed_by: closure.closed_by,
        closed_at: closure.closed_at,
        follow_up_required: closure.follow_up_required,
        follow_up_owner: closure.follow_up_owner,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", requestId)
      .eq("status", "pending");

    // Fire the cancelOn event — Inngest will kill the workflow
    await inngest.send({
      name: ASSISTANT_EVENTS.runAbandoned,
      data: { runId, requestId, reason: closure.abandonment_reason },
    });

    await teachFromClosure({ clerkUserId, closure, requestId });

    res.json({
      success: true,
      abandoned: true,
      reasonCode: closure.closure_reason_code,
      reason: closure.abandonment_reason,
      followUpRequired: closure.follow_up_required,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/assistant/tasks/:taskId/advice
 *
 * When a step fails, the desktop calls this to get an AI-generated plain-
 * English explanation of what went wrong and what the user should do next.
 */
export async function getFailureAdvice(
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

    const { errorMessage, errorKind, tool, transcript } = req.body as {
      errorMessage?: string;
      errorKind?: string;
      tool?: string;
      transcript?: string;
    };

    if (!errorMessage) {
      res.status(400).json({ success: false, message: "errorMessage is required" });
      return;
    }

    const isAuth = errorKind === "auth" || errorKind === "not_connected";
    const isTransient = errorKind === "transient";

    let advice = errorMessage;
    let suggestion = isAuth
      ? "Reconnect the integration in the dashboard"
      : isTransient
        ? "Try again in a moment"
        : "Skip this step or try again";

    if (env.OPENAI_API_KEY) {
      try {
        const OpenAIModule = await import("openai");
        const openai = new OpenAIModule.default({ apiKey: env.OPENAI_API_KEY });
        const prompt = `A step in a voice assistant failed. Give ONE short sentence explanation (max 12 words) the user understands, and a suggestion.
Tool: ${tool ?? "unknown"} | Error: ${errorMessage} | Kind: ${errorKind ?? "unknown"} | Request: "${transcript ?? ""}"
Reply JSON: { "explanation": "...", "suggestion": "..." } — both under 12 words.`;

        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        });
        const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
        if (parsed.explanation) advice = parsed.explanation;
        if (parsed.suggestion) suggestion = parsed.suggestion;
      } catch {
        // fall through to defaults
      }
    }

    const actions: string[] = [];
    if (isAuth) actions.push("reconnect");
    if (isTransient) actions.push("retry");
    actions.push("skip", "abandon");

    res.json({ success: true, advice, suggestion, actions });
  } catch (err) {
    next(err);
  }
}
