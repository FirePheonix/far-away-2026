import { google } from "googleapis";
import { env } from "./env.js";
import { db } from "./db.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

export type GoogleClients = {
  sheets: ReturnType<typeof google.sheets>;
  drive: ReturnType<typeof google.drive>;
  docs: ReturnType<typeof google.docs>;
  gmail: ReturnType<typeof google.gmail>;
  calendar: ReturnType<typeof google.calendar>;
  auth: unknown;
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

async function buildUserOAuthClient(clerkUserId: string) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return null;

  let connection;
  try {
    connection = db.prepare(`
      SELECT id FROM google_connections 
      WHERE clerk_user_id = ? AND revoked_at IS NULL 
      ORDER BY connected_at DESC LIMIT 1
    `).get(clerkUserId) as any;
  } catch (error) {
    throw error;
  }
  
  if (!connection?.id) return null;

  let token;
  try {
    token = db.prepare(`
      SELECT access_token_enc, refresh_token_enc, expires_at 
      FROM google_tokens 
      WHERE connection_id = ?
    `).get(connection.id) as any;
  } catch (error) {
    throw error;
  }
  
  if (!token?.access_token_enc) return null;

  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );

  oauth2.setCredentials({
    access_token: decryptSecret(token.access_token_enc),
    refresh_token: token.refresh_token_enc ? decryptSecret(token.refresh_token_enc) : undefined,
    expiry_date: token.expires_at ? new Date(token.expires_at).getTime() : undefined,
  });

  oauth2.on("tokens", (tokens) => {
    const update: Record<string, string | null> = {};
    if (tokens.access_token) update.access_token_enc = encryptSecret(tokens.access_token);
    if (tokens.refresh_token) update.refresh_token_enc = encryptSecret(tokens.refresh_token);
    if (tokens.expiry_date) update.expires_at = new Date(tokens.expiry_date).toISOString();
    if (Object.keys(update).length === 0) return;

    try {
      const keys = Object.keys(update);
      const setClause = keys.map(k => `${k} = @${k}`).join(", ");
      db.prepare(`UPDATE google_tokens SET ${setClause} WHERE connection_id = @connectionId`).run({
        ...update,
        connectionId: connection.id
      });
    } catch (error) {
      console.error("[Google] Failed to persist refreshed token", error);
    }
  });

  return oauth2;
}

export async function getGoogleClients(clerkUserId?: string): Promise<GoogleClients> {
  if (clerkUserId) {
    const userAuth = await buildUserOAuthClient(clerkUserId);
    if (userAuth) {
      return {
        sheets: google.sheets({ version: "v4", auth: userAuth }),
        drive: google.drive({ version: "v3", auth: userAuth }),
        docs: google.docs({ version: "v1", auth: userAuth }),
        gmail: google.gmail({ version: "v1", auth: userAuth }),
        calendar: google.calendar({ version: "v3", auth: userAuth }),
        auth: userAuth,
      };
    }
  }

  if (cachedClients) {
    return cachedClients;
  }

  const auth = buildJwtAuth();
  if (!auth) {
    cachedClients = {
      sheets: google.sheets({ version: "v4" }),
      drive: google.drive({ version: "v3" }),
      docs: google.docs({ version: "v1" }),
      gmail: google.gmail({ version: "v1" }),
      calendar: google.calendar({ version: "v3" }),
      auth: null,
    };
    return cachedClients;
  }

  if (auth instanceof google.auth.JWT) {
    cachedClients = {
      sheets: google.sheets({ version: "v4", auth }),
      drive: google.drive({ version: "v3", auth }),
      docs: google.docs({ version: "v1", auth }),
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
    drive: google.drive({ version: "v3", auth: jwt }),
    docs: google.docs({ version: "v1", auth: jwt }),
    gmail: google.gmail({ version: "v1", auth: jwt }),
    calendar: google.calendar({ version: "v3", auth: jwt }),
    auth: jwt,
  };

  return cachedClients;
}

export function resetGoogleClientsCache(): void {
  cachedClients = null;
}
