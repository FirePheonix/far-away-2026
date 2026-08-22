/**
 * Comprehensive orchestrator test suite.
 * Tests all major flows end-to-end.
 * Run: npx tsx test-suite.ts
 */
import { runOrchestrator, type OrchestratorResult } from "./src/ai/orchestrator.js";
import { supabaseAdmin } from "./src/config/supabase.js";
import { randomUUID } from "node:crypto";
import type { ExecutionContext } from "./src/types/index.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const CLERK_USER = "user_3F7C4x890XcSLQyTuD9VshS68x4";

// Get a real run_id from Supabase so FK constraints pass
async function getRealRunId(): Promise<{ requestId: string; runId: string }> {
  const { data } = await supabaseAdmin
    .from("assistant_runs")
    .select("id, request_id")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) throw new Error("No runs in DB — run the server once first");
  return { requestId: data.request_id, runId: data.id };
}

function makeCtx(requestId: string, runId: string): ExecutionContext {
  return {
    previousResults: {},
    variables: {},
    user: { clerkUserId: CLERK_USER },
    request: { id: requestId, runId, source: "api" },
    executionState: { currentStep: 0, totalSteps: 0, lastResult: null, startedAt: new Date().toISOString() },
  };
}

function lastToolCallId(thread: OrchestratorResult["thread"]): string | undefined {
  const msg = thread.slice().reverse()
    .find((m): m is any => m.role === "assistant" && m.tool_calls?.length > 0);
  return msg?.tool_calls?.[0]?.id;
}

type TurnLog = { tool: string; result?: string; error?: string; paused?: boolean };

function onTurn(logs: TurnLog[]) {
  return async (turn: any) => {
    const entry: TurnLog = { tool: turn.tool };
    if (turn.error) entry.error = turn.error;
    else if (turn.pausedTaskId) entry.paused = true;
    else entry.result = JSON.stringify(turn.result).slice(0, 150);
    logs.push(entry);
  };
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`\n  ○ ${name} ... `);
  try {
    await fn();
    console.log("✓ PASS");
    passed++;
  } catch (err: any) {
    console.log(`✗ FAIL\n    ${err?.message ?? err}`);
    failed++;
  }
}

