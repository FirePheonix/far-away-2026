/**
 * tool-errors.ts
 *
 * Turns whatever a tool threw into a decision the workflow can act on
 * plus a plain-English sentence shown verbatim in the desktop overlay.
 *
 * Design rules:
 *  - `message` must make sense to a non-technical user staring at the notch.
 *  - `message` must tell them exactly what to do next, not just what went wrong.
 *  - `kind` drives workflow behaviour: auth → reconnect button, transient → retry, permanent → skip/abandon.
 *  - Every Google API error code/string that can realistically appear is handled explicitly.
 */

export type ToolErrorKind =
  | "transient"   // temporary — retry automatically
  | "permanent"   // bad input / not found — retry won't help
  | "auth"        // credentials missing or revoked — user must reconnect
  | "needs_user_input" // assistant needs more info from the user
  | "not_connected"    // integration was never set up
  | "unknown";

export interface NormalizedToolError {
  kind: ToolErrorKind;
  code: string;
  /** Plain language, shown verbatim in the desktop overlay. */
  message: string;
  /** Raw payload, truncated. For the trace view and logs only. */
  detail?: string;
  retryable: boolean;
  status?: number;
}

const DETAIL_LIMIT = 800;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapCause(err: unknown): unknown {
  // ToolExecutionError wraps the provider error — look through it.
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

/** The friendly label a user would recognise, e.g. "Gmail", "Calendar". */
function providerOf(toolName: string): string {
  const segment = toolName.split(/[._]/)[0] ?? toolName;
  return (
    ({
      gmail: "Gmail",
      calendar: "Calendar",
      sheets: "Sheets",
      docs: "Google Docs",
      meet: "Google Meet",
      slack: "Slack",
      github: "GitHub",
      notion: "Notion",
      obsidian: "Obsidian",
      kb: "Knowledge Base",
      request: "user input request",
    } as Record<string, string>)[segment] ?? segment
  );
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

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeToolError(toolName: string, raw: unknown): NormalizedToolError {
  const err    = unwrapCause(raw);
  const status = readStatus(err);
  const detail = readDetail(err);
  const syscall = readSyscall(err);
  const msg    = messageOf(err);
  // Lower-case combined text for pattern matching — never shown to user.
  const text   = `${msg} ${detail ?? ""}`.toLowerCase();
  const p      = providerOf(toolName);

  // ── 0. Missing account pairing ──────────────────────────────────────────
  if (text.includes("missing user context") || text.includes("not paired")) {
    return {
      kind: "not_connected",
      code: "NOT_PAIRED",
      message: "This desktop isn't paired to an account. Use the tray → Pair account first.",
      detail,
      retryable: false,
    };
  }

  // ── 1. Integration not connected at all ─────────────────────────────────
  if (
    text.includes("is not connected") ||
    text.includes("must connect") ||
    text.includes("no google connection") ||
    text.includes("not connected") ||
    text.includes("connect your") ||
    text.includes("slack is not connected") ||
    text.includes("github is not connected") ||
    text.includes("notion is not connected")
  ) {
    return {
      kind: "not_connected",
      code: "NOT_CONNECTED",
      message: `${p} isn't connected. Open the dashboard and connect ${p} first.`,
      detail,
      retryable: false,
    };
  }

  // ── 2. Token completely missing (encrypted field null) ───────────────────
  if (
    text.includes("access token missing") ||
    text.includes("no access token") ||
    text.includes("token missing")
  ) {
    return {
      kind: "auth",
      code: "TOKEN_MISSING",
      message: `${p} token is missing. Reconnect ${p} in the dashboard.`,
      detail,
      retryable: false,
    };
  }

  // ── 3. Token revoked / expired ───────────────────────────────────────────
  if (
    text.includes("invalid_grant") ||
    text.includes("token has been expired or revoked") ||
    text.includes("token expired") ||
    text.includes("no refresh token") ||
    text.includes("refresh token") ||
    (status === 401 && text.includes("invalid"))
  ) {
    return {
      kind: "auth",
      code: "TOKEN_REVOKED",
      message: `${p} access was revoked. Reconnect ${p} in the dashboard to continue.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 4. Generic 401 ───────────────────────────────────────────────────────
  if (status === 401) {
    return {
      kind: "auth",
      code: "UNAUTHORIZED",
      message: `${p} rejected the saved credentials. Reconnect ${p} in the dashboard.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 5. Insufficient scope ────────────────────────────────────────────────
  if (
    text.includes("access_token_scope_insufficient") ||
    text.includes("insufficient permission") ||
    text.includes("insufficient authentication scope") ||
    text.includes("scope") && text.includes("not granted") ||
    text.includes("requires") && text.includes("scope")
  ) {
    return {
      kind: "auth",
      code: "SCOPE_INSUFFICIENT",
      message: `${p} is missing a required permission. Reconnect ${p} in the dashboard to grant it.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 6. 403 — quota, forbidden, scope-missing, or calendar-specific ───────
  if (status === 403) {
    const isQuota =
      text.includes("rate limit") ||
      text.includes("userratelimit") ||
      text.includes("daily limit") ||
      text.includes("quota exceeded") ||
      text.includes("rateLimitExceeded") ||
      text.includes("userRateLimitExceeded");

    if (isQuota) {
      return {
        kind: "transient",
        code: "QUOTA_EXCEEDED",
        message: `${p} hit its rate limit. It'll retry automatically in a moment.`,
        detail,
        retryable: true,
        status,
      };
    }

    // Google Calendar: calendar not found in user's account
    if (text.includes("calendarnotfound") || text.includes("calendar not found")) {
      return {
        kind: "permanent",
        code: "CALENDAR_NOT_FOUND",
        message: "That calendar doesn't exist in your Google account. Check the calendar ID.",
        detail,
        retryable: false,
        status,
      };
    }

    // Calendar: service account without domain-wide delegation
    if (
      text.includes("domain-wide delegation") ||
      text.includes("does not have") && text.includes("calendar")
    ) {
      return {
        kind: "auth",
        code: "SERVICE_ACCOUNT_NO_DWD",
        message:
          "Calendar access is blocked — service accounts need domain-wide delegation for personal calendars. Use OAuth user login instead.",
        detail,
        retryable: false,
        status,
      };
    }

    // Sheets/Drive: file not shared with service account
    if (
      text.includes("does not have") && text.includes("drive") ||
      text.includes("the caller does not have permission") ||
      text.includes("file not found") && status === 403
    ) {
      return {
        kind: "auth",
        code: "FILE_NOT_SHARED",
        message: `${p}: the file isn't shared with this account. Share it or reconnect via OAuth.`,
        detail,
        retryable: false,
        status,
      };
    }

    // Slack: missing_scope
    if (text.includes("missing_scope") || text.includes("not_in_channel")) {
      return {
        kind: "auth",
        code: "SLACK_SCOPE_MISSING",
        message: `Slack is missing a permission. Reconnect Slack in the dashboard and grant the required scopes.`,
        detail,
        retryable: false,
        status,
      };
    }

    // GitHub: repo not found or no push access
    if (text.includes("not found") && text.includes("github") || text.includes("403") && text.includes("github")) {
      return {
        kind: "auth",
        code: "GITHUB_FORBIDDEN",
        message: "GitHub: repository not found or you don't have access. Check the repo name and reconnect GitHub.",
        detail,
        retryable: false,
        status,
      };
    }

    // Generic 403
    return {
      kind: "auth",
      code: "FORBIDDEN",
      message: `${p} refused this action — reconnect ${p} in the dashboard to refresh permissions.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 7. 429 rate limit ────────────────────────────────────────────────────
  if (status === 429) {
    return {
      kind: "transient",
      code: "RATE_LIMITED",
      message: `${p} is busy right now. Retrying automatically.`,
      detail,
      retryable: true,
      status,
    };
  }

  // ── 8. 5xx server errors ─────────────────────────────────────────────────
  if (status !== undefined && status >= 500) {
    const specificMessages: Record<number, string> = {
      500: `${p} had an internal error. Retrying.`,
      502: `${p} returned a bad gateway. Retrying.`,
      503: `${p} is temporarily unavailable. Retrying.`,
      504: `${p} timed out on their end. Retrying.`,
    };
    return {
      kind: "transient",
      code: `HTTP_${status}`,
      message: specificMessages[status] ?? `${p} is having issues (${status}). Retrying.`,
      detail,
      retryable: true,
      status,
    };
  }

  // ── 9. Network / timeout ─────────────────────────────────────────────────
  if (status === 408 || (syscall && TRANSIENT_SYSCALLS.has(syscall))) {
    return {
      kind: "transient",
      code: syscall ?? "TIMEOUT",
      message: `Can't reach ${p} right now — check your internet connection. Retrying.`,
      detail,
      retryable: true,
      status,
    };
  }

  if (
    text.includes("socket hang up") ||
    text.includes("network error") ||
    text.includes("failed to fetch") ||
    text.includes("network timeout") ||
    text.includes("timeout")
  ) {
    return {
      kind: "transient",
      code: "NETWORK",
      message: `Lost connection to ${p}. Retrying.`,
      detail,
      retryable: true,
    };
  }

  // ── 10. 404 not found ────────────────────────────────────────────────────
  if (status === 404) {
    // Distinguish common 404 cases
    if (text.includes("spreadsheet") || text.includes("sheet")) {
      return {
        kind: "permanent",
        code: "SHEET_NOT_FOUND",
        message: "That spreadsheet or sheet tab doesn't exist. Check the name or ID.",
        detail,
        retryable: false,
        status,
      };
    }
    if (text.includes("document") || text.includes("doc")) {
      return {
        kind: "permanent",
        code: "DOC_NOT_FOUND",
        message: "That Google Doc wasn't found. Check the document ID.",
        detail,
        retryable: false,
        status,
      };
    }
    if (text.includes("calendar")) {
      return {
        kind: "permanent",
        code: "CALENDAR_NOT_FOUND",
        message: "That calendar wasn't found in your Google account.",
        detail,
        retryable: false,
        status,
      };
    }
    if (text.includes("message") || text.includes("thread")) {
      return {
        kind: "permanent",
        code: "EMAIL_NOT_FOUND",
        message: "That email or thread wasn't found in your Gmail.",
        detail,
        retryable: false,
        status,
      };
    }
    return {
      kind: "permanent",
      code: "NOT_FOUND",
      message: `${p} couldn't find what the plan referred to. It may have been deleted or renamed.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 11. Zod / param validation ───────────────────────────────────────────
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
        ? `The plan is missing required information: ${fields}. Try rephrasing your request.`
        : "The assistant generated a plan that's missing required details. Try rephrasing.",
      detail,
      retryable: false,
    };
  }

  // ── 12. Bad email address ────────────────────────────────────────────────
  if (
    text.includes("invalid to header") ||
    text.includes("invalid email") ||
    text.includes("invalid recipient") ||
    text.includes("recipient") ||
    text.includes("bad email")
  ) {
    return {
      kind: "permanent",
      code: "INVALID_RECIPIENT",
      message: "That email address isn't valid. Double-check the address and try again.",
      detail,
      retryable: false,
      status,
    };
  }

  // ── 13. Gmail send specific ──────────────────────────────────────────────
  if (text.includes("requires 'to' address")) {
    return {
      kind: "needs_user_input",
      code: "MISSING_EMAIL_ADDRESS",
      message: "The email address is missing. Who should this be sent to?",
      detail,
      retryable: false,
    };
  }

  // ── 14. Sheets: empty sheet ──────────────────────────────────────────────
  if (text.includes("is empty") && (text.includes("sheet") || text.includes("spreadsheet"))) {
    return {
      kind: "permanent",
      code: "SHEET_EMPTY",
      message: "That sheet has no data in it yet.",
      detail,
      retryable: false,
    };
  }

  // ── 15. Sheets: missing spreadsheet ID ───────────────────────────────────
  if (text.includes("spreadsheet id is missing") || text.includes("google_sheets_spreadsheet_id")) {
    return {
      kind: "permanent",
      code: "MISSING_SPREADSHEET_ID",
      message:
        "No spreadsheet is linked. Set GOOGLE_SHEETS_SPREADSHEET_ID in your env, or include the spreadsheetId in the request.",
      detail,
      retryable: false,
    };
  }

  // ── 16. Docs: no Google auth ─────────────────────────────────────────────
  if (text.includes("no google authorization")) {
    return {
      kind: "not_connected",
      code: "NOT_CONNECTED",
      message: "Google isn't connected. Open the dashboard and connect Google to use Docs/Sheets/Gmail.",
      detail,
      retryable: false,
    };
  }

  // ── 17. Slack API errors ─────────────────────────────────────────────────
  if (text.includes("slack api error") || text.includes("channel_not_found")) {
    const slackCode = msg.match(/slack api error: (\S+)/i)?.[1] ?? "";
    const slackMessages: Record<string, string> = {
      channel_not_found: "That Slack channel doesn't exist. Check the channel name.",
      not_in_channel: "The bot isn't in that Slack channel. Invite it first.",
      invalid_auth: "Slack token is invalid. Reconnect Slack in the dashboard.",
      account_inactive: "That Slack account is deactivated.",
      is_archived: "That Slack channel is archived.",
      msg_too_long: "The message is too long for Slack.",
      no_text: "The message can't be empty.",
      ratelimited: "Slack is rate-limiting. Retrying.",
    };
    const friendly = slackMessages[slackCode.toLowerCase()] ?? `Slack error: ${slackCode || "unknown"}.`;
    const isTransient = slackCode.toLowerCase() === "ratelimited";
    return {
      kind: isTransient ? "transient" : "permanent",
      code: slackCode ? `SLACK_${slackCode.toUpperCase()}` : "SLACK_ERROR",
      message: friendly,
      detail,
      retryable: isTransient,
    };
  }

  // ── 18. Notion errors ────────────────────────────────────────────────────
  if (text.includes("notion") || toolName.startsWith("notion")) {
    if (text.includes("unauthorized")) {
      return {
        kind: "auth",
        code: "NOTION_UNAUTHORIZED",
        message: "Notion access was revoked. Reconnect Notion in the dashboard.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("object not found") || text.includes("could not find")) {
      return {
        kind: "permanent",
        code: "NOTION_NOT_FOUND",
        message: "That Notion page or database wasn't found. Check the ID.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("validation_error")) {
      return {
        kind: "permanent",
        code: "NOTION_VALIDATION",
        message: "Notion rejected the request — the page data is invalid. Check the content.",
        detail,
        retryable: false,
      };
    }
  }

  // ── 19. GitHub errors ────────────────────────────────────────────────────
  if (toolName.startsWith("github")) {
    if (text.includes("bad credentials")) {
      return {
        kind: "auth",
        code: "GITHUB_BAD_CREDENTIALS",
        message: "GitHub token is invalid. Reconnect GitHub in the dashboard.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("repository not found") || text.includes("not found")) {
      return {
        kind: "permanent",
        code: "GITHUB_NOT_FOUND",
        message: "That GitHub repository wasn't found. Check the owner and repo name.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("validation failed")) {
      return {
        kind: "permanent",
        code: "GITHUB_VALIDATION",
        message: "GitHub rejected the request — check the issue title or body.",
        detail,
        retryable: false,
      };
    }
  }

  // ── 20. Obsidian: desktop app not running ────────────────────────────────
  if (toolName.startsWith("obsidian")) {
    if (
      text.includes("desktop app") ||
      text.includes("not running") ||
      text.includes("no pending") ||
      syscall === "ECONNREFUSED"
    ) {
      return {
        kind: "permanent",
        code: "OBSIDIAN_NOT_RUNNING",
        message: "The Obsidian desktop app isn't running. Start it and try again.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("vault") && text.includes("not found")) {
      return {
        kind: "permanent",
        code: "OBSIDIAN_VAULT_NOT_FOUND",
        message: "That Obsidian vault wasn't found on this machine. Check the vault name.",
        detail,
        retryable: false,
      };
    }
    if (text.includes("note") && text.includes("not found")) {
      return {
        kind: "permanent",
        code: "OBSIDIAN_NOTE_NOT_FOUND",
        message: "That note wasn't found in the vault. Try obsidian.search_notes first.",
        detail,
        retryable: false,
      };
    }
  }

  // ── 21. pending_tasks DB error ───────────────────────────────────────────
  if (toolName === "request_user_input") {
    if (text.includes("failed to create pending task")) {
      return {
        kind: "transient",
        code: "PENDING_TASK_DB_ERROR",
        message: "Couldn't save the question to the database. Retrying.",
        detail,
        retryable: true,
      };
    }
  }

  // ── 22. Generic 4xx ─────────────────────────────────────────────────────
  if (status !== undefined && status >= 400) {
    return {
      kind: "permanent",
      code: `HTTP_${status}`,
      message: `${p} rejected the request (${status}). This step can't proceed as planned.`,
      detail,
      retryable: false,
      status,
    };
  }

  // ── 23. Catch-all ────────────────────────────────────────────────────────
  // Surface the raw message if it's short and readable; otherwise use generic text.
  const rawMsg = msg.trim();
  const displayMsg =
    rawMsg && rawMsg.length < 200 && !rawMsg.toLowerCase().includes("stack")
      ? rawMsg
      : `${p} failed for an unknown reason.`;

  return {
    kind: "unknown",
    code: "UNKNOWN",
    message: displayMsg,
    detail,
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// Step labels (shown in the overlay flow view)
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  "sheets.search_sheet":       "Search a sheet",
  "sheets.search_all_sheets":  "Search all sheets",
  "sheets.get_last_row":       "Read the last row",
  "sheets.get_row":            "Read a row",
  "sheets.find_email":         "Find an email in Sheets",
  "sheets.create_spreadsheet": "Create a spreadsheet",
  "sheets.append_row":         "Add a row to sheet",
  "gmail.send_email":          "Send email",
  "gmail.search_email":        "Search emails",
  "gmail.reply_email":         "Reply to email",
  "calendar.create_event":     "Create calendar event",
  "calendar.list_events":      "List calendar events",
  "calendar.find_free_slots":  "Find free time",
  "meet.create_link":          "Create a Meet link",
  "docs.create_document":      "Create a doc",
  "docs.append_text":          "Write to doc",
  "docs.insert_template":      "Insert doc template",
  "slack_send_message":        "Send Slack message",
  "github_create_issue":       "Create GitHub issue",
  "notion_create_page":        "Create Notion page",
  "obsidian.search_notes":     "Search Obsidian notes",
  "obsidian.append_to_note":   "Write to Obsidian note",
  "obsidian.write_daily_note": "Write daily note",
  "request_user_input":        "Ask you for details",
  "kb_update":                 "Remember for next time",
};

/**
 * Short label for the overlay flow view, enriched with the most identifying
 * param so three steps read as distinct lines rather than three tool names.
 */
export function describeStep(toolName: string, params?: Record<string, unknown>): string {
  const label = TOOL_LABELS[toolName] ?? toolName;
  if (!params) return label;

  const subject =
    params.to ??
    params.recipient ??
    params.email ??
    params.title ??
    params.summary ??
    params.query ??
    params.channel ??
    params.subject ??
    params.sheetName ??
    params.notePath ??
    params.documentId;

  if (typeof subject === "string" && subject.trim()) {
    const trimmed = subject.length > 42 ? `${subject.slice(0, 42)}…` : subject;
    return `${label} · ${trimmed}`;
  }
  return label;
}
