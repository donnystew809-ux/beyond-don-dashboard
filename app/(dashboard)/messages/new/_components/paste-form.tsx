"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PasteForm({
  properties,
}: {
  properties: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState("");
  const [airbnbThreadId, setAirbnbThreadId] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestFullName, setGuestFullName] = useState("");
  const [inbound, setInbound] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId || undefined,
          airbnb_thread_id: airbnbThreadId || undefined,
          guest_first_name: guestFirstName,
          guest_full_name: guestFullName || undefined,
          inbound_text: inbound,
          check_in: checkIn || undefined,
          check_out: checkOut || undefined,
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = await res.json();
      router.push(`/messages/${json.thread_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-2xl space-y-5 rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Guest first name *">
          <input
            required
            value={guestFirstName}
            onChange={(e) => setGuestFirstName(e.target.value)}
            className={inputCls}
            placeholder="Anthony"
          />
        </Field>
        <Field label="Guest full name (optional)">
          <input
            value={guestFullName}
            onChange={(e) => setGuestFullName(e.target.value)}
            className={inputCls}
            placeholder="Anthony Damon"
          />
        </Field>
        <Field label="Property">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={inputCls}
          >
            <option value="">— Optional —</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Airbnb thread ID (optional)">
          <input
            value={airbnbThreadId}
            onChange={(e) => setAirbnbThreadId(e.target.value)}
            className={inputCls}
            placeholder="2521931233"
          />
        </Field>
        <Field label="Check-in">
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Check-out">
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Guest's message *">
        <textarea
          required
          rows={6}
          value={inbound}
          onChange={(e) => setInbound(e.target.value)}
          className={inputCls}
          placeholder="Paste exactly what the guest sent on Airbnb…"
        />
      </Field>

      <button
        type="submit"
        disabled={busy || !guestFirstName || !inbound}
        className="rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Drafting reply…" : "Save & draft reply"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm text-cream-50 focus:border-gold-500 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-cream-200/60">
        {label}
      </span>
      {children}
    </label>
  );
}
