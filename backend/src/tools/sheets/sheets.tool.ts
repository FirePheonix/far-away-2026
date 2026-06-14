import { z } from "zod";
import {
  spreadsheetCreateResultSchema,
  sheetRowResultSchema,
  sheetsCreateSpreadsheetParamsSchema,
  sheetsFindEmailParamsSchema,
  sheetsGetLastRowParamsSchema,
  sheetsGetRowParamsSchema,
  sheetsSearchAllParamsSchema,
  sheetsSearchParamsSchema,
} from "../../ai/schemas.js";
import type { ToolDefinition } from "../types.js";
import * as sheetsService from "./sheets.service.js";
import type { SheetRowResult } from "./sheets.service.js";

export type { SheetRowResult };

type SearchParams = z.output<typeof sheetsSearchParamsSchema>;
type SearchAllParams = z.output<typeof sheetsSearchAllParamsSchema>;
type GetLastRowParams = z.output<typeof sheetsGetLastRowParamsSchema>;
type GetRowParams = z.output<typeof sheetsGetRowParamsSchema>;
type FindEmailParams = z.output<typeof sheetsFindEmailParamsSchema>;
type CreateSpreadsheetParams = z.output<typeof sheetsCreateSpreadsheetParamsSchema>;
type FindEmailResult = { email: string; sheetName: string; rowNumber: number };

export const sheetsSearchSheet: ToolDefinition<SearchParams, SheetRowResult[]> = {
  name: "sheets.search_sheet",
  description: "Search rows in a Google Sheet by text query",
  paramsSchema: sheetsSearchParamsSchema,
  resultSchema: sheetRowResultSchema.array(),
  execute: async (params, context) =>
    sheetsService.searchSheet(
      params.sheetName,
      params.query,
      params.spreadsheetId,
      context.user?.clerkUserId,
    ),
};

export const sheetsGetLastRow: ToolDefinition<GetLastRowParams, SheetRowResult> = {
  name: "sheets.get_last_row",
  description: "Get the last non-empty row from a Google Sheet",
  paramsSchema: sheetsGetLastRowParamsSchema,
  resultSchema: sheetRowResultSchema,
  execute: async (params, context) =>
    sheetsService.getLastRow(params.sheetName, params.spreadsheetId, context.user?.clerkUserId),
};

export const sheetsGetRow: ToolDefinition<GetRowParams, SheetRowResult> = {
  name: "sheets.get_row",
  description: "Get a specific row by number from a Google Sheet",
  paramsSchema: sheetsGetRowParamsSchema,
  resultSchema: sheetRowResultSchema,
  execute: async (params, context) =>
    sheetsService.getRow(
      params.sheetName,
      params.rowNumber,
      params.spreadsheetId,
      context.user?.clerkUserId,
    ),
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
  execute: async (params, context) =>
    sheetsService.findEmail(
      params.sheetName,
      params.rowNumber,
      params.columnName,
      params.spreadsheetId,
      context.user?.clerkUserId,
    ),
};

export const sheetsSearchAllSheets: ToolDefinition<SearchAllParams, SheetRowResult[]> = {
  name: "sheets.search_all_sheets",
  description: "Search rows across all Google Sheets available to the connected account",
  paramsSchema: sheetsSearchAllParamsSchema,
  resultSchema: sheetRowResultSchema.array(),
  execute: async (params, context) =>
    sheetsService.searchAllSheets(
      params.query,
      params.maxSpreadsheets,
      params.maxSheetTabs,
      params.maxMatches,
      context.user?.clerkUserId,
    ),
};

export const sheetsCreateSpreadsheet: ToolDefinition<
  CreateSpreadsheetParams,
  z.output<typeof spreadsheetCreateResultSchema>
> = {
  name: "sheets.create_spreadsheet",
  description: "Create a new Google Spreadsheet",
  paramsSchema: sheetsCreateSpreadsheetParamsSchema,
  resultSchema: spreadsheetCreateResultSchema,
  execute: async (params, context) =>
    sheetsService.createSpreadsheet(params.title, params.sheetName, context.user?.clerkUserId),
};

export const sheetsTools = [
  sheetsSearchSheet,
  sheetsSearchAllSheets,
  sheetsGetLastRow,
  sheetsGetRow,
  sheetsFindEmail,
  sheetsCreateSpreadsheet,
] as const;
