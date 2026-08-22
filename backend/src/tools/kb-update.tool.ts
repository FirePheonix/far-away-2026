/**
 * kb_update tool
 *
 * Lets the AI write or update facts in the user's knowledge base agentically.
 *
 * Typical flow:
 *   1. User says "send mail to Shubham"
 *   2. Planner doesn't know Shubham's email → emits request_user_input
 *   3. User replies "shubham@example.com"
 *   4. Planner emits kb_update { subject:"Shubham", key:"email", value:"shubham@example.com", kind:"contact" }
 *   5. Planner then emits gmail.send_email with emailFromPreviousStep:true
 *
 * Next time the user says "send mail to Shubham", the KB already has the entry
 * and the planner skips request_user_input entirely.
 */

import { z } from "zod";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";
import { upsertKbEntries } from "../services/knowledge-base.service.js";

const kbUpdateParamsSchema = z.object({
  /**
   * One or more facts to write. Batching is allowed so the AI can store
   * several related facts (e.g. email + phone + slack) in one step.
   */
  facts: z
    .array(
      z.object({
        subject: z
          .string()
          .min(1)
          .describe("Canonical name/entity this fact belongs to. E.g. 'Shubham', 'self', 'standup'."),
        key: z
          .string()
          .min(1)
          .describe(
            "What kind of information. E.g. 'email', 'phone', 'slack_id', 'timezone', 'github_handle'.",
          ),
        value: z.string().min(1).describe("The fact value. E.g. 'shubham@example.com'."),
        kind: z
          .enum(["contact", "preference", "fact", "credential", "alias"])
          .default("fact")
          .describe(
            "'contact' for people, 'preference' for user settings, 'credential' for logins, 'fact' for anything else.",
          ),
        aliases: z
          .array(z.string())
          .default([])
          .describe(
            "Alternative names the user might say for this subject. E.g. ['Shubh', 'Shubham Verma'].",
          ),
        source: z
          .enum(["user_provided", "ai_inferred", "imported"])
          .default("user_provided")
          .describe("Use 'user_provided' when the user explicitly stated the value."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .default(1.0)
          .describe("1.0 = confirmed by user, lower = AI inferred from context."),
        notes: z.string().nullable().default(null).describe("Optional extra context."),
      }),
    )
    .min(1)
    .describe("The facts to store or update."),
});

const kbUpdateResultSchema = z.object({
  stored: z.number().describe("Number of facts written."),
  subjects: z.array(z.string()).describe("Subjects that were updated."),
});

export const kbUpdateTool: AnyToolDefinition = {
  name: "kb_update",
  description:
    "Store or update one or more facts in the user's personal knowledge base. " +
    "Use this immediately after the user answers a request_user_input prompt so the " +
    "same question is never asked again. Also use it when the user volunteers new " +
    "information mid-conversation (e.g. 'my timezone is IST', 'Shubham's email is …').",
  paramsSchema: kbUpdateParamsSchema,
  resultSchema: kbUpdateResultSchema,

  execute: async (
    params: z.infer<typeof kbUpdateParamsSchema>,
    context: ExecutionContext,
  ) => {
    const clerkUserId = context.user?.clerkUserId;
    if (!clerkUserId) {
      throw new Error("[kb_update] Missing user context — cannot write to knowledge base");
    }

    await upsertKbEntries(
      clerkUserId,
      params.facts.map((f) => ({
        kind: f.kind,
        subject: f.subject,
        key: f.key,
        value: f.value,
        aliases: f.aliases,
        source: f.source,
        confidence: f.confidence,
        notes: f.notes,
      })),
    );

    const subjects = [...new Set(params.facts.map((f) => f.subject))];
    return { stored: params.facts.length, subjects };
  },
};
