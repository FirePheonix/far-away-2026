/**
 * Turns whatever a tool threw into a decision plus a sentence a human can read.
 *
 * Two consumers:
 *   - the workflow, which needs `kind` to decide retry vs. fail vs. hand back
 *   - the desktop overlay, which shows `message` on the failed step
 */

export type ToolErrorKind =
  | "transient"
  | "permanent"
  | "auth"
  | "needs_user_input"
  | "unknown";

export interface NormalizedToolError {
  kind: ToolErrorKind;
  code: string;
  /** Plain language, shown verbatim in the desktop overlay. */
  message: string;
  /** Raw payload, truncated. For the trace view and logs. */
  detail?: string;
  retryable: boolean;
  status?: number;
}

const DETAIL_LIMIT = 800;

function unwrapCause(err: unknown): unknown {
  // ToolExecutionError wraps the provider error; look through it.
  const cause = (err as { cause?: unknown })?.cause;
  return cause ?? err;
}

function readStatus(err: unknown): number | undefined {
  const e = err as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown; data?: { error?: { code?: unknown } } };
  };

  const candidates = [
    e?.status,
    e?.response?.status,
    e?.response?.data?.error?.code,
    typeof e?.code === "number" ? e.code : undefined,
  ];

  for (const candidate of candidates) {
    const num = typeof candidate === "string" ? Number(candidate) : candidate;
    if (typeof num === "number" && Number.isFinite(num) && num >= 100 && num < 600) {
      return num;
    }
  }
  return undefined;
}

function readSyscall(err: unknown): string | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" ? code : undefined;
}

function readDetail(err: unknown): string | undefined {
  const e = err as { response?: { data?: unknown }; message?: string };
  const payload = e?.response?.data;
  const text = payload ? JSON.stringify(payload) : e?.message;
  if (!text) return undefined;
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…` : text;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

/** The part of the tool name a user would recognise: "gmail", "calendar", … */
function providerOf(toolName: string): string {
  const provider = toolName.split(/[._]/)[0] ?? toolName;
  const labels: Record<string, string> = {
    gmail: "Gmail",
    calendar: "Calendar",
    sheets: "Sheets",
    docs: "Docs",
    meet: "Meet",
    slack: "Slack",
    github: "GitHub",
    notion: "Notion",
  };
  return labels[provider] ?? provider;
}

const TRANSIENT_SYSCALLS = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function normalizeToolError(toolName: string, raw: unknown): NormalizedToolError {
  const err = unwrapCause(raw);
  const status = readStatus(err);
  const syscall = readSyscall(err);
  const text = `${messageOf(err)} ${readDetail(err) ?? ""}`.toLowerCase();
  const detail = readDetail(err);
  const provider = providerOf(toolName);

  // ---- Missing account context -------------------------------------------
  if (text.includes("missing user context")) {
    return {
      kind: "auth",
      code: "NOT_PAIRED",
      message: "This desktop isn't paired to an account yet",
      detail,
      retryable: false,
    };
  }

  // ---- Auth --------------------------------------------------------------
  if (
    text.includes("invalid_grant") ||
    text.includes("token has been expired or revoked") ||
    text.includes("no refresh token")
  ) {
    return {
      kind: "auth",
      code: "TOKEN_REVOKED",
      message: `${provider} needs reconnecting — the saved access was revoked`,
      detail,
      retryable: false,
      status,
    };
  }

  if (
    text.includes("access_token_scope_insufficient") ||
    text.includes("insufficient permission") ||
    text.includes("insufficient authentication scope")
  ) {
    return {
      kind: "auth",
      code: "SCOPE_INSUFFICIENT",
      message: `${provider} is missing a permission this action needs — reconnect to grant it`,
      detail,
      retryable: false,
      status,
    };
  }

  if (
    text.includes("not connected") ||
    text.includes("no google connection") ||
    text.includes("connect your")
  ) {
    return {
      kind: "auth",
      code: "NOT_CONNECTED",
      message: `${provider} isn't connected yet`,
      detail,
      retryable: false,
      status,
    };
  }

  if (status === 401) {
    return {
      kind: "auth",
      code: "UNAUTHORIZED",
      message: `${provider} rejected the saved credentials — reconnect to continue`,
      detail,
      retryable: false,
      status,
    };
  }

  if (status === 403) {
    // Google returns 403 for both permission problems and quota exhaustion.
    const quota = text.includes("rate limit") || text.includes("quota") || text.includes("userratelimit");
    return quota
      ? {
          kind: "transient",
          code: "QUOTA_EXCEEDED",
          message: `${provider} hit a rate limit — retrying`,
          detail,
          retryable: true,
          status,
        }
      : {
          kind: "auth",
          code: "FORBIDDEN",
          message: `${provider} refused this action — the account may lack access`,
          detail,
          retryable: false,
          status,
        };
  }

  // ---- Transient ---------------------------------------------------------
  if (status === 429) {
    return {
      kind: "transient",
      code: "RATE_LIMITED",
      message: `${provider} is rate limiting — retrying`,
      detail,
      retryable: true,
      status,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      kind: "transient",
      code: `HTTP_${status}`,
      message: `${provider} is temporarily unavailable — retrying`,
      detail,
      retryable: true,
      status,
    };
  }

  if (status === 408 || (syscall && TRANSIENT_SYSCALLS.has(syscall))) {
    return {
      kind: "transient",
      code: syscall ?? "TIMEOUT",
      message: `Couldn't reach ${provider} — retrying`,
      detail,
      retryable: true,
      status,
    };
  }

  if (text.includes("socket hang up") || text.includes("network") || text.includes("timeout")) {
    return {
      kind: "transient",
      code: "NETWORK",
      message: `Couldn't reach ${provider} — retrying`,
      detail,
      retryable: true,
      status,
    };
  }

  // ---- Permanent ---------------------------------------------------------
  const zodIssues = (err as { issues?: unknown[] })?.issues;
  if (Array.isArray(zodIssues) || (err as Error)?.name === "ZodError") {
    const fields = Array.isArray(zodIssues)
      ? zodIssues
          .map((issue) => (issue as { path?: unknown[] })?.path?.join("."))
          .filter(Boolean)
          .join(", ")
      : "";
    return {
      kind: "permanent",
      code: "INVALID_PARAMS",
      message: fields
        ? `The plan was missing or malformed: ${fields}`
        : "The plan didn't match what this tool needs",
      detail,
      retryable: false,
    };
  }

  if (text.includes("invalid to header") || text.includes("invalid email") || text.includes("recipient")) {
    return {
      kind: "permanent",
      code: "INVALID_RECIPIENT",
      message: "That email address isn't valid",
      detail,
      retryable: false,
      status,
    };
  }

  if (status === 404) {
    return {
      kind: "permanent",
      code: "NOT_FOUND",
      message: `${provider} couldn't find what the plan referred to`,
      detail,
      retryable: false,
      status,
    };
  }

  if (status !== undefined && status >= 400) {
    return {
      kind: "permanent",
      code: `HTTP_${status}`,
      message: `${provider} rejected the request`,
      detail,
      retryable: false,
      status,
    };
  }

  return {
    kind: "unknown",
    code: "UNKNOWN",
    message: messageOf(err) || `${provider} failed for an unknown reason`,
    detail,
    retryable: true,
  };
}

