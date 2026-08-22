import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";
import { randomUUID } from "node:crypto";

export const pendingTaskTool: AnyToolDefinition = {
  name: "request_user_input",
  description: "Request missing information from the user (e.g. email, github repo link) when you cannot proceed without it.",
  paramsSchema: z.object({
    description: z.string().describe("A clear description of why you need this information."),
    required_fields: z.array(z.object({
      name: z.string().describe("The name of the field you need (e.g. 'github_repo', 'email_address')"),
      type: z.string().describe("The expected type (e.g. 'string', 'url', 'email')")
    })).min(1).describe("The specific fields of information you need from the user.")
  }),
  resultSchema: z.object({
    message: z.string(),
    taskId: z.string().optional(),
  }),
  execute: async (params: { description: string; required_fields: { name: string; type: string }[] }, context: ExecutionContext) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const taskId = randomUUID();

    const { error } = await supabaseAdmin.from("pending_tasks").insert({
      id: taskId,
      clerk_user_id: context.user.clerkUserId,
      // run_id is a FK to assistant_runs.id — use runId, NOT requestId
      run_id: context.request?.runId ?? null,
      kind: "user_input",
      step_index: context.executionState.currentStep,
      description: params.description,
      required_fields: params.required_fields,
      status: "pending",
      wait_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      throw new Error(`Failed to create pending task: ${error.message}`);
    }

    return {
      message: "Task created successfully. The assistant pipeline should pause or report that it is waiting for user input.",
      taskId
    };
  },
};
