export type ToolName =
  | "sheets.search_sheet"
  | "sheets.get_last_row"
  | "sheets.get_row"
  | "sheets.find_email"
  | "gmail.send_email"
  | "gmail.search_email"
  | "gmail.reply_email"
  | "calendar.create_event"
  | "calendar.list_events"
  | "calendar.find_free_slots"
  | "meet.create_link";

export interface PlannedAction {
  tool: ToolName;
  params: Record<string, unknown>;
}

export interface ExecutionPlan {
  actions: PlannedAction[];
}

export interface ExecutionContext {
  previousResults: Record<string, unknown>;
  variables: Record<string, unknown>;
  executionState: {
    currentStep: number;
    totalSteps: number;
    lastResult: unknown;
    startedAt: string;
  };
}

export interface StepExecutionRecord {
  index: number;
  tool: ToolName;
  params: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface ExecutePlanResult {
  success: boolean;
  stepsExecuted: StepExecutionRecord[];
  results: Record<string, unknown>;
  plan: ExecutionPlan;
}

export interface AssistantRequestBody {
  transcript: string;
}

export interface AssistantResponseBody {
  success: boolean;
  stepsExecuted: StepExecutionRecord[];
  results: Record<string, unknown>;
  plan?: ExecutionPlan;
  message?: string;
}

export interface VoiceRequestEventData {
  transcript: string;
  requestId?: string;
  source?: "api" | "voice" | "local-stt";
}
