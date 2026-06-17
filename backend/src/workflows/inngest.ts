import { Inngest } from "inngest";
import { env } from "../config/env.js";

export const inngest = new Inngest({
  id: env.INNGEST_APP_ID,
  eventKey: env.INNGEST_EVENT_KEY,
});

export const ASSISTANT_EVENTS = {
  voiceRequestReceived: "assistant/voice_request_received",
  userInputReceived: "assistant/user_input_received",
} as const;
