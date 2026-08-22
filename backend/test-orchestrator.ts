/**
 * Quick smoke-test for the orchestrator end-to-end.
 * Run with: npx tsx test-orchestrator.ts
 */
import { runOrchestrator } from "./src/ai/orchestrator.js";
import type { ExecutionContext } from "./src/types/index.js";

const context: ExecutionContext = {
  previousResults: {},
  variables: {},
  user: { clerkUserId: "user_3F7C4x890XcSLQyTuD9VshS68x4" },
  request: { id: "0603a2e9-1315-4ab6-95fa-883dc7f3105b", runId: "5ba06b75-b004-4377-8b25-3f5402871375", source: "api" },
  executionState: { currentStep: 0, totalSteps: 0, lastResult: null, startedAt: new Date().toISOString() },
};

const transcript = "send an email to sparsh saying hey lets catch up tomorrow";

async function main() {
  console.log("\n═══ TURN 1: Initial request ═══");
  console.log(`> "${transcript}"\n`);

  const r1 = await runOrchestrator(transcript, context, {
    onTurnComplete: async (turn) => {
      console.log(`  [turn ${turn.index}] ${turn.tool}`);
      if (turn.error) console.log(`    ERROR: ${turn.error}`);
      else if (turn.pausedTaskId) console.log(`    PAUSED, taskId=${turn.pausedTaskId}`);
      else console.log(`    result:`, JSON.stringify(turn.result).slice(0, 120));
    },
  });

  if (r1.done) {
    console.log("✓ Done directly:", r1.finalMessage);
    return;
  }

  console.log(`⏸  Paused on: [${r1.pausedTool}]`);
  console.log(`   Question: "${r1.pausedDescription}"`);
  console.log(`   TaskId: ${r1.pausedTaskId}`);

  // Extract toolCallId for resume
  const lastAssistant1 = r1.thread.slice().reverse()
    .find((m): m is any => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
  const toolCallId1 = lastAssistant1?.tool_calls?.[0]?.id;
  console.log(`   ToolCallId: ${toolCallId1}`);

  // ── TURN 2: User provides email ──────────────────────────────────────────
  console.log("\n═══ TURN 2: User answers with Sparsh's email ═══");
  console.log("> sparsh@corp.com\n");

  const r2 = await runOrchestrator(transcript, context, {
    priorThread: r1.thread,
    resumeToolCallId: toolCallId1,
    resumeResult: { email: "sparsh@corp.com" },
  });

  if (r2.done) {
    console.log("✓ Done:", r2.finalMessage);
    return;
  }

  console.log(`⏸  Paused on: [${r2.pausedTool}]`);
  console.log(`   Description: "${r2.pausedDescription}"`);

  const lastAssistant2 = r2.thread.slice().reverse()
    .find((m): m is any => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
  const toolCallId2 = lastAssistant2?.tool_calls?.[0]?.id;

  // ── TURN 3: User confirms ─────────────────────────────────────────────────
  console.log("\n═══ TURN 3: User confirms send ═══");
  console.log("> CONFIRM\n");

  const r3 = await runOrchestrator(transcript, context, {
    priorThread: r2.thread,
    resumeToolCallId: toolCallId2,
    resumeResult: { confirmed: true },
  });

  if (r3.done) {
    console.log("✓ Done:", r3.finalMessage);
  } else {
    console.log(`⏸  Still paused: [${r3.pausedTool}] "${r3.pausedDescription}"`);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
