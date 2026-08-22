import { Inngest } from "inngest";
import { env } from "../config/env.js";

export const inngest = new Inngest({
  id: env.INNGEST_APP_ID,
  eventKey: env.INNGEST_EVENT_KEY ?? "local",
  // In local dev: point at the Inngest dev server (npx inngest-cli@latest dev)
  // so events don't require a real event key.
  ...(env.INNGEST_BASE_URL ? { baseUrl: env.INNGEST_BASE_URL } : {}),
});

export const ASSISTANT_EVENTS = {
  /** Fired when a new voice/text request is received — triggers assistantWorkflow */
  voiceRequestReceived: "assistant/voice_request_received",

  /** Fired by /tasks/:id/submit — resumes the workflow with user-provided data */
  userInputReceived: "assistant/user_input_received",

  /**
   * Fired by /tasks/:id/skip — resumes the workflow step with a skip signal.
   * The workflow will skip the task and continue to the next action.
   * data: { taskId, requestId, reason?: string }
   */
  taskSkipped: "assistant/task_skipped",

  /**
   * Fired by /tasks/:id/abandon — resumes the workflow step with an abandon signal.
   * The workflow will throw, record the abandonment reason and stop.
   * data: { taskId, requestId, reason: string }
   */
  taskAbandoned: "assistant/task_abandoned",

  /**
   * Fired by /tasks/:id/edit — resumes the workflow step with edited task data.
   * Works like a submit but indicates the user changed the task definition first.
   * data: { taskId, requestId, payload, editedFields?: string[] }
   */
  taskEdited: "assistant/task_edited",

  /**
   * Fired by /runs/:runId/abandon — triggers cancelOn to kill the whole workflow.
   * data: { runId, requestId, reason: string }
   */
  runAbandoned: "assistant/run_abandoned",

  /**
   * Fired by POST /api/obsidian/:requestId/result — the desktop app finished
   * a local Obsidian file operation and sent the result back.
   * data: { obsidianRequestId, requestId, result }
   */
  obsidianResultReceived: "assistant/obsidian_result_received",

  /**
   * Fired by /tasks/:taskId/decide when a step failed permanently and the user
   * chose what to do about it.
   * data: { taskId, requestId, stepIndex, decision: "retry" | "skip" | "abandon",
   *         reasonCode?: string, note?: string }
   */
  stepDecision: "assistant/step_decision",
} as const;
