import { google } from "googleapis";
import { env } from "./env.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

export type GoogleClients = {
  sheets: ReturnType<typeof google.sheets>;
  gmail: ReturnType<typeof google.gmail>;
  calendar: ReturnType<typeof google.calendar>;
  auth: InstanceType<typeof google.auth.JWT> | null;
};

let cachedClients: GoogleClients | null = null;

function buildJwtAuth() {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({
      keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });
  }

  if (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
    return new google.auth.JWT({
      email: env.GOOGLE_CLIENT_EMAIL,
      key: privateKey,
      scopes: SCOPES,
    });
  }

  return null;
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    env.GOOGLE_APPLICATION_CREDENTIALS ||
      (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY),
  );
}

export async function getGoogleClients(): Promise<GoogleClients> {
  if (cachedClients) {
    return cachedClients;
  }

  const auth = buildJwtAuth();
  if (!auth) {
    cachedClients = {
      sheets: google.sheets({ version: "v4" }),
      gmail: google.gmail({ version: "v1" }),
      calendar: google.calendar({ version: "v3" }),
      auth: null,
    };
    return cachedClients;
  }

  if (auth instanceof google.auth.JWT) {
    cachedClients = {
      sheets: google.sheets({ version: "v4", auth }),
      gmail: google.gmail({ version: "v1", auth }),
      calendar: google.calendar({ version: "v3", auth }),
      auth,
    };
    return cachedClients;
  }

  const client = await auth.getClient();
  const jwt = client as InstanceType<typeof google.auth.JWT>;

  cachedClients = {
    sheets: google.sheets({ version: "v4", auth: jwt }),
    gmail: google.gmail({ version: "v1", auth: jwt }),
    calendar: google.calendar({ version: "v3", auth: jwt }),
    auth: jwt,
  };

  return cachedClients;
}

export function resetGoogleClientsCache(): void {
  cachedClients = null;
}
