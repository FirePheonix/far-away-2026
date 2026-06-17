import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";
import { ensureAssistantProfile } from "./assistant-runs.service.js";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function makeCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

function makeDesktopToken(): string {
  return `cvio_dt_${randomBytes(32).toString("base64url")}`;
}

function frontendUrl(path: string): string {
  const base = env.FRONTEND_URL ?? env.CORS_ORIGIN;
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function createDesktopPairing(deviceName?: string): Promise<{
  pairingId: string;
  code: string;
  claimUrl: string;
  expiresAt: string;
}> {
  const code = makeCode();
  const { data, error } = await supabaseAdmin
    .from("desktop_pairings")
    .insert({
      code,
      device_name: deviceName ?? "Clawvio desktop",
    })
    .select("id, expires_at")
    .single();

  if (error || !data?.id) {
    throw new AppError("Failed to create desktop pairing", 500, "DB_ERROR", error);
  }

  const params = new URLSearchParams({
    pairingId: data.id,
    code,
  });

  return {
    pairingId: data.id,
    code,
    claimUrl: frontendUrl(`/desktop/connect?${params.toString()}`),
    expiresAt: data.expires_at,
  };
}

export async function claimDesktopPairing(params: {
  pairingId: string;
  code: string;
  clerkUserId: string;
}): Promise<{ success: true }> {
  await ensureAssistantProfile(params.clerkUserId);

  const { data: pairing, error: loadError } = await supabaseAdmin
    .from("desktop_pairings")
    .select("id, code, device_name, status, expires_at")
    .eq("id", params.pairingId)
    .maybeSingle();

  if (loadError) {
    throw new AppError("Failed to load desktop pairing", 500, "DB_ERROR", loadError);
  }
  if (!pairing || pairing.code !== params.code) {
    throw new AppError("Invalid desktop pairing code", 404, "PAIRING_NOT_FOUND");
  }
  if (pairing.status !== "pending" || new Date(pairing.expires_at).getTime() < Date.now()) {
    throw new AppError("Desktop pairing expired", 410, "PAIRING_EXPIRED");
  }

  const token = makeDesktopToken();
  const { error: tokenError } = await supabaseAdmin.from("desktop_tokens").insert({
    clerk_user_id: params.clerkUserId,
    token_hash: tokenHash(token),
    device_name: pairing.device_name,
  });

  if (tokenError) {
    throw new AppError("Failed to create desktop token", 500, "DB_ERROR", tokenError);
  }

  const { error: updateError } = await supabaseAdmin
    .from("desktop_pairings")
    .update({
      clerk_user_id: params.clerkUserId,
      status: "claimed",
      token_enc: encryptSecret(token),
      claimed_at: new Date().toISOString(),
    })
    .eq("id", params.pairingId);

  if (updateError) {
    throw new AppError("Failed to claim desktop pairing", 500, "DB_ERROR", updateError);
  }

  return { success: true };
}

export async function getDesktopPairingStatus(pairingId: string): Promise<{
  status: "pending" | "claimed" | "expired";
  token?: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("desktop_pairings")
    .select("status, expires_at, token_enc")
    .eq("id", pairingId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to load desktop pairing", 500, "DB_ERROR", error);
  }
  if (!data) {
    throw new AppError("Desktop pairing not found", 404, "PAIRING_NOT_FOUND");
  }

  if (data.status === "pending" && new Date(data.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("desktop_pairings")
      .update({ status: "expired" })
      .eq("id", pairingId);
    return { status: "expired" };
  }

  return {
    status: data.status,
    token: data.status === "claimed" && data.token_enc ? decryptSecret(data.token_enc) : undefined,
  };
}

export async function resolveDesktopToken(token: string): Promise<string | null> {
  if (!token.startsWith("cvio_dt_")) return null;

  const { data, error } = await supabaseAdmin
    .from("desktop_tokens")
    .select("id, clerk_user_id")
    .eq("token_hash", tokenHash(token))
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    console.error("[DesktopAuth] Failed to resolve desktop token", error);
    return null;
  }
  if (!data?.clerk_user_id) return null;

  await supabaseAdmin
    .from("desktop_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data.clerk_user_id;
}

export async function revokeDesktopToken(token: string): Promise<{ revoked: boolean }> {
  if (!token.startsWith("cvio_dt_")) return { revoked: false };

  const { error, count } = await supabaseAdmin
    .from("desktop_tokens")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("token_hash", tokenHash(token))
    .is("revoked_at", null);

  if (error) {
    throw new AppError("Failed to revoke desktop token", 500, "DB_ERROR", error);
  }

  return { revoked: Boolean(count && count > 0) };
}
