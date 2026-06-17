import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

type StatePayload = {
  userId: string;
  nonce: string;
  iat: number;
};

function stateSecret(): string {
  const secret = env.TOKEN_ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new AppError(
      "TOKEN_ENCRYPTION_KEY (or CLERK_SECRET_KEY) is required for OAuth state signing",
      500,
      "AUTH_CONFIG_ERROR",
    );
  }
  return secret;
}

function signStatePayload(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(userId: string): string {
  const payload: StatePayload = {
    userId,
    nonce: randomUUID(),
    iat: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signStatePayload(encoded)}`;
}

export function verifyOAuthState(state: string): StatePayload {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new AppError("Invalid OAuth state", 400, "OAUTH_STATE_INVALID");
  }

  const expected = signStatePayload(encoded);
  const actualBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new AppError("OAuth state signature mismatch", 400, "OAUTH_STATE_INVALID");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
  if (!payload.userId) {
    throw new AppError("OAuth state missing user", 400, "OAUTH_STATE_INVALID");
  }

  // 10 minute expiry.
  if (Date.now() - payload.iat > 10 * 60 * 1000) {
    throw new AppError("OAuth state expired", 400, "OAUTH_STATE_EXPIRED");
  }

  return payload;
}

export function buildGoogleAuthUrl(userId: string): string {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new AppError(
      "Google OAuth env is incomplete (GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)",
      500,
      "OAUTH_CONFIG_ERROR",
    );
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state: createOAuthState(userId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<{
  token: GoogleTokenResponse;
  userInfo: GoogleUserInfo;
}> {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new AppError(
      "Google OAuth env is incomplete (GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)",
      500,
      "OAUTH_CONFIG_ERROR",
    );
  }

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    throw new AppError("Failed to exchange Google auth code", 502, "GOOGLE_OAUTH_TOKEN_ERROR", {
      status: tokenResp.status,
      body: errText,
    });
  }

  const token = (await tokenResp.json()) as GoogleTokenResponse;

  const userResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userResp.ok) {
    const errText = await userResp.text();
    throw new AppError("Failed to fetch Google user info", 502, "GOOGLE_OAUTH_USERINFO_ERROR", {
      status: userResp.status,
      body: errText,
    });
  }

  const userInfo = (await userResp.json()) as GoogleUserInfo;
  if (!userInfo.sub) {
    throw new AppError("Google user info missing subject", 502, "GOOGLE_OAUTH_USERINFO_ERROR");
  }

  return { token, userInfo };
}
