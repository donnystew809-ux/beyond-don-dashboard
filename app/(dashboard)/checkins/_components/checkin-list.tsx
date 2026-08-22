"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, ExternalLink, Send, FlaskConical } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import type { StayStage } from "@/lib/messaging/checkin";

export type CurrentStay = {
  id: string;
  property: string;
  checkIn: string;
  checkOut: string;
  reservationCode: string | null;
  guestName: string | null;
  stage: StayStage;
  label: string;
};

const STAGE_TONE: Record<string, string> = {
  arriving_today: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  mid_stay: "bg-gold-500/15 text-gold-300 border-gold-400/30",
  checking_out_tomorrow: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  checking_out_today: "bg-cream-200/10 text-cream-200/80 border-cream-200/20",
};

export function CheckinList({ stays }: { stays: CurrentStay[] }) {
  return (
    <div className="space-y-4">
      {stays.map((stay) => (
        <StayCard key={stay.id} stay={stay} />
      ))}
    </div>
  );
}

function StayCard({ stay }: { stay: CurrentStay }) {
  const [name, setName] = useState(stay.guestName ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [relayHint, setRelayHint] = useState<string | null>(null);

  async function send(asTest = false) {
    if (!draft) return;
    setSending(true);
    setError(null);
    setRelayHint(null);
    try {
      const res = await fetch("/api/messages/checkin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: stay.id, message: draft, ...(asTest ? { test: true } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // A missing relay is a normal state, not a failure — explain it
        // instead of showing a red error.
        if (json?.error === "no_relay") setRelayHint(json.message);
        else setError(json?.error ?? "Could not send.");
        return;
      }
      setSent(true);
      if (json?.test) setRelayHint("Sent to " + json.delivered_to + " — the dashboard send path works. Reaching the guest needs a reply address from Airbnb.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: stay.id,
          ...(name.trim() ? { guest_name: name.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Could not draft a message");
        return;
      }
      setDraft(json.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-cream-50">
            {stay.property}
          </h2>
          <p className="mt-1 text-xs text-cream-200/60">
            {stay.checkIn} → {stay.checkOut}
            {stay.reservationCode ? ` · ${stay.reservationCode}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            STAGE_TONE[stay.stage] ?? STAGE_TONE.mid_stay
          }`}
        >
          {stay.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Guest first name (optional)"
          className="min-w-0 flex-1 rounded-md border border-navy-700/60 bg-navy-950/40 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-200/35 focus:border-gold-500/50 focus:outline-none"
        />
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {loading ? "Drafting…" : draft ? "Redraft" : "Draft message"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-cream-200/45">
        Airbnb hides guest names from its calendar feed — add one here to
        personalise the greeting, or leave blank and the message reads naturally
        without it.
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {draft && (
        <div className="mt-4 rounded-lg border border-gold-500/20 bg-navy-950/40 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream-100">
            {draft}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => send(false)}
              disabled={sending || sent}
              className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {sent ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Sent
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send to guest"}
                </>
              )}
            </button>
            <button
              onClick={() => send(true)}
              disabled={sending || sent}
              title="Deliver this message to your own inbox to prove the send path works"
              className="inline-flex items-center gap-1.5 rounded-md border border-navy-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98] disabled:opacity-50"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Send test to me
            </button>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md border border-navy-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy message
                </>
              )}
            </button>
            {stay.reservationCode && (
              <a
                href={`https://www.airbnb.com/hosting/reservations/details/${stay.reservationCode}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-navy-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in Airbnb
              </a>
            )}
          </div>
          {relayHint && (
            <p className="mt-3 rounded-md border border-gold-500/25 bg-gold-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-gold-200/90">
              {relayHint}
            </p>
          )}
          {sent && (
            <p className="mt-3 text-[11px] text-emerald-300/90">
              Delivered through Airbnb&apos;s reply relay — it appears in the
              guest&apos;s Airbnb inbox as a message from you.
            </p>
          )}
          {!sent && !relayHint && (
            <p className="mt-3 text-[11px] leading-relaxed text-cream-200/45">
              Send goes through Airbnb&apos;s reply relay for this conversation.
              Copy is there if you would rather paste it in yourself.
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
