import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";

// ---------------------------------------------------------------------------
// Shared helper — insert a row into obsidian_requests and return its ID.
// The desktop app polls for pending rows, executes locally, and POSTs the
// result back to the backend which fires an Inngest event to resume the
// workflow.
// ---------------------------------------------------------------------------
async function createObsidianRequest(
  context: ExecutionContext,
  action: string,
  params: Record<string, unknown>,
): Promise<string> {
  if (!context.user?.clerkUserId) {
    throw new Error("Missing user context");
  }

  const id = randomUUID();
  const { error } = await supabaseAdmin.from("obsidian_requests").insert({
    id,
    clerk_user_id: context.user.clerkUserId,
    run_id: context.request?.id ?? null,
    request_id: context.request?.id ?? null,
    action,
    params,
    status: "pending",
  });

  if (error) {
    throw new Error(`Failed to create Obsidian request: ${error.message}`);
  }

  return id;
}

// ---------------------------------------------------------------------------
// obsidian.search_notes
// ---------------------------------------------------------------------------
export const obsidianSearchNotesTool: AnyToolDefinition = {
  name: "obsidian.search_notes",
  description:
    "Search for notes in the user's local Obsidian vault by filename or content. " +
    "Returns matching note paths and a short text snippet. " +
    "Requires the desktop app to be running.",
  paramsSchema: z.object({
    query: z.string().describe("The search term — matches against note titles and content."),
    maxResults: z.number().int().positive().default(10).describe("Max number of results to return."),
    vaultName: z.string().optional().describe(
      "The name of the Obsidian vault to search. Optional if the user only has one vault.",
    ),
  }),
  resultSchema: z.object({
    message: z.string(),
    obsidianRequestId: z.string().optional(),
  }),
  execute: async (
    params: { query: string; maxResults?: number; vaultName?: string },
    context: ExecutionContext,
  ) => {
    const requestId = await createObsidianRequest(context, "search_notes", {
      query: params.query,
      maxResults: params.maxResults ?? 10,
      vaultName: params.vaultName,
    });

    return {
      message:
        "Obsidian search request queued. Waiting for the desktop app to execute it locally.",
      obsidianRequestId: requestId,
    };
  },
};

// ---------------------------------------------------------------------------
// obsidian.append_to_note
// ---------------------------------------------------------------------------
export const obsidianAppendToNoteTool: AnyToolDefinition = {
  name: "obsidian.append_to_note",
  description:
    "Append markdown content to a specific note in the user's local Obsidian vault. " +
    "Use obsidian.search_notes first if you only know the note's name, not its exact path. " +
    "Requires the desktop app to be running.",
  paramsSchema: z.object({
    notePath: z
      .string()
      .describe(
        "Relative path to the note inside the vault (e.g. 'Projects/Project Alpha.md').",
      ),
    content: z.string().describe("The markdown content to append."),
    vaultName: z.string().optional().describe(
      "The name of the Obsidian vault. Optional if the user only has one vault.",
    ),
  }),
  resultSchema: z.object({
    message: z.string(),
    obsidianRequestId: z.string().optional(),
  }),
  execute: async (
    params: { notePath: string; content: string; vaultName?: string },
    context: ExecutionContext,
  ) => {
    const requestId = await createObsidianRequest(context, "append_to_note", {
      notePath: params.notePath,
      content: params.content,
      vaultName: params.vaultName,
    });

    return {
      message:
        "Obsidian append request queued. Waiting for the desktop app to execute it locally.",
      obsidianRequestId: requestId,
    };
  },
};

// ---------------------------------------------------------------------------
// obsidian.write_daily_note
// ---------------------------------------------------------------------------
export const obsidianWriteDailyNoteTool: AnyToolDefinition = {
  name: "obsidian.write_daily_note",
  description:
    "Append content to today's daily note in the user's Obsidian vault. " +
    "If the daily note does not exist yet it will be created automatically. " +
    "Ideal for logging meeting notes, journal entries, or quick thoughts. " +
    "Requires the desktop app to be running.",
  paramsSchema: z.object({
    content: z
      .string()
      .describe("The markdown content to append to today's daily note."),
    vaultName: z.string().optional().describe(
      "The name of the Obsidian vault. Optional if the user only has one vault.",
    ),
  }),
  resultSchema: z.object({
    message: z.string(),
    obsidianRequestId: z.string().optional(),
  }),
  execute: async (
    params: { content: string; vaultName?: string },
    context: ExecutionContext,
  ) => {
    const requestId = await createObsidianRequest(context, "write_daily_note", {
      content: params.content,
      vaultName: params.vaultName,
    });

    return {
      message:
        "Obsidian daily note request queued. Waiting for the desktop app to execute it locally.",
      obsidianRequestId: requestId,
    };
  },
};

// ---------------------------------------------------------------------------
// Export all Obsidian tools as an array (matches the pattern used by other
// multi-tool modules like calendarTools, gmailTools, etc.)
// ---------------------------------------------------------------------------
export const obsidianTools: AnyToolDefinition[] = [
  obsidianSearchNotesTool,
  obsidianAppendToNoteTool,
  obsidianWriteDailyNoteTool,
];
