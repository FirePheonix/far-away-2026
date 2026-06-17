import { env } from "../../config/env.js";
import { getGoogleClients, isGoogleConfigured } from "../../config/google.js";
import type { CalendarEventResult, FreeSlotResult } from "./calendar.tool.js";

function calendarId(override?: string): string {
  return override ?? env.GOOGLE_CALENDAR_ID;
}

export async function createEvent(params: {
  title: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
  timeZone?: string;
  calendarId?: string;
  meetLink?: string;
  clerkUserId?: string;
}): Promise<CalendarEventResult> {
  if (env.GOOGLE_MOCK_MODE || (!params.clerkUserId && !isGoogleConfigured())) {
    return {
      eventId: `mock-event-${Date.now()}`,
      title: params.title,
      start: params.start,
      end: params.end,
      htmlLink: "https://calendar.google.com/mock",
      meetLink: params.meetLink ?? "https://meet.google.com/mock-link",
      status: "mock",
    };
  }

  const { calendar, auth } = await getGoogleClients(params.clerkUserId);
  if (!auth) {
    return {
      eventId: `mock-event-${Date.now()}`,
      title: params.title,
      start: params.start,
      end: params.end,
      htmlLink: "https://calendar.google.com/mock",
      meetLink: params.meetLink ?? "https://meet.google.com/mock-link",
      status: "mock",
    };
  }

  const tz = params.timeZone ?? "UTC";
  const shouldCreateMeet = !params.meetLink;

  const requestBody = {
    summary: params.title,
    description: params.description,
    start: { dateTime: params.start, timeZone: tz },
    end: { dateTime: params.end, timeZone: tz },
    attendees: params.attendees?.map((email) => ({ email })),
    location: params.meetLink,
    conferenceData: shouldCreateMeet
      ? {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        }
      : undefined,
  };

  let response;
  try {
    response = await calendar.events.insert({
      calendarId: calendarId(params.calendarId),
      conferenceDataVersion: shouldCreateMeet ? 1 : 0,
      requestBody,
    });
  } catch (err: any) {
    const errMsg = err.response?.data?.error?.message || err.message || "";
    if (errMsg.includes("Domain-Wide Delegation")) {
      // Retry without attendees since this service account can't invite people
      delete requestBody.attendees;
      response = await calendar.events.insert({
        calendarId: calendarId(params.calendarId),
        conferenceDataVersion: shouldCreateMeet ? 1 : 0,
        requestBody,
      });
    } else {
      throw err;
    }
  }

  const meetLink =
    params.meetLink ??
    response.data.hangoutLink ??
    response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
      ?.uri ??
    undefined;

  return {
    eventId: response.data.id ?? "unknown",
    title: params.title,
    start: params.start,
    end: params.end,
    htmlLink: response.data.htmlLink ?? undefined,
    meetLink,
    status: "created",
  };
}

export async function listEvents(params: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  clerkUserId?: string;
}): Promise<{ events: CalendarEventResult[] }> {
  if (env.GOOGLE_MOCK_MODE || (!params.clerkUserId && !isGoogleConfigured())) {
    return {
      events: [
        {
          eventId: "mock-1",
          title: "Team Standup",
          start: new Date().toISOString(),
          end: new Date(Date.now() + 3600000).toISOString(),
          status: "mock",
        },
      ],
    };
  }

  const { calendar, auth } = await getGoogleClients(params.clerkUserId);
  if (!auth) {
    return { events: [] };
  }

  const response = await calendar.events.list({
    calendarId: calendarId(params.calendarId),
    timeMin: params.timeMin ?? new Date().toISOString(),
    timeMax: params.timeMax,
    maxResults: params.maxResults ?? 25,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (response.data.items ?? []).map((item) => ({
    eventId: item.id ?? "unknown",
    title: item.summary ?? "Untitled",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    htmlLink: item.htmlLink ?? undefined,
    meetLink: item.hangoutLink ?? undefined,
    status: "created" as const,
  }));

  return { events };
}

export async function findFreeSlots(params: {
  calendarId?: string;
  durationMinutes?: number;
  timeMin?: string;
  timeMax?: string;
  workingHoursStart?: number;
  workingHoursEnd?: number;
  clerkUserId?: string;
}): Promise<FreeSlotResult> {
  const durationMs = (params.durationMinutes ?? 30) * 60_000;
  const timeMin = new Date(params.timeMin ?? Date.now());
  const timeMax = new Date(params.timeMax ?? Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { events } = await listEvents({
    calendarId: params.calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    clerkUserId: params.clerkUserId,
  });

  const busy = events
    .map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  const slots: FreeSlotResult["slots"] = [];
  let cursor = new Date(timeMin);
  cursor.setHours(params.workingHoursStart ?? 9, 0, 0, 0);

  while (cursor.getTime() + durationMs <= timeMax.getTime() && slots.length < 10) {
    const hour = cursor.getHours();
    if (hour >= (params.workingHoursEnd ?? 17)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(params.workingHoursStart ?? 9, 0, 0, 0);
      continue;
    }

    const slotStart = cursor.getTime();
    const slotEnd = slotStart + durationMs;
    const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);

    if (!overlaps) {
      slots.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
      });
    }

    cursor = new Date(slotStart + 30 * 60_000);
  }

  return { slots };
}
