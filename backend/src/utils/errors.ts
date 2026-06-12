export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class ToolNotFoundError extends AppError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 400, "TOOL_NOT_FOUND", { toolName });
    this.name = "ToolNotFoundError";
  }
}

export class ToolExecutionError extends AppError {
  constructor(toolName: string, cause: unknown) {
    super(
      `Tool execution failed: ${toolName}`,
      500,
      "TOOL_EXECUTION_ERROR",
      cause instanceof Error 
        ? ((cause as any).response?.data ? JSON.stringify((cause as any).response.data) : cause.message)
        : cause,
    );
    this.name = "ToolExecutionError";
  }
}

export class PlannerError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, "PLANNER_ERROR", details);
    this.name = "PlannerError";
  }
}
