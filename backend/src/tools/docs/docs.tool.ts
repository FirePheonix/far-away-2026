import { z } from "zod";
import {
  docsAppendTextParamsSchema,
  docsCreateDocumentParamsSchema,
  docsInsertTemplateParamsSchema,
  docsOperationResultSchema,
} from "../../ai/schemas.js";
import type { ToolDefinition } from "../types.js";
import * as docsService from "./docs.service.js";

type CreateDocumentParams = z.output<typeof docsCreateDocumentParamsSchema>;
type AppendTextParams = z.output<typeof docsAppendTextParamsSchema>;
type InsertTemplateParams = z.output<typeof docsInsertTemplateParamsSchema>;

export type DocsOperationResult = z.output<typeof docsOperationResultSchema>;

export const docsCreateDocument: ToolDefinition<CreateDocumentParams, DocsOperationResult> = {
  name: "docs.create_document",
  description: "Create a new Google Doc document",
  paramsSchema: docsCreateDocumentParamsSchema,
  resultSchema: docsOperationResultSchema,
  execute: async (params, context) =>
    docsService.createDocument(params.title, params.initialText, context.user?.clerkUserId),
};

export const docsAppendText: ToolDefinition<AppendTextParams, DocsOperationResult> = {
  name: "docs.append_text",
  description: "Append text to an existing Google Doc",
  paramsSchema: docsAppendTextParamsSchema,
  resultSchema: docsOperationResultSchema,
  execute: async (params, context) =>
    docsService.appendText(params.documentId, params.text, context.user?.clerkUserId),
};

export const docsInsertTemplate: ToolDefinition<InsertTemplateParams, DocsOperationResult> = {
  name: "docs.insert_template",
  description: "Insert a predefined template into an existing Google Doc",
  paramsSchema: docsInsertTemplateParamsSchema,
  resultSchema: docsOperationResultSchema,
  execute: async (params, context) =>
    docsService.insertTemplate(
      params.documentId,
      params.template,
      params.replacements,
      context.user?.clerkUserId,
    ),
};

export const docsTools = [docsCreateDocument, docsAppendText, docsInsertTemplate] as const;
