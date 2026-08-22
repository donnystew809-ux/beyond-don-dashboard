"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import type { InviteRow } from "../page";

type Property = { id: string; name: string };

const ROLES = [
  { value: "cleaner", label: "Cleaner", access: "cleaning" },
  { value: "owner", label: "Owner", access: "owner_view" },
  { value: "operator", label: "Operator (full staff)", access: "full" },
  { value: "partner", label: "Partner", access: "full" },
] as const;

export function InviteManager({
  properties,
  initialInvites,
}: {
  properties: Property[];
  initialInvites: InviteRow[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("cleaner");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const accessLevel = ROLES.find((r) => r.value === role)!.access;
  const needsProperties = role === "cleaner" || role === "owner";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJoinUrl(null);
    if (needsProperties && propertyIds.length === 0) {
      setError("Pick at least one property for a cleaner or owner.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          property_ids: propertyIds,
          access_level: accessLevel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create invite");
        return;
      }
      setJoinUrl(json.join_url ?? null);
      setEmail("");
      setPropertyIds([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function toggleProperty(id: string) {
    setPropertyIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  const inputCls =
    "mt-1 block w-full rounded-md border border-navy-700/50 bg-navy-950/60 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none";
  const labelCls = "text-[11px] font-medium uppercase tracking-wider text-cream-200/70";

  return (
    <div className="space-y-6">
      <GlassCard className="p-5">
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cleaner@example.com"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className={inputCls}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {needsProperties && (
            <div>
              <span className={labelCls}>Properties they can access</span>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {properties.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-navy-700/40 bg-navy-950/40 px-3 py-2 text-sm text-cream-100"
                  >
                    <input
                      type="checkbox"
                      checked={propertyIds.includes(p.id)}
                      onChange={() => toggleProperty(p.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-gold-gradient px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create invite"}
            </button>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
        </form>

        {joinUrl && (
          <div className="mt-4 rounded-md border border-gold-500/40 bg-gold-500/10 p-3">
            <p className="text-xs text-gold-200">
              Invite created. Send this single-use link to them (expires in 7 days):
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-navy-950/60 px-2 py-1.5 text-[11px] text-cream-100">
                {joinUrl}
              </code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(joinUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setError("Copy failed — select and copy the link manually");
                  }
                }}
                className="shrink-0 rounded-md border border-navy-700/50 p-2 text-cream-100 hover:bg-navy-800"
                title="Copy link"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      <div>
        <h3 className="gold-underline mb-3 text-sm font-semibold uppercase tracking-wider text-cream-100">
          Invites
        </h3>
        {initialInvites.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-cream-200/60">
            No invites yet.
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {initialInvites.map((inv) => (
              <GlassCard key={inv.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-cream-50">{inv.email}</div>
                  {inv.phone && (
                    <a
                      href={`tel:${inv.phone.replace(/[^d+]/g, "")}`}
                      className="mt-0.5 block truncate text-xs text-cream-200/55 transition hover:text-gold-300"
                    >
                      {inv.phone}
                    </a>
                  )}
                  <div className="text-xs text-cream-200/60">
                    {inv.role} · {inv.property_ids.length} propert
                    {inv.property_ids.length === 1 ? "y" : "ies"}
                  </div>
                </div>
                <StatusBadge status={inv.status} />
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
    pending: "bg-gold-500/15 text-gold-300",
    accepted: "bg-emerald-500/15 text-emerald-300",
    revoked: "bg-red-500/15 text-red-300",
    expired: "bg-navy-700/40 text-cream-200/60",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status] ?? "bg-navy-700/40 text-cream-200/60"}`}
    >
      {status}
    </span>
  );
}
