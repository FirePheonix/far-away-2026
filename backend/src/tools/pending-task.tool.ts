import { z } from "zod";
import { db } from "../config/db.js";
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
    
    db.prepare(`
      INSERT INTO pending_tasks (id, clerk_user_id, run_id, description, required_fields, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      taskId,
      context.user.clerkUserId,
      context.request?.id ?? null,
      params.description,
      JSON.stringify(params.required_fields)
    );

    return {
      message: "Task created successfully. The assistant pipeline should pause or report that it is waiting for user input.",
      taskId
    };
  },
};