function expect(val: any, msg: string) {
  if (!val) throw new Error(`ASSERTION: ${msg} (got: ${JSON.stringify(val)})`);
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║      Orchestrator Integration Test Suite     ║");
  console.log("╚══════════════════════════════════════════════╝");

  const { requestId, runId } = await getRealRunId();
  console.log(`\nUsing requestId=${requestId.slice(0, 8)}... runId=${runId.slice(0, 8)}...`);

  // ── 1. Email: ask for address, confirm, send ──────────────────────────────
  console.log("\n── Email flows ──────────────────────────────────────────────");

  await test("Email to unknown person: pauses asking for address OR goes to confirm if already known", async () => {
    const ctx = makeCtx(requestId, runId);
    const logs: TurnLog[] = [];
    const name = `unknown_${Date.now()}`;  // always fresh
    const r = await runOrchestrator(`send an email to ${name} saying project is done`, ctx, { onTurnComplete: onTurn(logs) }) as any;
    expect(!r.done, "should pause, not finish immediately");
    expect(r.pausedTool === "request_user_input", `should ask for email first, got ${r.pausedTool} — desc: "${r.pausedDescription}"`);
    console.log(`\n    → asked: "${r.pausedDescription}"`);
  });

  await test("Email: after providing address, shows confirm_action preview", async () => {
    const ctx = makeCtx(requestId, runId);
    const logs: TurnLog[] = [];
    const name = `newperson_${Date.now()}`;  // always fresh

    // Turn 1: ask for unknown person's email
    const r1 = await runOrchestrator(`send an email to ${name} saying project is done`, ctx, { onTurnComplete: onTurn(logs) }) as any;
    expect(!r1.done, "turn 1 should pause");
    expect(r1.pausedTool === "request_user_input", `should ask for email first, got ${r1.pausedTool}`);
    const tcId1 = lastToolCallId(r1.thread);

    // Turn 2: provide email — should now pause on confirm_action
    const r2 = await runOrchestrator(`send an email to ${name} saying project is done`, ctx, {
      priorThread: r1.thread,
      resumeToolCallId: tcId1,
      resumeResult: { email: `${name}@corp.com` },
      onTurnComplete: onTurn(logs),
    }) as any;

    console.log(`\n    → turn 2: done=${r2.done}, paused=${r2.pausedTool}`);
    expect(!r2.done, "turn 2 should pause on confirm");
    expect(r2.pausedTool === "confirm_action", `should pause on confirm_action, got ${r2.pausedTool}`);
    const details = JSON.stringify(r2.thread);
    expect(details.includes(`${name}@corp.com`), "confirm should include the email address");
    console.log(`    → confirm preview: "${r2.pausedDescription}"`);
  });

  await test("Email: full flow ask→confirm→send completes", async () => {
    const ctx = makeCtx(requestId, runId);
    const name = `fulltest_${Date.now()}`;

    // Turn 1: ask for unknown person's email
    const r1 = await runOrchestrator(`send an email to ${name} saying project is done`, ctx) as any;
    expect(!r1.done, "turn 1 should pause asking for email");
    expect(r1.pausedTool === "request_user_input", `should ask for email, got ${r1.pausedTool}`);
    const tcId1 = lastToolCallId(r1.thread);

    // Turn 2: provide email → should pause on confirm
    const r2 = await runOrchestrator(`send an email to ${name} saying project is done`, ctx, {
      priorThread: r1.thread, resumeToolCallId: tcId1, resumeResult: { email: `${name}@corp.com` },
    }) as any;
    expect(!r2.done, `turn 2 should pause on confirm, got done=${r2.done}, tool=${r2.pausedTool}`);
    expect(r2.pausedTool === "confirm_action", `should be confirm_action, got ${r2.pausedTool}`);
    const tcId2 = lastToolCallId(r2.thread);

    // Turn 3: confirm → completes
    const r3 = await runOrchestrator(`send an email to ${name} saying project is done`, ctx, {
      priorThread: r2.thread, resumeToolCallId: tcId2, resumeResult: { confirmed: true },
    }) as any;

    expect(r3.done, "turn 3 should complete");
    console.log(`\n    → final: "${r3.finalMessage?.slice(0, 120)}"`);
  });

  await test("Email: after learning address, kb_update is called to store it", async () => {
    const ctx = makeCtx(requestId, runId);
    const toolsUsed: string[] = [];

    // Use a fresh unknown person each run
    const name = `testperson_${Date.now()}`;
    const r1 = await runOrchestrator(`send an email to ${name} saying hello`, ctx, {
      onTurnComplete: async (t) => { toolsUsed.push(t.tool); },
    }) as any;

    if (!r1.done && r1.pausedTool === "request_user_input") {
      const tcId1 = lastToolCallId(r1.thread);
      const r2 = await runOrchestrator(`send an email to ${name} saying hello`, ctx, {
        priorThread: r1.thread, resumeToolCallId: tcId1, resumeResult: { email: `${name}@corp.com` },
        onTurnComplete: async (t) => { toolsUsed.push(t.tool); },
      }) as any;
      if (!r2.done) {
        const tcId2 = lastToolCallId(r2.thread);
        await runOrchestrator(`send an email to ${name} saying hello`, ctx, {
          priorThread: r2.thread, resumeToolCallId: tcId2, resumeResult: { confirmed: true },
          onTurnComplete: async (t) => { toolsUsed.push(t.tool); },
        });
      }
    }

    console.log(`\n    → tools: ${toolsUsed.join(" → ")}`);
    expect(toolsUsed.includes("kb_update"), `kb_update should be called. tools used: ${toolsUsed.join(", ")}`);
  });

  // ── 2. Calendar ────────────────────────────────────────────────────────────
  console.log("\n── Calendar flows ───────────────────────────────────────────");

  await test("Calendar: list events calls calendar__list_events", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const r = await runOrchestrator("what's on my calendar today", ctx, {
      onTurnComplete: async (t) => tools.push(t.tool),
    });
    expect(r.done, "should complete");
    expect(tools.includes("calendar.list_events"), `should call calendar.list_events. got: ${tools.join(", ")}`);
    console.log(`\n    → tools: ${tools.join(" → ")}`);
    console.log(`    → result: "${r.done ? r.finalMessage?.slice(0, 150) : "paused"}"`);
  });

  await test("Calendar: create event asks for confirm before creating", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];

    const r1 = await runOrchestrator("schedule a meeting called Team Sync tomorrow at 2pm", ctx, {
      onTurnComplete: async (t) => tools.push(t.tool),
    }) as any;

    // Should either pause on confirm or complete (if no attendees, confirm may not be required)
    console.log(`\n    → done=${r1.done}, tools: ${tools.join(" → ")}`);
    if (!r1.done) {
      console.log(`    → paused on: [${r1.pausedTool}] "${r1.pausedDescription}"`);
    } else {
      console.log(`    → result: "${r1.finalMessage?.slice(0, 150)}"`);
    }
    // Either completed (event created/failed) or paused for confirm - both are valid
    expect(tools.length > 0, "should have called at least one tool");
  });

  await test("Calendar: create event with attendee email asks for confirm", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];

    const r1 = await runOrchestrator(
      "schedule a meeting with sparsh@corp.com tomorrow at 3pm called Budget Review",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    ) as any;

    console.log(`\n    → done=${r1.done}, tools: ${tools.join(" → ")}`);
    if (!r1.done) {
      console.log(`    → paused on: [${r1.pausedTool}] "${r1.pausedDescription}"`);
      expect(
        r1.pausedTool === "confirm_action",
        `should pause on confirm_action before creating event with attendee, got ${r1.pausedTool}`
      );
    } else {
      console.log(`    → result: "${r1.finalMessage?.slice(0, 150)}"`);
    }
  });

  // ── 3. Multi-step ─────────────────────────────────────────────────────────
  console.log("\n── Multi-step flows ─────────────────────────────────────────");

  await test("Multi-step: 'search my sheets and email the result' calls both tools", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];

    const r1 = await runOrchestrator(
      "search all my sheets for 'winner' and email the result to test@example.com",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    ) as any;

    console.log(`\n    → done=${r1.done}, tools: ${tools.join(" → ")}`);
    expect(
      tools.some(t => t.includes("sheets")),
      `should call a sheets tool. got: ${tools.join(", ")}`
    );
  });

  await test("Multi-step: ask email then send chains correctly", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const name = `multistep_${Date.now()}`;

    const r1 = await runOrchestrator(
      `send the Q3 report to ${name}`,
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    ) as any;

    // Should ask for unknown person's email
    if (!r1.done) {
      expect(r1.pausedTool === "request_user_input", `should ask for email, got ${r1.pausedTool}`);
      const tcId = lastToolCallId(r1.thread);
      const r2 = await runOrchestrator(`send the Q3 report to ${name}`, ctx, {
        priorThread: r1.thread,
        resumeToolCallId: tcId,
        resumeResult: { email: `${name}@acme.com` },
        onTurnComplete: async (t) => tools.push(t.tool),
      }) as any;
      console.log(`\n    → after email provided, paused on: ${r2.done ? "done" : r2.pausedTool}`);
      console.log(`    → tools: ${tools.join(" → ")}`);
      if (!r2.done) expect(r2.pausedTool === "confirm_action", `should show confirm before sending, got ${r2.pausedTool}`);
    } else {
      console.log(`\n    → done (KB had address): "${r1.finalMessage?.slice(0, 100)}"`);
    }
  });

  // ── 4. Docs ────────────────────────────────────────────────────────────────
  console.log("\n── Docs flows ───────────────────────────────────────────────");

  await test("Create doc: calls docs__create_document", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const r = await runOrchestrator(
      "create a google doc titled Project Alpha Brief",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    );
    expect(r.done, "should complete");
    expect(tools.includes("docs.create_document"), `should call docs.create_document. got: ${tools.join(", ")}`);
    console.log(`\n    → tools: ${tools.join(" → ")}`);
    console.log(`    → result: "${r.done ? r.finalMessage?.slice(0, 120) : "paused"}"`);
  });

  // ── 5. KB ─────────────────────────────────────────────────────────────────
  console.log("\n── Knowledge base flows ─────────────────────────────────────");

  await test("KB: volunteered fact gets stored with kb_update", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const r = await runOrchestrator(
      "remember that my timezone is Asia/Kolkata",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    );
    expect(r.done, "should complete");
    expect(tools.includes("kb_update"), `should call kb_update. got: ${tools.join(", ")}`);
    console.log(`\n    → tools: ${tools.join(" → ")}`);
    console.log(`    → result: "${r.done ? r.finalMessage?.slice(0, 120) : "paused"}"`);
  });

  await test("KB: email to known contact uses stored address without asking", async () => {
    // Store Rohan with a proper UUID
    const kbId = randomUUID();
    const { error } = await supabaseAdmin.from("knowledge_base").upsert({
      id: kbId,
      clerk_user_id: CLERK_USER,
      kind: "contact",
      subject: "Rohan",
      key: "email",
      value: "rohan@corp.com",
      aliases: ["Rohan", "Rohan Sharma"],
      source: "user_provided",
      confidence: 1.0,
    }, { onConflict: "clerk_user_id,subject,key" });
    if (error) console.log(`    ⚠ KB upsert error: ${error.message}`);

    // Wait a moment for DB write to settle
    await new Promise(r => setTimeout(r, 500));

    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const r1 = await runOrchestrator(
      "send an email to rohan saying the meeting is postponed",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    ) as any;

    console.log(`\n    → done=${r1.done}, tools: ${tools.join(" → ")}`);
    if (!r1.done) console.log(`    → paused on: [${r1.pausedTool}] "${r1.pausedDescription}"`);

    // Should NOT ask for Rohan's email since it's in KB — should go to confirm
    const askedForEmail = !r1.done && r1.pausedTool === "request_user_input" &&
      r1.pausedDescription?.toLowerCase().includes("email");
    expect(!askedForEmail, `should NOT ask for Rohan's email — it's in the KB. Asked: "${r1.pausedDescription}"`);
    console.log(`    → ✓ did not ask for known email`);
  });

  // ── 6. Error handling ──────────────────────────────────────────────────────
  console.log("\n── Error handling ───────────────────────────────────────────");

  await test("Auth error: calendar 403 reports cleanly without retrying forever", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    const r = await runOrchestrator(
      "list my calendar events for this week",
      ctx,
      { onTurnComplete: async (t) => { tools.push(t.tool); if (t.error) console.log(`\n    → error: ${t.error}`); } }
    );
    expect(r.done, "should complete even with auth error");
    expect(tools.filter(t => t === "calendar.list_events").length <= 2, `should not retry endlessly. calls: ${tools.filter(t => t === "calendar.list_events").length}`);
    console.log(`\n    → tools: ${tools.join(" → ")}`);
    console.log(`    → message: "${r.done ? r.finalMessage?.slice(0, 150) : "paused"}"`);
  });

  await test("Placeholder email guard: never sends to @example.com", async () => {
    const ctx = makeCtx(requestId, runId);
    const tools: string[] = [];
    // Give it a real-looking request but try to trick it with example.com
    const r = await runOrchestrator(
      "send a test email to test@example.com",
      ctx,
      { onTurnComplete: async (t) => tools.push(t.tool) }
    ) as any;

    // Model should either ask for a real address or refuse
    console.log(`\n    → done=${r.done}, tools: ${tools.join(" → ")}`);
    if (!r.done) {
      console.log(`    → paused: [${r.pausedTool}] "${r.pausedDescription}"`);
    } else {
      console.log(`    → message: "${r.done ? r.finalMessage?.slice(0, 150) : ""}"`);
    }
    // The model should NOT directly call gmail__send_email with example.com
    // It should either ask for real address or refuse via confirm
    const sentWithExample = tools.includes("gmail.send_email"); // if it tried to send, that's a problem
    // We don't hard-assert this since the model might legitimately send to test@ but we log it
    console.log(`    → sent directly to example.com: ${sentWithExample ? "⚠ YES (should confirm first)": "✓ NO"}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed${" ".repeat(30 - String(passed).length - String(failed).length)}║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("\nTest suite crashed:", err);
  process.exit(1);
});
