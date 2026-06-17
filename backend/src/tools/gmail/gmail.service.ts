import { env } from "../../config/env.js";
import { getGoogleClients, isGoogleConfigured } from "../../config/google.js";
import type { EmailResult, EmailSearchResult } from "./gmail.tool.js";

function senderEmail(): string {
  return env.GMAIL_SENDER_EMAIL ?? env.GOOGLE_CLIENT_EMAIL ?? "me";
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const lines = [
    `From: ${senderEmail()}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  clerkUserId?: string,
): Promise<EmailResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      messageId: `mock-${Date.now()}`,
      to,
      subject,
      status: "mock",
    };
  }

  const { gmail, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    return {
      messageId: `mock-${Date.now()}`,
      to,
      subject,
      status: "mock",
    };
  }

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildRawEmail(to, subject, body),
    },
  });

  return {
    messageId: response.data.id ?? "unknown",
    threadId: response.data.threadId ?? undefined,
    to,
    subject,
    status: "sent",
  };
}

export async function searchEmail(
  query: string,
  maxResults = 10,
  clerkUserId?: string,
): Promise<EmailSearchResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      messages: [
        {
          id: "mock-msg-1",
          threadId: "mock-thread-1",
          subject: "Hackathon Results",
          from: "organizer@example.com",
          snippet: `Mock result for query: ${query}`,
        },
      ],
    };
  }

  const { gmail, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    return { messages: [] };
  }

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = await Promise.all(
    (list.data.messages ?? []).map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });

      const headers = detail.data.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const from = headers.find((h) => h.name === "From")?.value ?? "";

      return {
        id: msg.id!,
        threadId: msg.threadId ?? undefined,
        subject,
        from,
        snippet: detail.data.snippet ?? "",
      };
    }),
  );

  return { messages };
}

export async function replyEmail(
  messageId: string,
  body: string,
  threadId?: string,
  clerkUserId?: string,
): Promise<EmailResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      messageId: `mock-reply-${Date.now()}`,
      threadId: threadId ?? "mock-thread",
      to: "recipient@example.com",
      subject: "Re: (mock)",
      status: "mock",
    };
  }

  const { gmail, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    return {
      messageId: `mock-reply-${Date.now()}`,
      threadId: threadId ?? "mock-thread",
      to: "recipient@example.com",
      subject: "Re: (mock)",
      status: "mock",
    };
  }

  const original = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "Message-ID"],
  });

  const headers = original.data.payload?.headers ?? [];
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
  const from = headers.find((h) => h.name === "From")?.value ?? "";
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: threadId ?? original.data.threadId ?? undefined,
      raw: buildRawEmail(from, replySubject, body),
    },
  });

  return {
    messageId: response.data.id ?? "unknown",
    threadId: response.data.threadId ?? undefined,
    to: from,
    subject: replySubject,
    status: "sent",
  };
}
