import { z } from "zod";

export const toolNameSchema = z.enum([
  "sheets.search_sheet",
  "sheets.search_all_sheets",
  "sheets.get_last_row",
  "sheets.get_row",
  "sheets.find_email",
  "sheets.create_spreadsheet",
  "gmail.send_email",
  "gmail.search_email",
  "gmail.reply_email",
  "calendar.create_event",
  "calendar.list_events",
  "calendar.find_free_slots",
  "meet.create_link",
  "docs.create_document",
  "docs.append_text",
  "docs.insert_template",
]);

export const plannedActionSchema = z.object({
  tool: toolNameSchema,
  params: z.record(z.unknown()).default({}),
});

export const executionPlanSchema = z.object({
  actions: z.array(plannedActionSchema).min(1),
});

export const assistantRequestSchema = z.object({
  transcript: z.string().min(1, "transcript is required"),
});

export type PlannedActionInput = z.infer<typeof plannedActionSchema>;
export type ExecutionPlanInput = z.infer<typeof executionPlanSchema>;
export type AssistantRequestInput = z.infer<typeof assistantRequestSchema>;

// ── Sheets ──────────────────────────────────────────────────────────────────

export const sheetsSearchParamsSchema = z.object({
  sheetName: z.string(),
  query: z.string(),
  spreadsheetId: z.string().optional(),
});

export const sheetsSearchAllParamsSchema = z.object({
  query: z.string(),
  maxSpreadsheets: z.number().int().positive().max(100).default(25),
  maxSheetTabs: z.number().int().positive().max(50).default(10),
  maxMatches: z.number().int().positive().max(200).default(50),
});

export const sheetsGetLastRowParamsSchema = z.object({
  sheetName: z.string(),
  spreadsheetId: z.string().optional(),
});

export const sheetsGetRowParamsSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.number().int().positive(),
  spreadsheetId: z.string().optional(),
});

export const sheetsFindEmailParamsSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.number().int().positive().optional(),
  columnName: z.string().optional(),
  spreadsheetId: z.string().optional(),
});

export const sheetsCreateSpreadsheetParamsSchema = z.object({
  title: z.string(),
  sheetName: z.string().optional(),
});

export const sheetRowResultSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.number(),
  values: z.array(z.string()),
  email: z.string().email().optional(),
  spreadsheetId: z.string().optional(),
  spreadsheetTitle: z.string().optional(),
});

export const spreadsheetCreateResultSchema = z.object({
  spreadsheetId: z.string(),
  title: z.string(),
  spreadsheetUrl: z.string().url().optional(),
  status: z.enum(["created", "mock"]),
});

// ── Gmail ───────────────────────────────────────────────────────────────────

export const gmailSendEmailParamsSchema = z.object({
  to: z.string().email().optional(),
  subject: z.string().default("Message from Far Away Assistant"),
  body: z.string().default(""),
  emailFromPreviousStep: z.boolean().optional(),
  dataFromPreviousStep: z.boolean().optional(),
  subjectFromPreviousStep: z.boolean().optional(),
  bodyFromPreviousStep: z.boolean().optional(),
  fromStep: z.number().int().nonnegative().optional(),
});

export const gmailSearchEmailParamsSchema = z.object({
  query: z.string(),
  maxResults: z.number().int().positive().default(10),
});

export const gmailReplyEmailParamsSchema = z.object({
  messageId: z.string(),
  body: z.string(),
  threadId: z.string().optional(),
});

export const emailResultSchema = z.object({
  messageId: z.string(),
  threadId: z.string().optional(),
  to: z.string().email(),
  subject: z.string(),
  status: z.enum(["sent", "draft", "mock"]),
});

export const emailSearchResultSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      threadId: z.string().optional(),
      subject: z.string(),
      from: z.string(),
      snippet: z.string(),
    }),
  ),
});

// ── Calendar ────────────────────────────────────────────────────────────────

export const calendarCreateEventParamsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  attendees: z.array(z.string().email()).optional(),
  timeZone: z.string().optional(),
  calendarId: z.string().optional(),
  meetLinkFromPreviousStep: z.boolean().optional(),
  meetLink: z.string().url().optional(),
  emailFromPreviousStep: z.boolean().optional(),
});

export const calendarListEventsParamsSchema = z.object({
  calendarId: z.string().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().int().positive().default(25),
});

export const calendarFindFreeSlotsParamsSchema = z.object({
  calendarId: z.string().optional(),
  durationMinutes: z.number().int().positive().default(30),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  workingHoursStart: z.number().int().min(0).max(23).default(9),
  workingHoursEnd: z.number().int().min(1).max(24).default(17),
});

export const calendarEventResultSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  htmlLink: z.string().optional(),
  meetLink: z.string().optional(),
  status: z.enum(["created", "mock"]),
});

export const freeSlotResultSchema = z.object({
  slots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
    }),
  ),
});

// ── Meet ────────────────────────────────────────────────────────────────────

export const meetCreateLinkParamsSchema = z.object({
  eventTitle: z.string().optional(),
});

export const meetLinkResultSchema = z.object({
  meetLink: z.string().url(),
  status: z.enum(["created", "mock"]),
});

// —— Docs ————————————————————————————————————————————————————————————————————

export const docsCreateDocumentParamsSchema = z.object({
  title: z.string(),
  initialText: z.string().optional(),
});

export const docsAppendTextParamsSchema = z.object({
  documentId: z.string(),
  text: z.string().min(1),
});

export const docsInsertTemplateParamsSchema = z.object({
  documentId: z.string(),
  template: z
    .enum(["meeting_notes", "follow_up_email", "project_brief"])
    .default("meeting_notes"),
  replacements: z.record(z.string()).optional(),
});

export const docsOperationResultSchema = z.object({
  documentId: z.string(),
  title: z.string().optional(),
  url: z.string().url().optional(),
  status: z.enum(["created", "updated", "mock"]),
});

export const plannerResponseSchema = executionPlanSchema;
