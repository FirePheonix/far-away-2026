import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { db } from "../config/db.js";
import { supabaseAdmin } from "../config/supabase.js";
import { encryptSecret } from "../utils/crypto.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  verifyOAuthState,
  createOAuthState,
} from "../services/google-oauth.service.js";
import { buildIntegrationAuthUrl, exchangeIntegrationCode } from "../services/oauth.service.js";
import { AppError } from "../utils/errors.js";

type GoogleConnectionRow = {
  id: string;
  google_email: string | null;
  scopes: string;
  connected_at: string;
};

function requireUserId(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }
  return userId;
}

async function ensureProfile(clerkUserId: string, email?: string): Promise<void> {
  // Without an email this must not clobber a previously stored one, so the
  // no-email case is insert-only rather than an overwriting upsert.
  const { error } = email
    ? await supabaseAdmin
        .from("profiles")
        .upsert({ clerk_user_id: clerkUserId, email }, { onConflict: "clerk_user_id" })
    : await supabaseAdmin
        .from("profiles")
        .upsert({ clerk_user_id: clerkUserId }, { onConflict: "clerk_user_id", ignoreDuplicates: true });

  if (error) {
    throw new AppError("Failed to upsert profile", 500, "DB_ERROR", error);
  }
}

function appRedirect(path = "/dashboard"): string {
  const base = env.FRONTEND_URL ?? env.CORS_ORIGIN;
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Credentials stay in local SQLite — this one is deliberately not on Supabase. */
async function loadActiveGoogleConnection(userId: string): Promise<GoogleConnectionRow | null> {
  try {
    const data = db.prepare(`
      SELECT id, google_email, scopes, connected_at 
      FROM google_connections 
      WHERE clerk_user_id = ? AND revoked_at IS NULL 
      ORDER BY connected_at DESC 
      LIMIT 1
    `).get(userId) as GoogleConnectionRow | undefined;
    return data ?? null;
  } catch (error) {
    throw new AppError("Failed to load Google integration status", 500, "DB_ERROR", error);
  }
}

function hasScope(scopes: string, fragment: string): boolean {
  return scopes.split(/\s+/).some((scope) => scope.includes(fragment));
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    await ensureProfile(userId);
    res.json({ authenticated: true, userId });
  } catch (err) {
    next(err);
  }
}

export async function startGoogleOAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    await ensureProfile(userId);
    const authUrl = buildGoogleAuthUrl(userId);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

export async function startIntegrationOAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    await ensureProfile(userId);

    const provider = req.params.provider;
    if (provider === "google") {
      res.json({ provider, authUrl: buildGoogleAuthUrl(userId) });
      return;
    }

    if (provider === "slack" || provider === "github" || provider === "notion") {
      const state = createOAuthState(userId);
      res.json({ provider, authUrl: buildIntegrationAuthUrl(provider, state) });
      return;
    }

    throw new AppError("Unknown integration provider", 404, "INTEGRATION_NOT_FOUND", {
      provider,
    });
  } catch (err) {
    next(err);
  }
}

