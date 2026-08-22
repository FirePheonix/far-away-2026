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
import { OPENAI_TOOL_DEFINITIONS } from "./tool-definitions.js";
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

BEHAVIOUR:
- Think step by step. Decide which tool to call next based on what you already know and what prior tool results tell you.
- After each tool result, re-read the result and decide the next step. Do NOT plan the full sequence upfront.
- If a tool returns data you need for the next step (an email address, a document ID, etc.), use that data directly.
- NEVER guess or fabricate email addresses, IDs, or URLs. If you don't know, call request_user_input.
- ALWAYS call confirm_action before gmail.send_email and before calendar.create_event with attendees.
- After collecting any new fact from the user (email, phone, preference), call kb_update immediately.
- When you are done with all actions, respond with a plain text summary — do NOT call any more tools.

HARD RULES:
1. Never use placeholder emails like @example.com, noreply@, test@, unknown@. Always verify first.
2. Always call confirm_action before sending emails or inviting people to calendar events.
3. Always call kb_update after learning a new fact. Facts in the KB are shown to you every session.
4. Do not repeat a step that already succeeded. Tool results in this conversation are real.

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
    // On resume: append the tool result that unblocked us.
    if (options.resumeToolCallId !== undefined && options.resumeResult !== undefined) {
      thread.push({
        role: "tool",
        tool_call_id: options.resumeToolCallId,
        content: JSON.stringify(options.resumeResult),
      });
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
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      tools: OPENAI_TOOL_DEFINITIONS,
      tool_choice: "auto",
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
      const toolName = toolCall.function.name;
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

      // ── Pause tools: request_user_input, confirm_action ──────────────────
      // These don't execute synchronously — they create a pending_tasks row
      // and the workflow waits for the user to respond before continuing.
      if (toolName === "request_user_input" || toolName === "confirm_action") {
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
