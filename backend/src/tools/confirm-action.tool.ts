/**
 * confirm_action tool
 *
 * Pauses the workflow and shows the user a preview of what the assistant is
 * about to do. The user gets Confirm or Cancel. Works exactly like
 * request_user_input but for yes/no decisions rather than data collection.
 *
 * The planner MUST emit this before:
 *   - gmail.send_email  (always — shows to/subject/body preview)
 *   - calendar.create_event with attendees
 *   - Any other action that is irreversible or sends something externally
 *
 * The workflow handles confirm_action the same way as request_user_input:
 * it inserts a pending_tasks row with kind="confirm" and waits for the user
 * to either confirm (resolved_data.confirmed = true) or cancel.
 * If cancelled the step is skipped; the rest of the plan still runs unless
 * the user explicitly abandons.
 */

import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";
import { randomUUID } from "node:crypto";

export const confirmActionTool: AnyToolDefinition = {
  name: "confirm_action",
  description:
    "Show the user a preview of what is about to happen and wait for their confirmation before proceeding. " +
    "ALWAYS use this immediately before gmail.send_email (show to/subject/body), " +
    "and before calendar.create_event when attendees will be invited. " +
    "If the user cancels, skip the following action. " +
    "Do NOT use confirm_action for read-only tools (search, list, find).",
  paramsSchema: z.object({
    action: z
      .string()
      .describe(
        "One-line human-readable description of what will happen. E.g. 'Send email to sparsh@example.com'.",
      ),
    details: z
      .record(z.string())
      .describe(
        "Key-value pairs shown to the user as the preview. " +
          "For email: { To, Subject, Body }. " +
          "For calendar: { Title, When, Attendees }.",
      ),
  }),
  resultSchema: z.object({
    confirmed: z.boolean(),
    taskId: z.string().optional(),
  }),

  execute: async (
    params: { action: string; details: Record<string, string> },
    context: ExecutionContext,
  ) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const taskId = randomUUID();

    // Build a human-readable description for the overlay
    const previewLines = Object.entries(params.details)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const description = `${params.action}\n\n${previewLines}\n\nConfirm to proceed, or cancel to skip this step.`;

    const { error } = await supabaseAdmin.from("pending_tasks").insert({
      id: taskId,
      clerk_user_id: context.user.clerkUserId,
      run_id: context.request?.runId ?? null,
      kind: "confirm",
      step_index: context.executionState.currentStep,
      description,
      required_fields: [{ name: "confirmed", type: "boolean" }],
      status: "pending",
      context_json: {
        action: params.action,
        details: params.details,
        confirmKind: "confirm_action",
        requestId: context.request?.id ?? null,
        runId: context.request?.runId ?? null,
      },
      wait_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      throw new Error(`Failed to create confirmation task: ${error.message}`);
    }

    // Return pending — the workflow's waitForEvent loop will inject
    // confirmed:true/false once the user responds.
    return { confirmed: false, taskId };
  },
};