export async function getGoogleConnectionStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const data = await loadActiveGoogleConnection(userId);

    res.json({
      connected: Boolean(data),
      connection: data ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDashboardSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    await ensureProfile(userId);

    const googleConnection = await loadActiveGoogleConnection(userId);

    const [profileRes, requestsRes, contactsRes, memoryRes, vectorCountRes, pendingRes] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("email, full_name, avatar_url")
          .eq("clerk_user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("assistant_requests")
          .select("id, transcript, status, created_at")
          .eq("clerk_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin
          .from("contacts")
          .select("id, display_name, primary_email, organization, role, notes, created_at")
          .eq("clerk_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(8),
        supabaseAdmin
          .from("memory_items")
          .select("id, kind, title, body, metadata, created_at")
          .eq("clerk_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(8),
        supabaseAdmin
          .from("memory_items")
          .select("id", { count: "exact", head: true })
          .eq("clerk_user_id", userId)
          .not("embedding", "is", null),
        supabaseAdmin
          .from("pending_tasks")
          .select("id, run_id, description, required_fields, status, resolved_data, created_at, updated_at")
          .eq("clerk_user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const profile = profileRes.data;
    const requests = requestsRes.data ?? [];
    const contacts = contactsRes.data ?? [];
    const memoryItems = memoryRes.data ?? [];
    const pendingTasks = pendingRes.data ?? [];

    const requestIds = requests.map((r) => r.id);
    let runs: any[] = [];
    if (requestIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("assistant_runs")
        .select("id, request_id, success, message, started_at, finished_at")
        .in("request_id", requestIds)
        .order("started_at", { ascending: false })
        .limit(30);
      runs = data ?? [];
    }

    const requestById = new Map(requests.map((request) => [request.id, request]));
    const recentRuns = runs
      .map((run) => {
        const request = requestById.get(run.request_id);
        if (!request) return null;
        const durationMs =
          run.finished_at && run.started_at
            ? Math.max(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime(), 0)
            : null;
        return {
          id: run.id,
          transcript: request.transcript,
          requestStatus: request.status,
          success: run.success ?? null,
          message: run.message,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          durationMs,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 8);

    const scopes = googleConnection?.scopes ?? "";
    
    const oauthConns = db.prepare(`SELECT provider FROM oauth_connections WHERE clerk_user_id = ?`).all(userId) as any[];
    const connectedProviders = new Set(oauthConns.map(c => c.provider));

    const apps = [
      { id: "google_sheets", label: "Google Sheets", connected: hasScope(scopes, "spreadsheets") },
      { id: "gmail", label: "Gmail", connected: hasScope(scopes, "gmail") },
      { id: "google_calendar", label: "Google Calendar", connected: hasScope(scopes, "calendar") },
      { id: "google_meet", label: "Google Meet", connected: hasScope(scopes, "calendar.events") },
      { id: "slack", label: "Slack", connected: connectedProviders.has("slack") },
      { id: "github", label: "GitHub", connected: connectedProviders.has("github") },
      { id: "notion", label: "Notion", connected: connectedProviders.has("notion") },
    ];

    res.json({
      profile: profile ?? null,
      google: {
        connected: Boolean(googleConnection),
        email: googleConnection?.google_email ?? null,
        connectedAt: googleConnection?.connected_at ?? null,
      },
      apps,
      recentRuns,
      pendingTasks,
      contacts,
      memoryItems,
      dataStats: {
        contacts: contacts.length,
        memories: memoryItems.length,
        vectorReady: vectorCountRes.count ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function googleOAuthCallback(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      throw new AppError("Missing OAuth callback params", 400, "OAUTH_CALLBACK_INVALID");
    }

    const { userId } = verifyOAuthState(state);
    const { token, userInfo } = await exchangeCodeForTokens(code);

    await ensureProfile(userId, userInfo.email);

    let connectionId: string;
    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO google_connections (id, clerk_user_id, google_sub, google_email, scopes, revoked_at)
          VALUES (@id, @clerkUserId, @googleSub, @googleEmail, @scopes, NULL)
          ON CONFLICT(clerk_user_id, google_sub) DO UPDATE SET 
            google_email = excluded.google_email,
            scopes = excluded.scopes,
            revoked_at = NULL
        `).run({
          id: randomUUID(),
          clerkUserId: userId,
          googleSub: userInfo.sub,
          googleEmail: userInfo.email ?? null,
          scopes: token.scope ?? ""
        });

        const conn = db.prepare(`SELECT id FROM google_connections WHERE clerk_user_id = ? AND google_sub = ?`).get(userId, userInfo.sub) as any;
        connectionId = conn.id;

        const expiresAt = typeof token.expires_in === "number"
            ? new Date(Date.now() + token.expires_in * 1000).toISOString()
            : null;

        db.prepare(`
          INSERT INTO google_tokens (connection_id, access_token_enc, refresh_token_enc, token_type, scope_text, expires_at)
          VALUES (@connectionId, @accessTokenEnc, @refreshTokenEnc, @tokenType, @scopeText, @expiresAt)
          ON CONFLICT(connection_id) DO UPDATE SET
            access_token_enc = excluded.access_token_enc,
            refresh_token_enc = COALESCE(excluded.refresh_token_enc, google_tokens.refresh_token_enc),
            token_type = excluded.token_type,
            scope_text = excluded.scope_text,
            expires_at = excluded.expires_at
        `).run({
          connectionId,
          accessTokenEnc: encryptSecret(token.access_token),
          refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
          tokenType: token.token_type ?? null,
          scopeText: token.scope ?? null,
          expiresAt
        });
      })();
    } catch (connectionError) {
      throw new AppError("Failed to save Google connection and tokens", 500, "DB_ERROR", connectionError);
    }

    res.redirect(appRedirect("/dashboard?google=connected"));
  } catch (err) {
    const details = err instanceof Error ? encodeURIComponent(err.message) : "unknown_error";
    res.redirect(appRedirect(`/dashboard?google=error&reason=${details}`));
  }
}

export async function integrationOAuthCallback(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const provider = req.params.provider;
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      throw new AppError(`Missing ${provider} OAuth callback params`, 400, "OAUTH_CALLBACK_INVALID");
    }

    const { userId } = verifyOAuthState(state);
    const tokenInfo = await exchangeIntegrationCode(provider, code);

    await ensureProfile(userId);

    let connectionId: string;
    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO oauth_connections (id, clerk_user_id, provider, provider_user_id)
          VALUES (@id, @clerkUserId, @provider, @providerUserId)
          ON CONFLICT(clerk_user_id, provider) DO UPDATE SET 
            provider_user_id = excluded.provider_user_id,
            connected_at = CURRENT_TIMESTAMP
        `).run({
          id: randomUUID(),
          clerkUserId: userId,
          provider,
          providerUserId: tokenInfo.providerUserId,
        });

        const conn = db.prepare(`SELECT id FROM oauth_connections WHERE clerk_user_id = ? AND provider = ?`).get(userId, provider) as any;
        connectionId = conn.id;

        const expiresAt = tokenInfo.expiresIn
            ? new Date(Date.now() + tokenInfo.expiresIn * 1000).toISOString()
            : null;

        db.prepare(`
          INSERT INTO oauth_tokens (connection_id, access_token_enc, refresh_token_enc, token_type, scope_text, expires_at)
          VALUES (@connectionId, @accessTokenEnc, @refreshTokenEnc, @tokenType, @scopeText, @expiresAt)
          ON CONFLICT(connection_id) DO UPDATE SET
            access_token_enc = excluded.access_token_enc,
            refresh_token_enc = COALESCE(excluded.refresh_token_enc, oauth_tokens.refresh_token_enc),
            token_type = excluded.token_type,
            scope_text = excluded.scope_text,
            expires_at = excluded.expires_at
        `).run({
          connectionId,
          accessTokenEnc: encryptSecret(tokenInfo.accessToken),
          refreshTokenEnc: tokenInfo.refreshToken ? encryptSecret(tokenInfo.refreshToken) : null,
          tokenType: tokenInfo.tokenType ?? null,
          scopeText: tokenInfo.scope ?? null,
          expiresAt
        });
      })();
    } catch (connectionError) {
      throw new AppError(`Failed to save ${provider} connection and tokens`, 500, "DB_ERROR", connectionError);
    }

    res.redirect(appRedirect(`/dashboard?${provider}=connected`));
  } catch (err) {
    const details = err instanceof Error ? encodeURIComponent(err.message) : "unknown_error";
    res.redirect(appRedirect(`/dashboard?${provider}=error&reason=${details}`));
  }
}
