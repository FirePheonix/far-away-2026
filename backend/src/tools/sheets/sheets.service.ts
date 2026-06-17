import { env } from "../../config/env.js";
import { getGoogleClients, isGoogleConfigured } from "../../config/google.js";
export type SheetRowResult = {
  sheetName: string;
  rowNumber: number;
  values: string[];
  email?: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
};

function spreadsheetId(override?: string): string {
  return override ?? env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
}

function requireSpreadsheetId(override?: string): string {
  const id = spreadsheetId(override).trim();
  if (!id) {
    throw new Error(
      "Google Sheets spreadsheet ID is missing. Set GOOGLE_SHEETS_SPREADSHEET_ID in backend env or pass spreadsheetId in the tool params.",
    );
  }
  return id;
}

function formatGoogleError(err: unknown, action: string): never {
  if (err && typeof err === "object") {
    const maybe = err as {
      message?: string;
      response?: { status?: number; data?: unknown };
      code?: number;
    };
    const status = maybe.response?.status ?? maybe.code;
    const details =
      typeof maybe.response?.data === "string"
        ? maybe.response.data
        : maybe.response?.data
          ? JSON.stringify(maybe.response.data)
          : undefined;

    throw new Error(
      `[Google Sheets] ${action} failed${status ? ` (status ${status})` : ""}${maybe.message ? `: ${maybe.message}` : ""}${details ? ` | ${details}` : ""}`,
    );
  }

  throw new Error(`[Google Sheets] ${action} failed`);
}

export async function searchSheet(
  sheetName: string,
  query: string,
  spreadsheetIdOverride?: string,
  clerkUserId?: string,
): Promise<SheetRowResult[]> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return [
      {
        sheetName,
        rowNumber: 2,
        values: ["Jane Doe", "jane@example.com", query],
        email: "jane@example.com",
      },
    ];
  }

  const id = requireSpreadsheetId(spreadsheetIdOverride);
  const { sheets, auth } = await getGoogleClients(clerkUserId);
  if (!auth) return [];

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${sheetName}!A:Z`,
    });
  } catch (err) {
    formatGoogleError(err, `search "${query}" in sheet "${sheetName}"`);
  }

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
  clerkUserId?: string,
): Promise<SheetRowResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      sheetName,
      rowNumber: 42,
      values: ["Alex Winner", "alex.winner@hackathon.dev", "First Place"],
      email: "alex.winner@hackathon.dev",
    };
  }

  const id = requireSpreadsheetId(spreadsheetIdOverride);
  const { sheets, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    return {
      sheetName,
      rowNumber: 0,
      values: [],
    };
  }

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${sheetName}!A:Z`,
    });
  } catch (err) {
    formatGoogleError(err, `read last row from sheet "${sheetName}"`);
  }

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
  clerkUserId?: string,
): Promise<SheetRowResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      sheetName,
      rowNumber,
      values: ["Mock User", "mock@example.com", `Row ${rowNumber}`],
      email: "mock@example.com",
    };
  }

  const id = requireSpreadsheetId(spreadsheetIdOverride);
  const { sheets, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    return {
      sheetName,
      rowNumber,
      values: [],
    };
  }

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
    });
  } catch (err) {
    formatGoogleError(err, `read row ${rowNumber} from sheet "${sheetName}"`);
  }

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
  clerkUserId?: string,
): Promise<{ email: string; sheetName: string; rowNumber: number }> {
  const row = rowNumber
    ? await getRow(sheetName, rowNumber, spreadsheetIdOverride, clerkUserId)
    : await getLastRow(sheetName, spreadsheetIdOverride, clerkUserId);

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

export async function searchAllSheets(
  query: string,
  maxSpreadsheets: number,
  maxSheetTabs: number,
  maxMatches: number,
  clerkUserId?: string,
): Promise<SheetRowResult[]> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return [
      {
        spreadsheetId: "mock-sheet-1",
        spreadsheetTitle: "Mock CRM",
        sheetName: "Leads",
        rowNumber: 2,
        values: ["Jane Doe", "jane@example.com", query],
        email: "jane@example.com",
      },
    ];
  }

  const { sheets, drive, auth } = await getGoogleClients(clerkUserId);
  if (!auth) return [];

  let filesResponse;
  try {
    filesResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      pageSize: maxSpreadsheets,
      orderBy: "modifiedTime desc",
      fields: "files(id,name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
  } catch (err) {
    formatGoogleError(err, "list spreadsheets from Drive");
  }

  const files = filesResponse.data.files ?? [];
  const normalizedQuery = query.toLowerCase();
  const matches: SheetRowResult[] = [];

  for (const file of files) {
    const spreadsheetId = file.id ?? "";
    if (!spreadsheetId) continue;

    let metadata;
    try {
      metadata = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      });
    } catch {
      continue;
    }

    const tabs = (metadata.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t))
      .slice(0, maxSheetTabs);

    for (const tab of tabs) {
      if (matches.length >= maxMatches) return matches;

      let valuesResponse;
      try {
        valuesResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${tab}!A:Z`,
        });
      } catch {
        continue;
      }

      const rows = valuesResponse.data.values ?? [];
      rows.forEach((row, index) => {
        if (matches.length >= maxMatches) return;

        const values = row.map(String);
        const haystack = values.join(" ").toLowerCase();
        if (haystack.includes(normalizedQuery)) {
          matches.push({
            spreadsheetId,
            spreadsheetTitle: file.name ?? spreadsheetId,
            sheetName: tab,
            rowNumber: index + 1,
            values,
            email: values.find((v) => v.includes("@")),
          });
        }
      });
    }
  }

  return matches;
}

export async function createSpreadsheet(
  title: string,
  sheetName?: string,
  clerkUserId?: string,
): Promise<{
  spreadsheetId: string;
  title: string;
  spreadsheetUrl?: string;
  status: "created" | "mock";
}> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      spreadsheetId: `mock-sheet-${Date.now()}`,
      title,
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock-sheet",
      status: "mock",
    };
  }

  const { sheets, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    throw new Error("No Google authorization found for spreadsheet creation");
  }

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheetName ? [{ properties: { title: sheetName } }] : undefined,
    },
  });

  return {
    spreadsheetId: response.data.spreadsheetId ?? "unknown",
    title: response.data.properties?.title ?? title,
    spreadsheetUrl: response.data.spreadsheetUrl ?? undefined,
    status: "created",
  };
}

export async function appendRow(
  sheetName: string,
  values: string[],
  spreadsheetIdOverride?: string,
  clerkUserId?: string,
): Promise<SheetRowResult> {
  if (env.GOOGLE_MOCK_MODE || (!clerkUserId && !isGoogleConfigured())) {
    return {
      sheetName,
      rowNumber: 99,
      values,
      email: values.find((v) => v.includes("@")),
    };
  }

  const id = requireSpreadsheetId(spreadsheetIdOverride);
  const { sheets, auth } = await getGoogleClients(clerkUserId);
  if (!auth) {
    throw new Error("No Google authorization found for spreadsheet append");
  }

  let response;
  try {
    response = await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${sheetName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [values],
      },
    });
  } catch (err) {
    formatGoogleError(err, `append row to sheet "${sheetName}"`);
  }

  const updatedRange = response.data.updates?.updatedRange ?? "";
  const rowMatch = updatedRange.match(/!.*?[A-Z]+(\d+)$/);
  const rowNumber = rowMatch ? parseInt(rowMatch[1]!, 10) : 0;

  return {
    sheetName,
    rowNumber,
    values,
    email: values.find((v) => v.includes("@")),
  };
}
