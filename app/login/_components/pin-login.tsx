"use client";

// Email + PIN sign-in, usable from any device.
//
// The email is remembered locally so returning on a familiar browser is just
// the PIN; a first visit anywhere shows both fields. The device id, when we
// have one, is sent purely so the server can tell "somewhere new" from
// "somewhere known" and alert on the former — it is not a credential.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";

import { loadDevice, biometricsAvailable } from "@/lib/auth/device-client";

const LAST_EMAIL_KEY = "bd_last_email";

export function PinLogin({ onUseMagicLink }: { onUseMagicLink: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (saved) setEmail(saved);
    const d = loadDevice();
    if (d?.hasPasskey) void biometricsAvailable().then(setHasPasskey);
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const device = loadDevice();
      const res = await fetch("/api/auth/pin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          pin,
          ...(device?.deviceId ? { device_id: device.deviceId } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const remaining = json?.attempts_remaining;
        setError(
          remaining != null && remaining > 0
            ? `${json.error} ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
            : (json?.error ?? "Could not sign in."),
        );
        setPin("");
        return;
      }
      window.localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function biometricSignIn() {
    const device = loadDevice();
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const optRes = await fetch("/api/auth/passkey/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "options", device_id: device.deviceId }),
      });
      if (!optRes.ok) return;
      const assertion = await startAuthentication({
        optionsJSON: await optRes.json(),
      });
      const verRes = await fetch("/api/auth/passkey/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "verify",
          device_id: device.deviceId,
          response: assertion,
        }),
      });
      if (!verRes.ok) return;
      router.push("/");
      router.refresh();
    } catch {
      // Prompt dismissed — the PIN form is still right there.
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={signIn} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@beyonddon.com"
          className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
          PIN
        </span>
        <input
          type="password"
          inputMode="numeric"
          required
          minLength={4}
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoComplete="current-password"
          placeholder="••••••"
          className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base tracking-[0.4em] text-cream-50 placeholder:tracking-[0.3em] placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </label>

      <button
        type="submit"
        disabled={busy || pin.length < 4}
        className="w-full rounded-md bg-gold-gradient px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {hasPasskey && (
        <button
          type="button"
          onClick={biometricSignIn}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-navy-700/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gold-300 transition hover:bg-navy-800/50 active:scale-[0.99] disabled:opacity-50"
        >
          <Fingerprint className="h-4 w-4" />
          Use Face ID / fingerprint
        </button>
      )}

      <button
        type="button"
        onClick={onUseMagicLink}
        disabled={busy}
        className="block w-full text-center text-xs uppercase tracking-[0.22em] text-cream-200/60 transition hover:text-gold-300 disabled:opacity-50"
      >
        Forgot PIN? Email me a link
      </button>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
