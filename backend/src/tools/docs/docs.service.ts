import { env } from "../../config/env.js";
import { getGoogleClients, isGoogleConfigured } from "../../config/google.js";

function docUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

function applyReplacements(template: string, replacements?: Record<string, string>): string {
  if (!replacements) return template;
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function templateBody(template: "meeting_notes" | "follow_up_email" | "project_brief"): string {
  if (template === "follow_up_email") {
    return [
      "Subject: Follow-up",
      "",
      "Hi {{recipient}},",
      "",
      "Thanks for your time today. Here is a quick summary:",
      "- {{point_1}}",
      "- {{point_2}}",
      "",
      "Next steps:",
      "- {{next_step}}",
      "",
      "Best,",
      "{{sender}}",
    ].join("\n");
  }

  if (template === "project_brief") {
    return [
      "# Project Brief",
      "",
      "Project: {{project_name}}",
      "Owner: {{owner}}",
      "",
      "Objective",
      "{{objective}}",
      "",
      "Scope",
      "- {{scope_1}}",
      "- {{scope_2}}",
      "",
      "Timeline",
      "- Start: {{start_date}}",
      "- End: {{end_date}}",
    ].join("\n");
  }

  return [
    "# Meeting Notes",
    "",
    "Date: {{date}}",
    "Attendees: {{attendees}}",
    "",
    "Agenda",
    "- {{agenda_1}}",
    "- {{agenda_2}}",
    "",
    "Decisions",
    "- {{decision_1}}",
    "",
    "Action Items",
    "- {{action_1}}",
  ].join("\n");
}

export async function createDocument(
  title: string,
  initialText?: string,
  clerkUserId?: string,
): Promise<{
  documentId: string;
  title: string;
  url?: string;
  status: "created" | "mock";
}> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    const documentId = `mock-doc-${Date.now()}`;
    return {
      documentId,
      title,
      url: docUrl(documentId),
      status: "mock",
    };
  }

  const { docs, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    throw new Error("No Google authorization found for document creation");
  }

  const createResp = await docs.documents.create({
    requestBody: { title },
  });

  const documentId = createResp.data.documentId ?? `doc-${Date.now()}`;
  if (initialText && documentId) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: initialText,
            },
          },
        ],
      },
    });
  }

  return {
    documentId,
    title: createResp.data.title ?? title,
    url: docUrl(documentId),
    status: "created",
  };
}

export async function appendText(
  documentId: string,
  text: string,
  clerkUserId?: string,
): Promise<{
  documentId: string;
  url?: string;
  status: "updated" | "mock";
}> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      documentId,
      url: docUrl(documentId),
      status: "mock",
    };
  }

  const { docs, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    throw new Error("No Google authorization found for document update");
  }

  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content ?? [];
  const endIndex = Math.max(
    1,
    ...content.map((item) => item.endIndex ?? 1),
  );

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
            text: `\n${text}`,
          },
        },
      ],
    },
  });

  return {
    documentId,
    url: docUrl(documentId),
    status: "updated",
  };
}

export async function insertTemplate(
  documentId: string,
  template: "meeting_notes" | "follow_up_email" | "project_brief",
  replacements: Record<string, string> | undefined,
  clerkUserId?: string,
): Promise<{
  documentId: string;
  url?: string;
  status: "updated" | "mock";
}> {
  const body = applyReplacements(templateBody(template), replacements);
  return appendText(documentId, body, clerkUserId);
}
