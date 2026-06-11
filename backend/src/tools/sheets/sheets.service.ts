import { env } from "../../config/env.js";
import { getGoogleClients, isGoogleConfigured } from "../../config/google.js";
export type SheetRowResult = {
  sheetName: string;
  rowNumber: number;
  values: string[];
  email?: string;
};

function spreadsheetId(override?: string): string {
  return override ?? env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
}

export async function searchSheet(
  sheetName: string,
  query: string,
  spreadsheetIdOverride?: string,
): Promise<SheetRowResult[]> {
  if (env.GOOGLE_MOCK_MODE || !isGoogleConfigured()) {
    return [
      {
        sheetName,
        rowNumber: 2,
        values: ["Jane Doe", "jane@example.com", query],
        email: "jane@example.com",
      },
    ];
  }

  const id = spreadsheetId(spreadsheetIdOverride);
  const { sheets } = await getGoogleClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values ?? [];
  const matches: SheetRowResult[] = [];

  rows.forEach((row, index) => {
    const values = row.map(String);
    const haystack = values.join(" ").toLowerCase();
    if (haystack.includes(query.toLowerCase())) {
      matches.push({
        sheetName,
        rowNumber: index + 1,
        values,
        email: values.find((v) => v.includes("@")),
      });
    }
  });

  return matches;
}

export async function getLastRow(
  sheetName: string,
  spreadsheetIdOverride?: string,
): Promise<SheetRowResult> {
  if (env.GOOGLE_MOCK_MODE || !isGoogleConfigured()) {
    return {
      sheetName,
      rowNumber: 42,
      values: ["Alex Winner", "alex.winner@hackathon.dev", "First Place"],
      email: "alex.winner@hackathon.dev",
    };
  }

  const id = spreadsheetId(spreadsheetIdOverride);
  const { sheets } = await getGoogleClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values ?? [];
  if (rows.length === 0) {
    throw new Error(`Sheet "${sheetName}" is empty`);
  }

  const values = rows[rows.length - 1]!.map(String);
  return {
    sheetName,
    rowNumber: rows.length,
    values,
    email: values.find((v) => v.includes("@")),
  };
}

export async function getRow(
  sheetName: string,
  rowNumber: number,
  spreadsheetIdOverride?: string,
): Promise<SheetRowResult> {
  if (env.GOOGLE_MOCK_MODE || !isGoogleConfigured()) {
    return {
      sheetName,
      rowNumber,
      values: ["Mock User", "mock@example.com", `Row ${rowNumber}`],
      email: "mock@example.com",
    };
  }

  const id = spreadsheetId(spreadsheetIdOverride);
  const { sheets } = await getGoogleClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
  });

  const values = (response.data.values?.[0] ?? []).map(String);
  return {
    sheetName,
    rowNumber,
    values,
    email: values.find((v) => v.includes("@")),
  };
}

export async function findEmail(
  sheetName: string,
  rowNumber?: number,
  columnName?: string,
  spreadsheetIdOverride?: string,
): Promise<{ email: string; sheetName: string; rowNumber: number }> {
  const row = rowNumber
    ? await getRow(sheetName, rowNumber, spreadsheetIdOverride)
    : await getLastRow(sheetName, spreadsheetIdOverride);

  if (columnName) {
    // Placeholder: real impl would map column header → index
    const email = row.values.find((v) => v.includes("@"));
    if (!email) throw new Error(`No email found in column "${columnName}"`);
    return { email, sheetName, rowNumber: row.rowNumber };
  }

  const email = row.email ?? row.values.find((v) => v.includes("@"));
  if (!email) throw new Error("No email found in row");
  return { email, sheetName, rowNumber: row.rowNumber };
}
