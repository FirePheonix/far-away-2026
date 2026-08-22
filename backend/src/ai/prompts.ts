import { toolNameSchema } from "./schemas.js";

const TOOL_CATALOG = [
  {
    tool: "sheets.search_sheet",
    description: "Search rows in a Google Sheet by text query",
    params: { sheetName: "string", query: "string", spreadsheetId: "string (optional)" },
  },
  {
    tool: "sheets.search_all_sheets",
    description: "Search rows across all Google Sheets files available to the connected Google account",
    params: {
      query: "string",
      maxSpreadsheets: "number (optional)",
      maxSheetTabs: "number (optional)",
      maxMatches: "number (optional)",
    },
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
    tool: "sheets.create_spreadsheet",
    description: "Create a new Google Spreadsheet",
    params: {
      title: "string",
      sheetName: "string (optional)",
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
  {
    tool: "docs.create_document",
    description: "Create a new Google Doc",
    params: { title: "string", initialText: "string (optional)" },
  },
  {
    tool: "docs.append_text",
    description: "Append text to a Google Doc",
    params: { documentId: "string", text: "string" },
  },
  {
    tool: "docs.insert_template",
    description: "Insert a predefined template into a Google Doc",
    params: {
      documentId: "string",
      template: `"meeting_notes" | "follow_up_email" | "project_brief"`,
      replacements: "object map (optional)",
    },
  },
  {
    tool: "obsidian.search_notes",
    description: "Search for notes in the user's local Obsidian vault by filename or content. Returns matching note paths and snippets. Requires the desktop app to be running.",
    params: {
      query: "string",
      maxResults: "number (optional, default 10)",
      vaultName: "string (optional — required when user has multiple vaults)",
    },
  },
  {
    tool: "obsidian.append_to_note",
    description: "Append markdown content to a specific note in the user's Obsidian vault. Use obsidian.search_notes first when you only know the name, not the exact path.",
    params: {
      notePath: "string — relative path inside the vault (e.g. 'Projects/Alpha.md')",
      content: "string — markdown to append",
      vaultName: "string (optional — required when user has multiple vaults)",
    },
  },
  {
    tool: "obsidian.write_daily_note",
    description: "Append content to today's daily note in the user's Obsidian vault (auto-creates the file if missing). Ideal for logging meetings, journal entries, quick thoughts.",
    params: {
      content: "string — markdown to append",
      vaultName: "string (optional — required when user has multiple vaults)",
    },
  },
  {
    tool: "request_user_input",
    description:
      "Pause and ask the user for missing information you cannot infer (e.g. an email address not in the knowledge base, a repo name, a file path). " +
      "ONLY use this when the USER KNOWLEDGE BASE section does NOT already contain the needed value. " +
      "Always follow request_user_input with kb_update to store the answer so it is never asked again.",
    params: {
      description: "string — why you need this information",
      required_fields: "array of { name: string, type: string }",
    },
  },
  {
    tool: "kb_update",
    description:
      "Store or update facts in the user's personal knowledge base. " +
      "Use this IMMEDIATELY after request_user_input resolves so the same question is never asked twice. " +
      "Also use it when the user volunteers new information ('my timezone is IST', 'Shubham's email is …'). " +
      "Facts stored here are injected into every future plan automatically.",
    params: {
      facts: "array of { subject, key, value, kind?, aliases?, source?, confidence?, notes? }",
    },
  },
] as const;

export function buildPlannerSystemPrompt(): string {
  const now = new Date();
  const isoNow = now.toISOString();
  const tzOffset = -now.getTimezoneOffset();
  const tzHours = Math.floor(Math.abs(tzOffset) / 60).toString().padStart(2, "0");
  const tzMins = (Math.abs(tzOffset) % 60).toString().padStart(2, "0");
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzString = `UTC${tzSign}${tzHours}:${tzMins}`;

  return `You are a tool planner for a voice assistant. Convert the user's natural language request into a sequence of tool calls.

CURRENT DATE/TIME: ${isoNow} (${tzString})
Use this to resolve relative dates like "today", "tomorrow", "next week", etc.
Always generate ISO datetime strings for calendar events based on this current time.

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
8. Prefer sheets.create_spreadsheet when user asks to create a new sheet/spreadsheet.
9. Prefer sheets.search_all_sheets when user asks to search "all sheets", "all spreadsheets", or "my sheets".
10. Prefer docs.create_document when user asks to create a doc/document.
11. Use docs.append_text or docs.insert_template for adding content to docs.
12. Order matters: fetch data before sending emails or creating events.
13. Prefer obsidian.write_daily_note for logging, journaling, or recording meeting notes in Obsidian.
14. Use obsidian.search_notes before obsidian.append_to_note when the user refers to a note by name but you do not know the exact file path.
15. For Obsidian tools: if the user has multiple vaults and you are unsure which vault to use, call request_user_input first to ask for the vault name. If only one vault exists, omit vaultName.
16. KNOWLEDGE BASE RULES — read the USER KNOWLEDGE BASE section in the user prompt before planning:
    a. If a needed value (email, phone, slack id, etc.) is listed there, use it directly. NEVER call request_user_input for something already in the knowledge base.
    b. If a needed value is NOT in the knowledge base AND you cannot infer it, call request_user_input to ask the user.
    c. ALWAYS follow a request_user_input step with a kb_update step that stores the answer. This teaches the assistant so it never asks the same question again.
    d. When the user volunteers new facts mid-request ("my timezone is IST", "call Priya's number 9876543210"), emit a kb_update step to store them even if no request_user_input was needed.
    e. Use kind="contact" for people, kind="preference" for user settings/defaults, kind="credential" for logins/handles, kind="fact" for everything else.
    f. Populate aliases with every alternative name the user might say (e.g. ["Shubh", "Shubham Verma"] for subject="Shubham").

AVAILABLE TOOLS:
${JSON.stringify(TOOL_CATALOG, null, 2)}

OUTPUT SCHEMA:
{
  "actions": [
    { "tool": "<tool_name>", "params": { ... } }
  ]
}

Valid tool names: ${toolNameSchema.options.join(", ")}`;
}

export const PLANNER_EXAMPLES = [
  {
    input: "Search all my sheets for abc entry",
    output: {
      actions: [{ tool: "sheets.search_all_sheets", params: { query: "abc" } }],
    },
  },
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
            start: "<tomorrow_at_14:00_ISO>",
            end: "<tomorrow_at_15:00_ISO>",
            meetLinkFromPreviousStep: true,
            emailFromPreviousStep: true,
          },
        },
      ],
    },
  },
] as const;

export function buildPlannerUserPrompt(transcript: string, memoryContext?: string): string {
  const now = new Date().toISOString();
  const memory = memoryContext
    ? `\n\nLONG-TERM MEMORY\nThis is what you already know about this user from earlier sessions. Use it to fill in details the user did not repeat (for example an email address you have seen before) instead of calling request_user_input.\n\n${memoryContext}`
    : "";

  return `Current time: ${now}${memory}\n\nUser request:\n"${transcript}"\n\nReturn the JSON plan.`;
}
