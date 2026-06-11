import type { z } from "zod";
import type { ExecutionContext, ToolName } from "../types/index.js";

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  name: ToolName;
  description: string;
  paramsSchema: z.ZodType<TParams, z.ZodTypeDef, unknown>;
  resultSchema: z.ZodType<TResult, z.ZodTypeDef, unknown>;
  execute: (params: TParams, context: ExecutionContext) => Promise<TResult>;
}

export interface ToolMetadata {
  name: ToolName;
  description: string;
  paramsSchema: z.ZodType<unknown>;
  resultSchema: z.ZodType<unknown>;
}

export type AnyToolDefinition = ToolDefinition<any, any>;
