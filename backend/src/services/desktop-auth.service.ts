import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { db } from "../config/db.js";
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
  const id = randomUUID();
  
  try {
    db.prepare(`
      INSERT INTO desktop_pairings (id, code, device_name)
      VALUES (?, ?, ?)
    `).run(id, code, deviceName ?? "Clawvio desktop");
    
    const pairing = db.prepare(`SELECT expires_at FROM desktop_pairings WHERE id = ?`).get(id) as any;
    
    const params = new URLSearchParams({
      pairingId: id,
      code,
    });

    return {
      pairingId: id,
      code,
      claimUrl: frontendUrl(`/desktop/connect?${params.toString()}`),
      expiresAt: pairing.expires_at,
    };
  } catch (error) {
    throw new AppError("Failed to create desktop pairing", 500, "DB_ERROR", error);
  }
}

export async function claimDesktopPairing(params: {
  pairingId: string;
  code: string;
  clerkUserId: string;
}): Promise<{ success: true }> {
  await ensureAssistantProfile(params.clerkUserId);

  let pairing;
  try {
    pairing = db.prepare(`
      SELECT id, code, device_name, status, expires_at 
      FROM desktop_pairings WHERE id = ?
    `).get(params.pairingId) as any;
  } catch (loadError) {
    throw new AppError("Failed to load desktop pairing", 500, "DB_ERROR", loadError);
  }

  if (!pairing || pairing.code !== params.code) {
    throw new AppError("Invalid desktop pairing code", 404, "PAIRING_NOT_FOUND");
  }
  if (pairing.status !== "pending" || new Date(pairing.expires_at).getTime() < Date.now()) {
    throw new AppError("Desktop pairing expired", 410, "PAIRING_EXPIRED");
  }

  const token = makeDesktopToken();
  const tokenId = randomUUID();
  
  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO desktop_tokens (id, clerk_user_id, token_hash, device_name)
        VALUES (?, ?, ?, ?)
      `).run(tokenId, params.clerkUserId, tokenHash(token), pairing.device_name);

      db.prepare(`
        UPDATE desktop_pairings 
        SET clerk_user_id = ?, status = 'claimed', token_enc = ?, claimed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(params.clerkUserId, encryptSecret(token), params.pairingId);
    })();
  } catch (error) {
    throw new AppError("Failed to claim desktop pairing", 500, "DB_ERROR", error);
  }

  return { success: true };
}

export async function getDesktopPairingStatus(pairingId: string): Promise<{
  status: "pending" | "claimed" | "expired";
  token?: string;
}> {
  let data;
  try {
    data = db.prepare(`
      SELECT status, expires_at, token_enc 
      FROM desktop_pairings WHERE id = ?
    `).get(pairingId) as any;
  } catch (error) {
    throw new AppError("Failed to load desktop pairing", 500, "DB_ERROR", error);
  }
  
  if (!data) {
    throw new AppError("Desktop pairing not found", 404, "PAIRING_NOT_FOUND");
  }

  if (data.status === "pending" && new Date(data.expires_at).getTime() < Date.now()) {
    db.prepare(`UPDATE desktop_pairings SET status = 'expired' WHERE id = ?`).run(pairingId);
    return { status: "expired" };
  }

  return {
    status: data.status,
    token: data.status === "claimed" && data.token_enc ? decryptSecret(data.token_enc) : undefined,
  };
}

export async function resolveDesktopToken(token: string): Promise<string | null> {
  if (!token.startsWith("cvio_dt_")) return null;

  let data;
  try {
    data = db.prepare(`
      SELECT id, clerk_user_id 
      FROM desktop_tokens 
      WHERE token_hash = ? AND revoked_at IS NULL
    `).get(tokenHash(token)) as any;
  } catch (error) {
    console.error("[DesktopAuth] Failed to resolve desktop token", error);
    return null;
  }
  
  if (!data?.clerk_user_id) return null;

  try {
    db.prepare(`UPDATE desktop_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.id);
  } catch (error) {
    console.error("[DesktopAuth] Failed to update token last_used_at", error);
  }

  return data.clerk_user_id;
}

export async function revokeDesktopToken(token: string): Promise<{ revoked: boolean }> {
  if (!token.startsWith("cvio_dt_")) return { revoked: false };

  try {
    const result = db.prepare(`
      UPDATE desktop_tokens 
      SET revoked_at = CURRENT_TIMESTAMP 
      WHERE token_hash = ? AND revoked_at IS NULL
    `).run(tokenHash(token));
    
    return { revoked: result.changes > 0 };
  } catch (error) {
    throw new AppError("Failed to revoke desktop token", 500, "DB_ERROR", error);
  }
}
