/**
 * propose_options tool
 *
 * Called by the AI when it hits a failure or ambiguity and wants to surface
 * concrete next-step choices to the user rather than silently failing.
 *
 * The AI generates 2-4 options based on its understanding of what went wrong
 * and what alternatives exist. Each option has:
 *   - label: what the user sees (short button text)
 *   - description: one sentence explaining what this option does
 *   - value: opaque string the AI reads back on resume to know which was chosen
 *
 * The workflow saves this as a pending_tasks row with kind="options", waits
 * for the user to pick one, then resumes the AI with the chosen value as the
 * tool result — letting the AI decide what to do next.
 *
 * Example: Calendar 403 → AI proposes:
 *   "Skip calendar step"  → value: "skip"
 *   "Reconnect Google"    → value: "reconnect"
 *   "Try a different calendar" → value: "retry_different"
 *   "Cancel this request" → value: "abandon"
 */

import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";
import { randomUUID } from "node:crypto";

export const proposeOptionsTool: AnyToolDefinition = {
  name: "propose_options",
  description:
    "Surface 2-4 concrete next-step choices to the user when you hit a failure, ambiguity, " +
    "or need them to decide how to proceed. Use this instead of failing silently. " +
    "The user picks one option; you receive their choice as the tool result and act on it. " +
    "Use this when: a tool failed and there are multiple recovery paths; " +
    "you are unsure which of several approaches the user wants; " +
    "a prerequisite (auth, missing data) needs the user to decide.",
  paramsSchema: z.object({
    situation: z
      .string()
      .describe("One sentence: what happened and why you need their input. Plain English."),
    options: z
      .array(
        z.object({
          label: z.string().describe("Short button text the user taps. Max 4 words."),
          description: z.string().describe("One sentence: what you will do if they pick this."),
          value: z.string().describe("Opaque key you read back to decide next action."),
        }),
      )
      .min(2)
      .max(4)
      .describe("The options the user can choose from."),
  }),
  resultSchema: z.object({
    taskId: z.string().optional(),
    message: z.string(),
  }),

  execute: async (
    params: {
      situation: string;
      options: { label: string; description: string; value: string }[];
    },
    context: ExecutionContext,
  ) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const taskId = randomUUID();

    const description =
      params.situation +
      "\n\n" +
      params.options.map((o, i) => `${i + 1}. ${o.label} — ${o.description}`).join("\n");

    const { error } = await supabaseAdmin.from("pending_tasks").insert({
      id: taskId,
      clerk_user_id: context.user.clerkUserId,
      run_id: context.request?.runId ?? null,
      kind: "options",
      step_index: context.executionState.currentStep,
      description,
      required_fields: [{ name: "choice", type: "string" }],
      status: "pending",
      context_json: {
        situation: params.situation,
        options: params.options,
        requestId: context.request?.id ?? null,
        runId: context.request?.runId ?? null,
      },
      wait_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      throw new Error(`Failed to create options task: ${error.message}`);
    }

    return {
      taskId,
      message: "Options presented to user. Waiting for their choice.",
    };
  },
};
