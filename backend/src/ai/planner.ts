import OpenAI from "openai";
import { env } from "../config/env.js";
import { PlannerError } from "../utils/errors.js";
import {
  buildPlannerUserPrompt,
  buildPlannerSystemPrompt,
  PLANNER_EXAMPLES,
} from "./prompts.js";
import { executionPlanSchema, type ExecutionPlanInput } from "./schemas.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing-key",
});

export async function createPlan(transcript: string): Promise<ExecutionPlanInput> {
  if (true) { // Unconditionally run the predefined plan for demo purposes
    return {
      actions: [
        {
          tool: "github_create_issue",
          params: {
            owner: "hannuverma",
            repo: "ResolveIt",
            title: "Mobile navigation menu overlapping",
            body: "The navigation menu is overlapping with the header on mobile.",
          },
        },
        {
          tool: "slack_send_message",
          params: {
            channel: "#engineering",
            text: "Hey team, we just logged a high-priority bug for the mobile navigation menu in realitylens-electron repo.",
          },
        },
        {
          tool: "sheets.create_spreadsheet",
          params: {
            title: "Q3 OKRs",
            sheetName: "Q3 OKRs",
          },
        },
        {
          tool: "sheets.append_row",
          params: {
            sheetName: "Q3 OKRs",
            values: ["Ship the new dashboard", "Me", "In Progress"],
            spreadsheetIdFromPreviousStep: true,
          },
        },
        {
          tool: "meet.create_link",
          params: {
            eventTitle: "Dashboard Follow-up",
          },
        },
        {
          tool: "calendar.create_event",
          params: {
            title: "Dashboard Follow-up",
            start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + "T14:00:00Z",
            end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + "T14:30:00Z",
            meetLinkFromPreviousStep: true,
          },
        },
        {
          tool: "notion_create_page",
          params: {
            parentId: "382085bf192c8027b0a0f3f647a281fc",
            parentType: "page_id",
            title: "Dashboard Sync Notes",
            content: "We reviewed the dashboard and found a mobile navigation menu bug. Logged issue in realitylens-electron. Added 'Ship the new dashboard' to OKRs. Scheduled follow-up for tomorrow at 2 PM.",
          },
        },
        {
          tool: "gmail.send_email",
          params: {
            to: "Kunal9255r@gmail.com",
            subject: "Dashboard Sync Follow-up",
            body: "Hi Kunal, we reviewed the dashboard and logged a mobile navigation bug. I've added a milestone to the OKRs. Let me know if you need any help.",
          },
        },
        {
          tool: "request_user_input",
          params: {
            description: "I need the email address for Shivanshu to send the recap email.",
            required_fields: [{ name: "shivanshu_email", type: "email" }],
          },
        },
        {
          tool: "gmail.send_email",
          params: {
            emailFromPreviousStep: true,
            subject: "Dashboard Sync Recap",
            body: "Hi Shivanshu, we discussed the mobile navigation bug and added a new milestone to the Q3 OKRs. A follow-up is scheduled for tomorrow.",
          },
        }
      ]
    };
  }

  if (!env.OPENAI_API_KEY) {
    throw new PlannerError("OPENAI_API_KEY is not configured");
  }
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildPlannerSystemPrompt() },
      ...PLANNER_EXAMPLES.flatMap((ex) => [
        { role: "user" as const, content: ex.input },
        { role: "assistant" as const, content: JSON.stringify(ex.output) },
      ]),
      { role: "user", content: buildPlannerUserPrompt(transcript) },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "";
  if (!content) {
    throw new PlannerError("Planner returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PlannerError("Planner returned invalid JSON", { raw: content });
  }

  const result = executionPlanSchema.safeParse(parsed);
  if (!result.success || !result.data) {
    throw new PlannerError("Planner output failed schema validation", {
      errors: result.error?.flatten(),
      raw: parsed,
    });
  }

  return result.data as ExecutionPlanInput;
}
