import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { encryptSecret } from "../utils/crypto.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  verifyOAuthState,
} from "../services/google-oauth.service.js";
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
  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      clerk_user_id: clerkUserId,
      email: email ?? null,
    },
    { onConflict: "clerk_user_id" },
  );

  if (error) {
    throw new AppError("Failed to upsert profile", 500, "DB_ERROR", error);
  }
}

function appRedirect(path = "/dashboard"): string {
  const base = env.FRONTEND_URL ?? env.CORS_ORIGIN;
  return `${base.replace(/\/$/, "")}${path}`;
}

async function loadActiveGoogleConnection(userId: string): Promise<GoogleConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("google_connections")
    .select("id, google_email, scopes, connected_at")
    .eq("clerk_user_id", userId)
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to load Google integration status", 500, "DB_ERROR", error);
  }

  return data;
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
      throw new AppError(
        `${provider} OAuth is not configured yet`,
        501,
        "INTEGRATION_NOT_CONFIGURED",
        { provider },
      );
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

    const [
      profileResult,
      googleConnection,
      requestsResult,
      contactsResult,
      memoryResult,
      memoryVectorCountResult,
    ] =
      await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("email, full_name, avatar_url")
        .eq("clerk_user_id", userId)
        .maybeSingle(),
      loadActiveGoogleConnection(userId),
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
    ]);

    if (profileResult.error) {
      throw new AppError("Failed to load profile", 500, "DB_ERROR", profileResult.error);
    }

    if (requestsResult.error) {
      throw new AppError("Failed to load assistant requests", 500, "DB_ERROR", requestsResult.error);
    }

    if (contactsResult.error && contactsResult.error.code !== "42P01") {
      throw new AppError("Failed to load contacts", 500, "DB_ERROR", contactsResult.error);
    }

    if (memoryResult.error && memoryResult.error.code !== "42P01") {
      throw new AppError("Failed to load memory items", 500, "DB_ERROR", memoryResult.error);
    }

    if (memoryVectorCountResult.error && memoryVectorCountResult.error.code !== "42P01") {
      throw new AppError(
        "Failed to load vector memory count",
        500,
        "DB_ERROR",
        memoryVectorCountResult.error,
      );
    }

    const requests = requestsResult.data ?? [];
    const requestIds = requests.map((request) => request.id);

    let runs: {
      id: string;
      request_id: string;
      success: boolean | null;
      message: string | null;
      started_at: string;
      finished_at: string | null;
    }[] = [];

    if (requestIds.length > 0) {
      const runsResult = await supabaseAdmin
        .from("assistant_runs")
        .select("id, request_id, success, message, started_at, finished_at")
        .in("request_id", requestIds)
        .order("started_at", { ascending: false })
        .limit(30);

      if (runsResult.error) {
        throw new AppError("Failed to load assistant runs", 500, "DB_ERROR", runsResult.error);
      }

      runs = runsResult.data ?? [];
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
          success: run.success,
          message: run.message,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          durationMs,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 8);

    const scopes = googleConnection?.scopes ?? "";
    const apps = [
      { id: "google_sheets", label: "Google Sheets", connected: hasScope(scopes, "spreadsheets") },
      { id: "gmail", label: "Gmail", connected: hasScope(scopes, "gmail") },
      { id: "google_calendar", label: "Google Calendar", connected: hasScope(scopes, "calendar") },
      { id: "google_meet", label: "Google Meet", connected: hasScope(scopes, "calendar.events") },
      { id: "slack", label: "Slack", connected: false },
      { id: "github", label: "GitHub", connected: false },
      { id: "notion", label: "Notion", connected: false },
    ];

    res.json({
      profile: profileResult.data ?? null,
      google: {
        connected: Boolean(googleConnection),
        email: googleConnection?.google_email ?? null,
        connectedAt: googleConnection?.connected_at ?? null,
      },
      apps,
      recentRuns,
      contacts: contactsResult.data ?? [],
      memoryItems: memoryResult.data ?? [],
      dataStats: {
        contacts: contactsResult.data?.length ?? 0,
        memories: memoryResult.data?.length ?? 0,
        vectorReady: memoryVectorCountResult.count ?? 0,
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

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .upsert(
        {
          clerk_user_id: userId,
          google_sub: userInfo.sub,
          google_email: userInfo.email ?? null,
          scopes: token.scope ?? "",
          revoked_at: null,
        },
        { onConflict: "clerk_user_id,google_sub" },
      )
      .select("id")
      .single();

    if (connectionError || !connection?.id) {
      throw new AppError(
        "Failed to save Google connection",
        500,
        "DB_ERROR",
        connectionError ?? "Missing connection id",
      );
    }

    const expiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null;

    const { error: tokenError } = await supabaseAdmin.from("google_tokens").upsert(
      {
        connection_id: connection.id,
        access_token_enc: encryptSecret(token.access_token),
        refresh_token_enc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        token_type: token.token_type ?? null,
        scope_text: token.scope ?? null,
        expires_at: expiresAt,
      },
      { onConflict: "connection_id" },
    );

    if (tokenError) {
      throw new AppError("Failed to save Google tokens", 500, "DB_ERROR", tokenError);
    }

    res.redirect(appRedirect("/dashboard?google=connected"));
  } catch (err) {
    const details = err instanceof Error ? encodeURIComponent(err.message) : "unknown_error";
    res.redirect(appRedirect(`/dashboard?google=error&reason=${details}`));
  }
}
