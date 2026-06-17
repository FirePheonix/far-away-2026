import { z } from "zod";
import {
  calendarCreateEventParamsSchema,
  calendarEventResultSchema,
  calendarFindFreeSlotsParamsSchema,
  calendarListEventsParamsSchema,
  freeSlotResultSchema,
} from "../../ai/schemas.js";
import type { ExecutionContext } from "../../types/index.js";
import type { ToolDefinition } from "../types.js";
import * as calendarService from "./calendar.service.js";

export type CalendarEventResult = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  htmlLink?: string;
  meetLink?: string;
  status: "created" | "mock";
};

export type FreeSlotResult = {
  slots: Array<{ start: string; end: string }>;
};

type CreateParams = z.output<typeof calendarCreateEventParamsSchema>;
type ListParams = z.output<typeof calendarListEventsParamsSchema>;
type FreeSlotParams = z.output<typeof calendarFindFreeSlotsParamsSchema>;

function resolveMeetLink(params: CreateParams, context: ExecutionContext): string | undefined {
  if (typeof params.meetLink === "string") return params.meetLink;
  if (params.meetLinkFromPreviousStep === true) {
    const last = context.executionState.lastResult as { meetLink?: string } | null;
    return last?.meetLink;
  }
  return undefined;
}

function resolveAttendees(params: CreateParams, context: ExecutionContext): string[] | undefined {
  if (Array.isArray(params.attendees)) return params.attendees;
  if (params.emailFromPreviousStep === true) {
    const last = context.executionState.lastResult as { email?: string } | null;
    return last?.email ? [last.email] : undefined;
  }
  return undefined;
}

export const calendarCreateEvent: ToolDefinition<CreateParams, CalendarEventResult> = {
  name: "calendar.create_event",
  description: "Create a Google Calendar event",
  paramsSchema: calendarCreateEventParamsSchema,
  resultSchema: calendarEventResultSchema,
  execute: async (params, context) =>
    calendarService.createEvent({
      title: params.title,
      description: params.description,
      start: params.start,
      end: params.end,
      attendees: resolveAttendees(params, context),
      timeZone: params.timeZone,
      calendarId: params.calendarId,
      meetLink: resolveMeetLink(params, context),
      clerkUserId: context.user?.clerkUserId,
    }),
};

export const calendarListEvents: ToolDefinition<ListParams, CalendarEventResult[]> = {
  name: "calendar.list_events",
  description: "List calendar events in a time range",
  paramsSchema: calendarListEventsParamsSchema,
  resultSchema: calendarEventResultSchema.array(),
  execute: async (params, context) => {
    const { events } = await calendarService.listEvents({
      ...params,
      clerkUserId: context.user?.clerkUserId,
    });
    return events;
  },
};

export const calendarFindFreeSlots: ToolDefinition<FreeSlotParams, FreeSlotResult> = {
  name: "calendar.find_free_slots",
  description: "Find available time slots on the calendar",
  paramsSchema: calendarFindFreeSlotsParamsSchema,
  resultSchema: freeSlotResultSchema,
  execute: async (params, context) =>
    calendarService.findFreeSlots({ ...params, clerkUserId: context.user?.clerkUserId }),
};

export const calendarTools = [
  calendarCreateEvent,
  calendarListEvents,
  calendarFindFreeSlots,
] as const;
