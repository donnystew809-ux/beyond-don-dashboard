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
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? res.statusText ?? "Could not accept invite");
        setBusy(false); // re-enable only on failure
        return;
      }
      // Success: keep the button disabled through the navigation so a
      // second tap can't re-POST into a 409 while the page is leaving.
      router.push(json?.next ?? "/my-property");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
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
