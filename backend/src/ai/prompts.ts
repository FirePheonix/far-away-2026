import { toolNameSchema } from "./schemas.js";

const TOOL_CATALOG = [
  {
    tool: "sheets.search_sheet",
    description: "Search rows in a Google Sheet by text query",
    params: { sheetName: "string", query: "string", spreadsheetId: "string (optional)" },
  },
  {
    tool: "sheets.get_last_row",
    description: "Get the last non-empty row from a Google Sheet",
    params: { sheetName: "string", spreadsheetId: "string (optional)" },
  },
  {
    tool: "sheets.get_row",
    description: "Get a specific row by number from a Google Sheet",
    params: { sheetName: "string", rowNumber: "number", spreadsheetId: "string (optional)" },
  },
  {
    tool: "sheets.find_email",
    description: "Find an email address in a sheet row",
    params: {
      sheetName: "string",
      rowNumber: "number (optional)",
      columnName: "string (optional)",
      spreadsheetId: "string (optional)",
    },
  },
  {
    tool: "gmail.send_email",
    description: "Send an email via Gmail",
    params: {
      to: "string (email, optional if emailFromPreviousStep)",
      subject: "string (optional)",
      body: "string (optional)",
      emailFromPreviousStep: "boolean — use email from prior step",
      bodyFromPreviousStep: "boolean — use prior step data as body",
    },
  },
  {
    tool: "gmail.search_email",
    description: "Search Gmail messages",
    params: { query: "string", maxResults: "number (optional)" },
  },
  {
    tool: "gmail.reply_email",
    description: "Reply to an existing Gmail message",
    params: { messageId: "string", body: "string", threadId: "string (optional)" },
  },
  {
    tool: "calendar.create_event",
    description: "Create a Google Calendar event",
    params: {
      title: "string",
      start: "ISO datetime string",
      end: "ISO datetime string",
      description: "string (optional)",
      attendees: "string[] emails (optional)",
      meetLink: "string URL (optional)",
      meetLinkFromPreviousStep: "boolean",
    },
  },
  {
    tool: "calendar.list_events",
    description: "List calendar events in a time range",
    params: {
      timeMin: "ISO datetime (optional)",
      timeMax: "ISO datetime (optional)",
      maxResults: "number (optional)",
    },
  },
  {
    tool: "calendar.find_free_slots",
    description: "Find available time slots on the calendar",
    params: {
      durationMinutes: "number (optional)",
      timeMin: "ISO datetime (optional)",
      timeMax: "ISO datetime (optional)",
    },
  },
  {
    tool: "meet.create_link",
    description: "Create a Google Meet link",
    params: { eventTitle: "string (optional)" },
  },
] as const;

export const PLANNER_SYSTEM_PROMPT = `You are a tool planner for a voice assistant. Convert the user's natural language request into a sequence of tool calls.

RULES:
1. Output ONLY valid JSON matching the schema — no markdown, no explanation.
2. Use tools only — never invent "agents" or delegate to sub-agents.
3. Each action must have "tool" (exact tool name) and "params" (object).
4. Chain steps using param flags when later steps need prior output:
   - emailFromPreviousStep: true — pass email from previous step to gmail.send_email
   - bodyFromPreviousStep: true — use previous step data as email body
   - meetLinkFromPreviousStep: true — attach Meet link from prior meet.create_link step
   - fromStep: number — inject result from a specific step index (0-based)
5. Break complex requests into atomic tool calls in logical order.
6. Prefer sheets.get_last_row when user mentions "last row" or "latest entry".
7. Prefer sheets.find_email when you need an email from sheet data.
8. Order matters: fetch data before sending emails or creating events.

AVAILABLE TOOLS:
${JSON.stringify(TOOL_CATALOG, null, 2)}

OUTPUT SCHEMA:
{
  "actions": [
    { "tool": "<tool_name>", "params": { ... } }
  ]
}

Valid tool names: ${toolNameSchema.options.join(", ")}`;

export const PLANNER_EXAMPLES = [
  {
    input: "Get the last row from Hackathon Winners and email the winner.",
    output: {
      actions: [
        { tool: "sheets.get_last_row", params: { sheetName: "Hackathon Winners" } },
        {
          tool: "gmail.send_email",
          params: {
            emailFromPreviousStep: true,
            subject: "Congratulations!",
            bodyFromPreviousStep: true,
          },
        },
      ],
    },
  },
  {
    input: "Schedule a meeting with the winner from Hackathon Winners tomorrow at 2pm",
    output: {
      actions: [
        { tool: "sheets.get_last_row", params: { sheetName: "Hackathon Winners" } },
        { tool: "meet.create_link", params: { eventTitle: "Hackathon Winner Meeting" } },
        {
          tool: "calendar.create_event",
          params: {
            title: "Meeting with Hackathon Winner",
            start: "2024-12-05T14:00:00Z",
            end: "2024-12-05T15:00:00Z",
            meetLinkFromPreviousStep: true,
            emailFromPreviousStep: true,
          },
        },
      ],
    },
  },
] as const;

export function buildPlannerUserPrompt(transcript: string): string {
  return `User request:\n"${transcript}"\n\nReturn the JSON plan.`;
}