const TOOL_LABELS: Record<string, string> = {
  "sheets.search_sheet": "Search a sheet",
  "sheets.search_all_sheets": "Search all sheets",
  "sheets.get_last_row": "Read the last row",
  "sheets.get_row": "Read a row",
  "sheets.find_email": "Look up an email in Sheets",
  "sheets.create_spreadsheet": "Create a spreadsheet",
  "sheets.append_row": "Add a row",
  "gmail.send_email": "Send email",
  "gmail.search_email": "Search email",
  "gmail.reply_email": "Reply to email",
  "calendar.create_event": "Create calendar event",
  "calendar.list_events": "List calendar events",
  "calendar.find_free_slots": "Find free time",
  "meet.create_link": "Create a Meet link",
  "docs.create_document": "Create a doc",
  "docs.append_text": "Append to a doc",
  "docs.insert_template": "Fill a doc template",
  slack_send_message: "Send a Slack message",
  github_create_issue: "Create a GitHub issue",
  notion_create_page: "Create a Notion page",
  request_user_input: "Ask you for details",
};

/**
 * Short label for the overlay, enriched with the most identifying param so a
 * three-step plan reads as distinct lines rather than three tool names.
 */
export function describeStep(toolName: string, params?: Record<string, unknown>): string {
  const label = TOOL_LABELS[toolName] ?? toolName;
  if (!params) return label;

  const subject =
    params.to ?? params.recipient ?? params.email ?? params.title ?? params.summary ?? params.query ?? params.channel;

  if (typeof subject === "string" && subject.trim()) {
    const trimmed = subject.length > 42 ? `${subject.slice(0, 42)}…` : subject;
    return `${label} · ${trimmed}`;
  }
  return label;
}
