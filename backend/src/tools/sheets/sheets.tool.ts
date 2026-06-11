import { z } from "zod";
import {
  sheetRowResultSchema,
  sheetsFindEmailParamsSchema,
  sheetsGetLastRowParamsSchema,
  sheetsGetRowParamsSchema,
  sheetsSearchParamsSchema,
} from "../../ai/schemas.js";
import type { ToolDefinition } from "../types.js";
import * as sheetsService from "./sheets.service.js";
import type { SheetRowResult } from "./sheets.service.js";

export type { SheetRowResult };

type SearchParams = z.output<typeof sheetsSearchParamsSchema>;
type GetLastRowParams = z.output<typeof sheetsGetLastRowParamsSchema>;
type GetRowParams = z.output<typeof sheetsGetRowParamsSchema>;
type FindEmailParams = z.output<typeof sheetsFindEmailParamsSchema>;
type FindEmailResult = { email: string; sheetName: string; rowNumber: number };

export const sheetsSearchSheet: ToolDefinition<SearchParams, SheetRowResult[]> = {
  name: "sheets.search_sheet",
  description: "Search rows in a Google Sheet by text query",
  paramsSchema: sheetsSearchParamsSchema,
  resultSchema: sheetRowResultSchema.array(),
  execute: async (params) =>
    sheetsService.searchSheet(params.sheetName, params.query, params.spreadsheetId),
};

export const sheetsGetLastRow: ToolDefinition<GetLastRowParams, SheetRowResult> = {
  name: "sheets.get_last_row",
  description: "Get the last non-empty row from a Google Sheet",
  paramsSchema: sheetsGetLastRowParamsSchema,
  resultSchema: sheetRowResultSchema,
  execute: async (params) => sheetsService.getLastRow(params.sheetName, params.spreadsheetId),
};

export const sheetsGetRow: ToolDefinition<GetRowParams, SheetRowResult> = {
  name: "sheets.get_row",
  description: "Get a specific row by number from a Google Sheet",
  paramsSchema: sheetsGetRowParamsSchema,
  resultSchema: sheetRowResultSchema,
  execute: async (params) =>
    sheetsService.getRow(params.sheetName, params.rowNumber, params.spreadsheetId),
};

export const sheetsFindEmail: ToolDefinition<FindEmailParams, FindEmailResult> = {
  name: "sheets.find_email",
  description: "Find an email address in a sheet row",
  paramsSchema: sheetsFindEmailParamsSchema,
  resultSchema: z.object({
    email: z.string().email(),
    sheetName: z.string(),
    rowNumber: z.number(),
  }),
  execute: async (params) =>
    sheetsService.findEmail(
      params.sheetName,
      params.rowNumber,
      params.columnName,
      params.spreadsheetId,
    ),
};

export const sheetsTools = [
  sheetsSearchSheet,
  sheetsGetLastRow,
  sheetsGetRow,
  sheetsFindEmail,
] as const;
