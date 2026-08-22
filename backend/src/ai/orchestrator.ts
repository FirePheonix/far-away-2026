/**
 * orchestrator.ts
 *
 * A proper agentic ReAct loop using OpenAI's native tool-calling API.
 *
 * Replaces the old one-shot planner + static execution model.
 *
 * How it works:
 *   1. System prompt includes KB facts, past memories, current time.
 *   2. User's transcript is the first human message.
 *   3. GPT-4o picks a tool call (or responds with text if done).
 *   4. We execute the tool, append the result to the conversation.
 *   5. Repeat until GPT-4o stops calling tools (max_turns guard).
 *
 * Integration with Inngest:
 *   - The entire loop runs inside a single step.run("orchestrate") so
 *     Inngest memoises it atomically. Pausing for user input still works
 *     exactly as before — request_user_input returns a taskId, the workflow
 *     waitForEvent fires, and the resolved value is passed back into the loop
 *     as a tool result on the next turn.
 *   - The orchestrator therefore yields at request_user_input /
 *     confirm_action by returning early with { paused: true, taskId }.
 *     The workflow resumes the loop on the next Inngest step once the user
 *     responds, passing the prior conversation thread + the user's answer.
 *
 * Persistent memory:
 *   - KB entries for the user are injected into the system prompt before
 *     every call so GPT-4o can see them without a separate retrieval step.
 *   - After every tool call the result is appended to the thread, giving
 *     GPT-4o full context to adapt its plan dynamically.
 */

import OpenAI from "openai";
import { env } from "../config/env.js";
import { OPENAI_TOOL_DEFINITIONS, toRegistryName } from "./tool-definitions.js";
import { buildMemoryContext } from "../services/memory.service.js";
import type { ExecutionContext } from "../types/index.js";
import { getTool } from "../tools/registry.js";
import { ToolExecutionError } from "../utils/errors.js";
import { normalizeToolError } from "../utils/tool-errors.js";

export type OrchestratorTurn = {
  index: number;
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  /** Set when the tool needs the user to respond before continuing. */
  pausedTaskId?: string;
  skipped?: boolean;
  error?: string;
};

export type OrchestratorResult =
  | {
      done: true;
      turns: OrchestratorTurn[];
      finalMessage: string;
      /** Raw conversation thread — pass back on resume. */
      thread: OpenAI.Chat.ChatCompletionMessageParam[];
    }
  | {
      /** Paused waiting for user input or confirmation. */
      done: false;
      turns: OrchestratorTurn[];
      pausedTaskId: string;
      pausedTool: string;
      pausedDescription: string;
      thread: OpenAI.Chat.ChatCompletionMessageParam[];
    };

