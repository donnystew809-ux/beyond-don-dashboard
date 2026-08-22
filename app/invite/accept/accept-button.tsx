"use client";

// Invite onboarding. Collects contact details and the sign-in PIN in the same
// step as acceptance, so nobody ends up with an activated account and no way
// to get back into it. The email is fixed to the invited address and shown
// read-only — it is what the invite was issued against and what the server
// re-checks, so letting it be edited would only invite confusion.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptButton({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pinTooShort = pin.length > 0 && pin.length < 6;
  const canSubmit =
    phone.trim().length >= 7 && pin.length >= 4 && confirm.length >= 4 && !busy;

  async function accept() {
    if (pin !== confirm) {
      setErr("The two PINs don't match.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: phone.trim(), pin }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? res.statusText ?? "Could not accept invite");
        setBusy(false); // re-enable only on failure
        return;
      }
      // Success: stay disabled through navigation so a second tap can't
      // re-POST into a 409 while the page is leaving.
      router.push(json?.next ?? "/my-property");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
          Email
        </span>
        <input
          type="email"
          value={email}
          readOnly
          className="mt-2 block w-full cursor-not-allowed rounded-md border border-navy-700/60 bg-navy-950/60 px-3 py-2.5 text-sm text-cream-200/70"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
          Phone number
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        <span className="mt-1.5 block text-[11px] text-cream-200/45">
          So Donovan can reach you about a property. Not used to sign in.
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
            Choose a PIN
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="4–6 digits"
            className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
            Confirm PIN
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            placeholder="Repeat it"
            className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </label>
      </div>

      {pinTooShort && (
        <p className="rounded-md border border-gold-500/25 bg-gold-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-gold-200/90">
          A 6-digit PIN is a hundred times harder to guess than a 4-digit one,
          and no slower to type.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-cream-200/50">
        From now on you&apos;ll sign in with this email and PIN on any device.
      </p>

      <button
        onClick={accept}
        disabled={!canSubmit}
        className="w-full rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Setting up…" : "Accept & create my PIN"}
      </button>

      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
}
