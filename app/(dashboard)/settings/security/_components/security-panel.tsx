"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Fingerprint, Trash2, KeyRound } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { confirmSheet } from "@/components/confirm-sheet";
import {
  loadDevice,
  saveDevice,
  updateDevice,
  forgetDevice,
  biometricsAvailable,
  type StoredDevice,
} from "@/lib/auth/device-client";

export function SecurityPanel({ email }: { email: string }) {
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [ready, setReady] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDevice(loadDevice());
    setReady(true);
    void biometricsAvailable().then(setBioAvailable);
  }, []);

  async function enroll() {
    setError(null);
    setNotice(null);
    if (pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/device/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, label: deviceLabel() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Could not set the PIN.");
        return;
      }
      const stored: StoredDevice = {
        deviceId: json.device_id,
        deviceSecret: json.device_secret,
        label: deviceLabel(),
      };
      saveDevice(stored);
      setDevice(stored);
      setPin("");
      setConfirm("");
      setNotice(
        "PIN set. Next time you open the dashboard on this device, just enter it.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
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
      const options = await optRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
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
      // A dismissed system prompt is not an error worth shouting about.
      const msg = err instanceof Error ? err.message : "";
      if (msg && !/abort|NotAllowed/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice() {
    const ok = await confirmSheet({
      title: "Forget this device?",
      body: "You'll need a magic link to sign in here again, and the PIN will stop working on this device.",
      confirmLabel: "Forget",
      tone: "danger",
    });
    if (!ok) return;
    forgetDevice();
    setDevice(null);
    setNotice("This device no longer has a PIN.");
  }

  if (!ready) return <div className="h-40" aria-hidden />;

  return (
    <div className="space-y-5">
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-cream-50">
              {device ? "PIN is set on this device" : "Set a PIN for this device"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-cream-200/65">
              Signed in as {email}. The PIN only works on this device — it is
              paired with a key stored in this browser, so on its own it cannot
              sign anyone in anywhere else. Five wrong tries locks it for 15
              minutes.
            </p>
          </div>
        </div>

        {!device ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap gap-3">
              <input
                inputMode="numeric"
                autoComplete="new-password"
                value={pin}
                maxLength={6}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="New PIN (4–6 digits)"
                className="min-w-[10rem] flex-1 rounded-md border border-navy-700/60 bg-navy-950/40 px-3 py-2.5 text-sm tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-200/35 focus:border-gold-500/50 focus:outline-none"
              />
              <input
                inputMode="numeric"
                autoComplete="new-password"
                value={confirm}
                maxLength={6}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                placeholder="Confirm PIN"
                className="min-w-[10rem] flex-1 rounded-md border border-navy-700/60 bg-navy-950/40 px-3 py-2.5 text-sm tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-200/35 focus:border-gold-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={enroll}
              disabled={busy || pin.length < 4 || confirm.length < 4}
              className="inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {busy ? "Saving…" : "Set PIN"}
            </button>
          </div>
        ) : (
          <button
            onClick={removeDevice}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-navy-700/60 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-cream-100 transition hover:bg-navy-800/60 active:scale-[0.98]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Forget this device
          </button>
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
                ? "On for this device — tap the fingerprint icon on the PIN screen to skip typing."
                : !device
                  ? "Set a PIN first, then you can turn this on."
                  : bioAvailable
                    ? "Skip the PIN entirely and unlock with your device's biometrics."
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

/** Best-effort friendly device name so the unlock screen can say which one. */
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