const MAX_TURNS = 24; // hard safety cap

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY ?? "missing-key" });

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(memoryContext: string): string {
  const now = new Date();
  const tzOffset = -now.getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzHH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
  const tzMM = String(Math.abs(tzOffset) % 60).padStart(2, "0");

  return `You are Clawvio, a personal AI assistant that executes real actions using tools.

CURRENT TIME: ${now.toISOString()} (UTC${tzSign}${tzHH}:${tzMM})

CRITICAL: You MUST use tools to complete requests. NEVER just reply with text when you can take action.

MANDATORY SEQUENCE FOR SENDING EMAIL — follow this EXACTLY, no exceptions:
  Step 1. If you don't know the recipient's email → call request_user_input
  Step 2. If the user just provided an email via request_user_input → call kb_update to store it
  Step 3. ALWAYS call confirm_action showing { To, Subject, Body } preview — even if email came from KB
  Step 4. Only after confirm_action resolves with confirmed:true → call gmail__send_email
  Skipping confirm_action is NEVER allowed, even if you already have the address.

MANDATORY SEQUENCE FOR CALENDAR EVENTS WITH ATTENDEES:
  Step 1. Call confirm_action showing { Title, When, Attendees } preview
  Step 2. Only after confirmed:true → call calendar__create_event

WHEN A TOOL FAILS — call propose_options with 2-4 recovery choices:
  - Do NOT just give up and reply with text.
  - Think: what went wrong? What are the alternative paths?
  - Examples of good options to propose:
    * Auth failure → "Reconnect [service]" / "Skip this step" / "Try a different approach"
    * Not found → "Search for it differently" / "Create it instead" / "Skip"
    * Permission denied → "Reconnect account" / "Skip and continue" / "Stop here"
  - The user's chosen value comes back as the tool result — use it to decide next action.
  - If user picks "skip" → continue with remaining steps; if "abandon" → stop.

WHEN YOU ARE DONE — reply with a SPECIFIC summary of what you actually did:
  - NOT: "Done." or "Task completed."
  - YES: "Sent email to sparsh@corp.com with subject 'Catch up tomorrow'"
  - YES: "Listed 3 calendar events for today: Standup at 9am, Lunch at 1pm, Review at 4pm"
  - YES: "Created doc 'Project Alpha Brief' — https://docs.google.com/..."

BEHAVIOUR:
- Think step by step. Use results from prior tools directly.
- NEVER guess or fabricate email addresses. If unknown, call request_user_input.
- After user provides ANY new fact (email, phone, preference) → immediately call kb_update BEFORE the next action.
- NEVER call request_user_input for read-only actions (list events, search emails, search sheets). Just call the tool.
- request_user_input is ONLY for data you genuinely cannot proceed without (recipient email, repo name, etc.).

TOOL NAME REFERENCE (use these exact names):
- Email: gmail__send_email, gmail__search_email, gmail__reply_email
- Calendar: calendar__list_events, calendar__create_event, calendar__find_free_slots
- Sheets: sheets__search_sheet, sheets__search_all_sheets, sheets__get_last_row, sheets__append_row
- Docs: docs__create_document, docs__append_text
- Meet: meet__create_link
- Slack: slack_send_message  |  GitHub: github_create_issue  |  Notion: notion_create_page
- Obsidian: obsidian__search_notes, obsidian__append_to_note, obsidian__write_daily_note
- Ask user: request_user_input  |  Store fact: kb_update
- Confirm before destructive actions: confirm_action
- Surface choices on failure/ambiguity: propose_options

HARD RULES:
1. NEVER send email without confirm_action first.
2. NEVER fabricate emails. Use request_user_input if unknown.
3. ALWAYS kb_update after learning a new fact.
4. On tool failure → call propose_options, NOT just give up.
5. End with a specific summary of what was done, not "Done."

${memoryContext ? `${memoryContext}` : ""}`.trim();
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * Run one full orchestration turn.
 *
 * @param transcript  The user's original request (only used to seed the thread).
 * @param context     Execution context (user identity, runId, etc.)
 * @param priorThread Pass the previous thread when resuming after user input.
 * @param resumeToolCallId  The tool_call_id we're responding to on resume.
 * @param resumeResult      The user's answer / resolved data on resume.
 */
export async function runOrchestrator(
  transcript: string,
  context: ExecutionContext,
  options: {
    priorThread?: OpenAI.Chat.ChatCompletionMessageParam[];
    resumeToolCallId?: string;
    resumeResult?: unknown;
    onTurnComplete?: (turn: OrchestratorTurn) => Promise<void>;
  } = {},
): Promise<OrchestratorResult> {
  const clerkUserId = context.user?.clerkUserId;

  // Build memory context — KB facts + past semantic memories — once per call.
  const memoryContext = await buildMemoryContext(clerkUserId, transcript);
  const systemPrompt = buildSystemPrompt(memoryContext);

  // Initialise or restore the conversation thread.
  let thread: OpenAI.Chat.ChatCompletionMessageParam[];

  if (options.priorThread && options.priorThread.length > 0) {
    thread = [...options.priorThread];
    console.log(`[orchestrator] resuming with ${thread.length} prior messages, toolCallId=${options.resumeToolCallId}`);
    // On resume: append the tool result that unblocked us.
    if (options.resumeToolCallId !== undefined && options.resumeResult !== undefined) {
      thread.push({
        role: "tool",
        tool_call_id: options.resumeToolCallId,
        content: JSON.stringify(options.resumeResult),
      });
      console.log(`[orchestrator] appended tool result for ${options.resumeToolCallId}:`, JSON.stringify(options.resumeResult));
    } else {
      console.log(`[orchestrator] WARNING: no resumeToolCallId or resumeResult — toolCallId=${options.resumeToolCallId}, hasResult=${options.resumeResult !== undefined}`);
    }
  } else {
    // Fresh start.
    thread = [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript },
    ];
  }

  const turns: OrchestratorTurn[] = [];
  let turnIndex = (options.priorThread?.filter((m) => m.role === "tool").length ?? 0);

  for (let safety = 0; safety < MAX_TURNS; safety++) {
    const hasPriorToolResults = thread.some((m) => m.role === "tool");
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      tools: OPENAI_TOOL_DEFINITIONS,
      // Force at least one tool call on the first turn so the model can't
      // just reply with text before doing anything.
      tool_choice: hasPriorToolResults ? "auto" : "required",
      messages: thread,
    });

    const choice = response.choices[0]!;
    const assistantMsg = choice.message;

    // Always append the assistant turn to the thread for full context.
    thread.push(assistantMsg);

    // No more tool calls → model is done.
    if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
      return {
        done: true,
        turns,
        finalMessage: assistantMsg.content ?? "Done.",
        thread,
      };
    }

    // Process all tool calls the model issued in this turn
    // (usually one, but the API can return multiple in parallel).
    for (const toolCall of assistantMsg.tool_calls) {
      // OpenAI returns the double-underscore name (sheets__search_sheet).
      // Translate back to the dot name the registry expects.
      const openAIName = toolCall.function.name;
      const toolName = toRegistryName(openAIName);
      const toolCallId = toolCall.id;

      let rawParams: Record<string, unknown>;
      try {
        rawParams = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        // Malformed JSON from the model — give it back an error and continue.
        thread.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: "Invalid JSON in tool arguments" }),
        });
        continue;
      }

      // ── Pause tools: request_user_input, confirm_action, propose_options ──
      // These create a pending_tasks row and the workflow waits for the user.
      if (
        toolName === "request_user_input" ||
        toolName === "confirm_action" ||
        toolName === "propose_options"
      ) {
        const started = Date.now();
        let taskId: string | undefined;
        let errorMsg: string | undefined;

        try {
          const tool = getTool(toolName);
          const validated = tool.paramsSchema.parse(rawParams);
          const result = await tool.execute(validated, context) as { taskId?: string; confirmed?: boolean };
          taskId = result.taskId;
        } catch (err) {
          const normalized = normalizeToolError(toolName, err);
          errorMsg = normalized.message;
        }

        const turn: OrchestratorTurn = {
          index: turnIndex++,
          tool: toolName,
          params: rawParams,
          result: taskId ? { taskId, pending: true } : { error: errorMsg },
          durationMs: Date.now() - started,
          pausedTaskId: taskId,
          error: errorMsg,
        };
        turns.push(turn);
        if (options.onTurnComplete) await options.onTurnComplete(turn);

        if (!taskId) {
          // Tool failed to create the task — report back and let the model decide.
          thread.push({
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify({ error: errorMsg ?? "Failed to create user input task" }),
          });
          continue;
        }

        // Return control to the Inngest workflow which will waitForEvent.
        return {
          done: false,
          turns,
          pausedTaskId: taskId,
          pausedTool: toolName,
          pausedDescription:
            (rawParams.description as string | undefined) ??
            (rawParams.action as string | undefined) ??
            "Waiting for your input",
          thread: [
            ...thread.slice(0, -1), // drop the assistant message we just added
            // We'll re-add it with the tool result on resume
            assistantMsg,
          ],
        };
      }

      // ── Regular tool execution ────────────────────────────────────────────
      const started = Date.now();
      let toolResult: unknown;
      let toolError: string | undefined;

      try {
        const tool = getTool(toolName);
        const validated = tool.paramsSchema.parse(rawParams);
        toolResult = await tool.execute(validated, context);
      } catch (err) {
        const normalized = normalizeToolError(toolName, err);
        toolError = normalized.message;
        toolResult = { error: normalized.message, kind: normalized.kind, code: normalized.code };
      }

      const turn: OrchestratorTurn = {
        index: turnIndex++,
        tool: toolName,
        params: rawParams,
        result: toolResult,
        durationMs: Date.now() - started,
        error: toolError,
      };
      turns.push(turn);
      if (options.onTurnComplete) await options.onTurnComplete(turn);

      // Append result so GPT-4o sees it before deciding the next step.
      thread.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Safety cap reached.
  return {
    done: true,
    turns,
    finalMessage: `Reached the maximum of ${MAX_TURNS} steps. Stopping here.`,
    thread,
  };
}
