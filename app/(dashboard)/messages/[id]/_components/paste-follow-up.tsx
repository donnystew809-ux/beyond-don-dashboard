"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Lets Jasmin paste a NEW guest message into an existing thread (the guest
// replied again on Airbnb). Stores it as inbound and re-drafts.

export function PasteFollowUp({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, inbound_text: text }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setText("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold uppercase tracking-wider text-navy-600 hover:text-navy-900"
      >
        + Paste new guest reply
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        Paste the guest&apos;s new message
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="What the guest just sent on Airbnb…"
        className="w-full rounded-md border border-cream-300 bg-cream-50 p-3 text-sm text-navy-900 focus:border-gold-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-md bg-gold-gradient px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Drafting…" : "Save & draft reply"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setText("");
            setError(null);
          }}
          className="rounded-md border border-cream-300 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-700 hover:bg-cream-100"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
