import { z } from "zod";
import { db } from "../config/db.js";
import { decryptSecret } from "../utils/crypto.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";

export const slackTool: AnyToolDefinition = {
  name: "slack_send_message",
  description: "Send a message to a Slack channel or user.",
  paramsSchema: z.object({
    channel: z.string().describe("The channel ID or name, or user ID to send the message to."),
    text: z.string().describe("The text of the message to send.")
  }),
  resultSchema: z.object({
    message: z.string(),
    ts: z.string().optional(),
    channel: z.string().optional(),
  }),
  execute: async (params: { channel: string; text: string }, context: ExecutionContext) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const conn = db.prepare(`
      SELECT id FROM oauth_connections 
      WHERE clerk_user_id = ? AND provider = 'slack'
    `).get(context.user.clerkUserId) as any;

    if (!conn) {
      throw new Error("Slack is not connected. User must connect Slack first.");
    }

    const tokenRow = db.prepare(`
      SELECT access_token_enc FROM oauth_tokens 
      WHERE connection_id = ?
    `).get(conn.id) as any;

    if (!tokenRow?.access_token_enc) {
      throw new Error("Slack access token missing.");
    }

    const accessToken = decryptSecret(tokenRow.access_token_enc);

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        channel: params.channel,
        text: params.text
      })
    });

    const data = await resp.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      message: "Message sent successfully",
      ts: data.ts,
      channel: data.channel
    };
  },
};
