"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api";

export default function DesktopConnectPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<"idle" | "claiming" | "claimed" | "error">("idle");
  const [message, setMessage] = useState("Approve this desktop app to use your Clawvio workspace.");

  const params = useMemo(() => {
    if (typeof window === "undefined") return { pairingId: "", code: "" };
    const search = new URLSearchParams(window.location.search);
    return {
      pairingId: search.get("pairingId") ?? "",
      code: search.get("code") ?? "",
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !params.pairingId || !params.code) return;

    async function claim() {
      setStatus("claiming");
      setMessage("Pairing your desktop app...");
      try {
        const token = await getToken();
        if (!token) throw new Error("Missing Clerk session token");

        const response = await fetch(`${API_URL}/desktop/pairings/${params.pairingId}/claim`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: params.code }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? `Pairing failed (${response.status})`);
        }

        setStatus("claimed");
        setMessage("Desktop connected. You can return to the Clawvio speech bar.");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Desktop pairing failed");
      }
    }

    void claim();
  }, [getToken, isLoaded, isSignedIn, params.code, params.pairingId]);

  const missingParams = !params.pairingId || !params.code;

  return (
    <main className="min-h-screen bg-brand-bg text-brand-dark">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          clawvio
        </Link>
        <section className="mt-10 rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-[0_24px_80px_rgba(18,18,18,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text/50">
            Desktop pairing
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            Connect the speech bar to your account.
          </h1>
          <p className="mt-4 text-brand-text/70">{missingParams ? "Missing pairing code." : message}</p>

          {!missingParams && (
            <div className="mt-6 rounded-lg bg-[#f5f3ef] p-4">
              <p className="text-xs text-brand-text/60">Pairing code</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">
                {params.code}
              </p>
            </div>
          )}

          {isLoaded && !isSignedIn && !missingParams && (
            <SignInButton mode="modal">
              <button className="mt-6 h-10 rounded-md bg-brand-dark px-4 text-sm font-semibold text-white hover:bg-black">
                Sign in to approve
              </button>
            </SignInButton>
          )}

          {status === "claiming" && (
            <p className="mt-6 text-sm text-brand-text/60">Waiting for server confirmation...</p>
          )}
          {status === "claimed" && (
            <Link
              href="/dashboard"
              className="mt-6 inline-flex h-10 items-center rounded-md bg-brand-dark px-4 text-sm font-semibold text-white hover:bg-black"
            >
              Open dashboard
            </Link>
          )}
          {status === "error" && (
            <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
