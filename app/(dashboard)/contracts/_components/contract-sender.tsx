"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/glass-card";
import { confirmSheet } from "@/components/confirm-sheet";
import type { ContractRow } from "../page";

const inputCls =
  "mt-1 block w-full rounded-md border border-navy-700/50 bg-navy-950/60 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none";
const labelCls = "text-[11px] font-medium uppercase tracking-wider text-cream-200/70";

export function ContractSender({
  disabled,
  properties,
  contracts,
}: {
  disabled: boolean;
  properties: Array<{ id: string; name: string }>;
  contracts: ContractRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (
      !(await confirmSheet({
        title: "Send for signature?",
        body: `The management agreement will be emailed to ${email} to sign via Dropbox Sign.`,
        confirmLabel: "Send it",
      }))
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer_name: name.trim(),
          signer_email: email.trim(),
          property_id: propertyId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "send failed");
        return;
      }
      setMsg("Sent — the signer will receive an email from Dropbox Sign.");
      setName("");
      setEmail("");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard className="p-5">
        <form onSubmit={send} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Signer name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Owner" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Signer email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" className={inputCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Property (optional)</span>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={inputCls}>
              <option value="">— none —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy || disabled}
              className="rounded-md bg-gold-gradient px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send for signature"}
            </button>
            {msg && <span className="ml-3 text-xs text-gold-300">{msg}</span>}
          </div>
        </form>
      </GlassCard>

      <div>
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          History
        </h3>
        {contracts.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-cream-200/60">
            No contracts sent yet.
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => (
              <GlassCard key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-cream-50">
                    {c.signer_name} · {c.signer_email}
                  </div>
                  <div className="text-[11px] text-cream-200/50">
                    {c.title}
                    {c.sent_at ? ` · sent ${c.sent_at.slice(0, 10)}` : ""}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-navy-700/40 text-cream-200/60",
    sent: "bg-gold-500/15 text-gold-300",
    viewed: "bg-gold-500/15 text-gold-300",
    signed: "bg-emerald-500/15 text-emerald-300",
    declined: "bg-red-500/15 text-red-300",
    voided: "bg-navy-700/40 text-cream-200/60",
    error: "bg-red-500/15 text-red-300",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}
