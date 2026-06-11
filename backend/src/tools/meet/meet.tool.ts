import { z } from "zod";
import { meetCreateLinkParamsSchema, meetLinkResultSchema } from "../../ai/schemas.js";
import type { ToolDefinition } from "../types.js";
import * as meetService from "./meet.service.js";

export type MeetLinkResult = {
  meetLink: string;
  status: "created" | "mock";
};

type CreateLinkParams = z.output<typeof meetCreateLinkParamsSchema>;

export const meetCreateLink: ToolDefinition<CreateLinkParams, MeetLinkResult> = {
  name: "meet.create_link",
  description: "Create a Google Meet link",
  paramsSchema: meetCreateLinkParamsSchema,
  resultSchema: meetLinkResultSchema,
  execute: async (params) => meetService.createMeetLink(params.eventTitle),
};

export const meetTools = [meetCreateLink] as const;
