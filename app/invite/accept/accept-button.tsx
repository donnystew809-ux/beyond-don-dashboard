"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Could not accept invite");
        return;
      }
      router.push(json.next ?? "/today");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={accept}
        disabled={busy}
        className="w-full rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Accepting…" : "Accept invite"}
      </button>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}
