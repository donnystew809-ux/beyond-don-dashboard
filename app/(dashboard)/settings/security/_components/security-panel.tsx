"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Fingerprint, Trash2, KeyRound, AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { confirmSheet } from "@/components/confirm-sheet";
import {
  loadDevice,
  saveDevice,
  updateDevice,
  biometricsAvailable,
  type StoredDevice,
} from "@/lib/auth/device-client";

export function SecurityPanel({ email }: { email: string }) {
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinLength, setPinLength] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDevice(loadDevice());
    void biometricsAvailable().then(setBioAvailable);
    void fetch("/api/auth/pin/set")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setHasPin(!!j.has_pin);
          setPinLength(j.pin_length ?? null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  async function savePin() {
    setError(null);
    setNotice(null);
    if (pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Could not set the PIN.");
        return;
      }
      setHasPin(true);
      setPinLength(pin.length);

      // Remember this browser so a sign-in from anywhere else can be spotted
      // as new and trigger an alert email. Not a credential — best effort.
      if (!loadDevice()) {
        try {
          const d = await fetch("/api/auth/device/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin, label: deviceLabel() }),
          });
          if (d.ok) {
            const dj = await d.json();
            const stored: StoredDevice = {
              deviceId: dj.device_id,
              deviceSecret: dj.device_secret,
              label: deviceLabel(),
            };
            saveDevice(stored);
            setDevice(stored);
          }
        } catch {
          // Recognition is a nicety; the PIN already works.
        }
      }

      setPin("");
      setConfirm("");
      setNotice("PIN saved. Sign in with your email and PIN on any device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function removePin() {
    const ok = await confirmSheet({
      title: "Remove your PIN?",
      body: "Sign-in will go back to emailing you a magic link every time.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch("/api/auth/pin/set", { method: "DELETE" });
      setHasPin(false);
      setPinLength(null);
      setNotice("PIN removed.");
    } finally {
      setBusy(false);
    }
  }

  async function enableBiometrics() {
    if (!device) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const optRes = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "options", device_id: device.deviceId }),
      });
      if (!optRes.ok) {
        const j = await optRes.json().catch(() => null);
        setError(j?.error ?? "Could not start setup.");
        return;
      }
      const attestation = await startRegistration({
        optionsJSON: await optRes.json(),
      });
      const verRes = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "verify",
          device_id: device.deviceId,
          response: attestation,
        }),
      });
      const vj = await verRes.json().catch(() => null);
      if (!verRes.ok) {
        setError(vj?.error ?? "Could not finish setup.");
        return;
      }
      updateDevice({ hasPasskey: true });
      setDevice({ ...device, hasPasskey: true });
      setNotice("Face ID / fingerprint is on for this device.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg && !/abort|NotAllowed/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="h-40" aria-hidden />;

  return (
    <div className="space-y-5">
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-cream-50">
              {hasPin ? "PIN is set" : "Set a sign-in PIN"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-cream-200/65">
              Signed in as {email}. Sign in anywhere with just your email and
              this PIN — no email link to wait for. Five wrong tries locks the
              account for 15 minutes, and any sign-in from a device we don&apos;t
              recognise emails you an alert.
            </p>
          </div>
        </div>

        {hasPin ? (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-cream-200/55">
              Current PIN is {pinLength ?? 4} digits. Setting a new one replaces it
              everywhere.
            </p>
            <div className="flex flex-wrap gap-3">
              <PinInput value={pin} onChange={setPin} placeholder="New PIN" />
              <PinInput value={confirm} onChange={setConfirm} placeholder="Confirm new PIN" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={savePin}
                disabled={busy || pin.length < 4 || confirm.length < 4}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {busy ? "Saving…" : "Change PIN"}
              </button>
              <button
                onClick={removePin}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-navy-700/60 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98] disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove PIN
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap gap-3">
              <PinInput value={pin} onChange={setPin} placeholder="New PIN (4–6 digits)" />
              <PinInput value={confirm} onChange={setConfirm} placeholder="Confirm PIN" />
            </div>
            <button
              onClick={savePin}
              disabled={busy || pin.length < 4 || confirm.length < 4}
              className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {busy ? "Saving…" : "Set PIN"}
            </button>
          </div>
        )}

        {pin.length > 0 && pin.length < 6 && (
          <p className="mt-4 flex items-start gap-2 rounded-md border border-gold-500/25 bg-gold-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-gold-200/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              A 4-digit PIN has 10,000 combinations; 6 digits has a million. Since
              the PIN works from any device, those extra two digits are the
              difference between weeks and centuries of guessing.
            </span>
          </p>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-cream-50">
              Face ID / fingerprint
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-cream-200/65">
              {device?.hasPasskey
                ? "On for this device — the sign-in screen offers it instead of typing."
                : !device
                  ? "Set a PIN first, then you can turn this on."
                  : bioAvailable
                    ? "Skip typing on this device and unlock with your device's biometrics. Your PIN still works everywhere else."
                    : "This device doesn't offer built-in biometrics, so the PIN is the fastest option here."}
            </p>
          </div>
        </div>

        {device && !device.hasPasskey && bioAvailable && (
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-md border border-navy-700/50 bg-navy-950/30 px-3.5 py-3">
            <input
              type="checkbox"
              disabled={busy}
              onChange={(e) => {
                if (e.target.checked) void enableBiometrics();
              }}
              className="h-4 w-4 accent-gold-500"
            />
            <span className="text-sm text-cream-100">
              Use Face ID / fingerprint on this device
            </span>
          </label>
        )}
      </GlassCard>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-gold-300">{notice}</p>}
    </div>
  );
}

function PinInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      inputMode="numeric"
      type="password"
      autoComplete="new-password"
      value={value}
      maxLength={6}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder}
      className="min-w-[10rem] flex-1 rounded-md border border-navy-700/60 bg-navy-950/40 px-3 py-2.5 text-sm tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-200/35 focus:border-gold-500/50 focus:outline-none"
    />
  );
}

/** Best-effort friendly device name for the alert email. */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "this device";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "this device";
}
