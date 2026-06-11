import { env } from "../../config/env.js";
import type { MeetLinkResult } from "./meet.tool.js";

export async function createMeetLink(eventTitle?: string): Promise<MeetLinkResult> {
  if (env.GOOGLE_MOCK_MODE) {
    const slug = (eventTitle ?? "meeting").toLowerCase().replace(/\s+/g, "-").slice(0, 20);
    return {
      meetLink: `https://meet.google.com/mock-${slug}-${Date.now().toString(36)}`,
      status: "mock",
    };
  }

  // Real Meet links are created via Calendar conferenceData (see calendar.service).
  // This tool returns a placeholder when called standalone.
  return {
    meetLink: `https://meet.google.com/new`,
    status: "created",
  };
}
