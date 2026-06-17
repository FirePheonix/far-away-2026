import { z } from "zod";
import {
  emailResultSchema,
  emailSearchResultSchema,
  gmailReplyEmailParamsSchema,
  gmailSearchEmailParamsSchema,
  gmailSendEmailParamsSchema,
} from "../../ai/schemas.js";
import type { ToolDefinition } from "../types.js";
import * as gmailService from "./gmail.service.js";

export type EmailResult = {
  messageId: string;
  threadId?: string;
  to: string;
  subject: string;
  status: "sent" | "draft" | "mock";
};

export type EmailSearchResult = {
  messages: Array<{
    id: string;
    threadId?: string;
    subject: string;
    from: string;
    snippet: string;
  }>;
};

type SendParams = z.output<typeof gmailSendEmailParamsSchema>;
type SearchParams = z.output<typeof gmailSearchEmailParamsSchema>;
type ReplyParams = z.output<typeof gmailReplyEmailParamsSchema>;

export const gmailSendEmail: ToolDefinition<SendParams, EmailResult> = {
  name: "gmail.send_email",
  description: "Send an email via Gmail",
  paramsSchema: gmailSendEmailParamsSchema,
  resultSchema: emailResultSchema,
  execute: async (params, context) => {
    if (!params.to) {
      throw new Error("gmail.send_email requires 'to' address (or emailFromPreviousStep)");
    }
    return gmailService.sendEmail(
      params.to,
      params.subject,
      params.body,
      context.user?.clerkUserId,
    );
  },
};

export const gmailSearchEmail: ToolDefinition<SearchParams, EmailSearchResult> = {
  name: "gmail.search_email",
  description: "Search Gmail messages",
  paramsSchema: gmailSearchEmailParamsSchema,
  resultSchema: emailSearchResultSchema,
  execute: async (params, context) =>
    gmailService.searchEmail(params.query, params.maxResults, context.user?.clerkUserId),
};

export const gmailReplyEmail: ToolDefinition<ReplyParams, EmailResult> = {
  name: "gmail.reply_email",
  description: "Reply to an existing Gmail message",
  paramsSchema: gmailReplyEmailParamsSchema,
  resultSchema: emailResultSchema,
  execute: async (params, context) =>
    gmailService.replyEmail(
      params.messageId,
      params.body,
      params.threadId,
      context.user?.clerkUserId,
    ),
};

export const gmailTools = [gmailSendEmail, gmailSearchEmail, gmailReplyEmail] as const;
