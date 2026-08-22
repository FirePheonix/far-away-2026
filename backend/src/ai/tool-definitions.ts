/**
 * tool-definitions.ts
 *
 * All assistant tools expressed as OpenAI function definitions.
 *
 * OpenAI tool names must match ^[a-zA-Z0-9_-]+$ — no dots allowed.
 * We replace dots with double-underscores (sheets.search_sheet →
 * sheets__search_sheet) and provide toRegistryName() / toOpenAIName()
 * helpers so the orchestrator can round-trip cleanly.
 *
 * Rule: OPENAI_TOOL_DEFINITIONS uses double-underscore names.
 *       The registry still uses dot names (sheets.search_sheet).
 */

import type OpenAI from "openai";

type FunctionDef = OpenAI.Chat.ChatCompletionTool;

/** Convert a dot-namespaced registry name to an OpenAI-safe name. */
export function toOpenAIName(registryName: string): string {
  return registryName.replace(/\./g, "__");
}

/** Convert an OpenAI tool name back to the registry name. */
export function toRegistryName(openAIName: string): string {
  return openAIName.replace(/__/g, ".");
}

export const OPENAI_TOOL_DEFINITIONS: FunctionDef[] = [
  // ── Sheets ────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "sheets__search_sheet",
      description: "Search rows in a named Google Sheet by text query.",
      parameters: {
        type: "object",
        properties: {
          sheetName: { type: "string", description: "Exact sheet tab name." },
          query: { type: "string", description: "Text to search for." },
          spreadsheetId: { type: "string", description: "Override the default spreadsheet ID." },
        },
        required: ["sheetName", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__search_all_sheets",
      description:
        "Search across ALL Google Sheets in the user's Drive. Use when the user says 'all my sheets' or doesn't know which spreadsheet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxSpreadsheets: { type: "number", default: 25 },
          maxSheetTabs: { type: "number", default: 10 },
          maxMatches: { type: "number", default: 50 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__get_last_row",
      description: "Get the last non-empty row from a Google Sheet. Use for 'latest entry' requests.",
      parameters: {
        type: "object",
        properties: {
          sheetName: { type: "string" },
          spreadsheetId: { type: "string" },
        },
        required: ["sheetName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__get_row",
      description: "Get a specific row by row number from a Google Sheet.",
      parameters: {
        type: "object",
        properties: {
          sheetName: { type: "string" },
          rowNumber: { type: "number" },
          spreadsheetId: { type: "string" },
        },
        required: ["sheetName", "rowNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__find_email",
      description: "Find an email address in a sheet row.",
      parameters: {
        type: "object",
        properties: {
          sheetName: { type: "string" },
          rowNumber: { type: "number" },
          columnName: { type: "string" },
          spreadsheetId: { type: "string" },
        },
        required: ["sheetName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__create_spreadsheet",
      description: "Create a new Google Spreadsheet.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          sheetName: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sheets__append_row",
      description: "Append a row of values to a Google Sheet.",
      parameters: {
        type: "object",
        properties: {
          sheetName: { type: "string" },
          values: { type: "array", items: { type: "string" } },
          spreadsheetId: { type: "string" },
        },
        required: ["sheetName", "values"],
      },
    },
  },

  // ── Gmail ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "gmail__send_email",
      description:
        "Send an email via Gmail. ONLY call this when you have a REAL, confirmed email address. " +
        "Never guess or invent email addresses. If you don't know the address, call request_user_input first.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description:
              "Recipient email address. Must be a real address — never use example.com, placeholder, or guessed addresses.",
          },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail__search_email",
      description: "Search Gmail messages using a Gmail search query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number", default: 10 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail__reply_email",
      description: "Reply to an existing Gmail message by message ID.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string" },
          body: { type: "string" },
          threadId: { type: "string" },
        },
        required: ["messageId", "body"],
      },
    },
  },

  // ── Calendar ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "calendar__create_event",
      description: "Create a Google Calendar event.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "ISO 8601 datetime string." },
          end: { type: "string", description: "ISO 8601 datetime string." },
          description: { type: "string" },
          attendees: { type: "array", items: { type: "string" }, description: "Email addresses." },
          timeZone: { type: "string" },
          calendarId: { type: "string" },
          meetLink: { type: "string" },
        },
        required: ["title", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar__list_events",
      description: "List calendar events in a time range.",
      parameters: {
        type: "object",
        properties: {
          timeMin: { type: "string", description: "ISO 8601 datetime." },
          timeMax: { type: "string", description: "ISO 8601 datetime." },
          maxResults: { type: "number", default: 25 },
          calendarId: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar__find_free_slots",
      description: "Find available free time slots on the calendar.",
      parameters: {
        type: "object",
        properties: {
          durationMinutes: { type: "number", default: 30 },
          timeMin: { type: "string" },
          timeMax: { type: "string" },
          workingHoursStart: { type: "number", default: 9 },
          workingHoursEnd: { type: "number", default: 17 },
          calendarId: { type: "string" },
        },
        required: [],
      },
    },
  },

  // ── Meet ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "meet__create_link",
      description: "Create a Google Meet link.",
      parameters: {
        type: "object",
        properties: {
          eventTitle: { type: "string" },
        },
        required: [],
      },
    },
  },

  // ── Docs ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "docs__create_document",
      description: "Create a new Google Doc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          initialText: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docs__append_text",
      description: "Append text to an existing Google Doc.",
      parameters: {
        type: "object",
        properties: {
          documentId: { type: "string" },
          text: { type: "string" },
        },
        required: ["documentId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docs__insert_template",
      description: "Insert a predefined template into an existing Google Doc.",
      parameters: {
        type: "object",
        properties: {
          documentId: { type: "string" },
          template: {
            type: "string",
            enum: ["meeting_notes", "follow_up_email", "project_brief"],
          },
          replacements: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["documentId", "template"],
      },
    },
  },

  // ── Slack ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "slack_send_message",
      description: "Send a message to a Slack channel or user.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID, name, or user ID." },
          text: { type: "string" },
        },
        required: ["channel", "text"],
      },
    },
  },

  // ── GitHub ────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "github_create_issue",
      description: "Create a GitHub issue in a repository.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
        },
        required: ["owner", "repo", "title"],
      },
    },
  },

  // ── Notion ────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "notion_create_page",
      description: "Create a new page in Notion.",
      parameters: {
        type: "object",
        properties: {
          parentId: { type: "string" },
          parentType: { type: "string", enum: ["database_id", "page_id"] },
          title: { type: "string" },
          content: { type: "string" },
        },
        required: ["parentId", "parentType", "title"],
      },
    },
  },

  // ── Obsidian ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "obsidian__search_notes",
      description:
        "Search for notes in the user's local Obsidian vault. Requires the desktop app to be running.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number", default: 10 },
          vaultName: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obsidian__append_to_note",
      description:
        "Append markdown to a specific Obsidian note. Use obsidian.search_notes first if you only know the name.",
      parameters: {
        type: "object",
        properties: {
          notePath: { type: "string", description: "Relative path inside vault, e.g. 'Projects/Alpha.md'." },
          content: { type: "string" },
          vaultName: { type: "string" },
        },
        required: ["notePath", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obsidian__write_daily_note",
      description: "Append to today's daily note in Obsidian. Auto-creates the file if missing.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          vaultName: { type: "string" },
        },
        required: ["content"],
      },
    },
  },

  // ── Knowledge base ────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "kb_update",
      description:
        "Store or update facts in the user's personal knowledge base. " +
        "Call this IMMEDIATELY after learning any new fact from the user (email address, timezone, preference, etc). " +
        "Facts stored here are shown to you at the start of every future conversation.",
      parameters: {
        type: "object",
        properties: {
          facts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string", description: "Entity name, e.g. 'Sparsh', 'self'." },
                key: { type: "string", description: "e.g. 'email', 'phone', 'timezone'." },
                value: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["contact", "preference", "fact", "credential", "alias"],
                  default: "fact",
                },
                aliases: {
                  type: "array",
                  items: { type: "string" },
                  description: "Other names the user might say for this subject.",
                },
                notes: { type: "string" },
              },
              required: ["subject", "key", "value"],
            },
            minItems: 1,
          },
        },
        required: ["facts"],
      },
    },
  },

  // ── User input / confirm ──────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "request_user_input",
      description:
        "Pause and ask the user for information you don't know and can't infer. " +
        "Check the KNOWLEDGE BASE section first — if the info is already there, use it directly. " +
        "Always follow this with kb_update to store the answer.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Plain English explanation of what you need and why.",
          },
          required_fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", description: "e.g. 'email', 'string', 'url'." },
              },
              required: ["name", "type"],
            },
            minItems: 1,
          },
        },
        required: ["description", "required_fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_action",
      description:
        "Show the user a preview of what is about to happen and wait for their confirmation. " +
        "ALWAYS call this before gmail__send_email and before calendar__create_event with attendees. " +
        "Do NOT call this for read-only tools.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "One-line description: e.g. 'Send email to sparsh@corp.com'.",
          },
          details: {
            type: "object",
            description: "Key-value preview shown to user. For email: { To, Subject, Body }.",
            additionalProperties: { type: "string" },
          },
        },
        required: ["action", "details"],
      },
    },
  },
];
