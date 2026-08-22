"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { loadDevice, forgetDevice, type StoredDevice } from "@/lib/auth/device-client";
import { PinPad } from "./_components/pin-pad";
import { BrandMark } from "@/components/brand-mark";
import { MagneticFieldBackground } from "@/components/magnetic-field-background";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An enrolled device short-circuits the whole email flow: show the PIN pad
  // instead. Resolved in an effect because localStorage is client-only and
  // reading it during render would desync hydration.
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [deviceChecked, setDeviceChecked] = useState(false);
  useEffect(() => {
    setDevice(loadDevice());
    setDeviceChecked(true);
  }, []);

  async function unlockWithPin(pin: string) {
    if (!device) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/device/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: device.deviceId,
          device_secret: device.deviceSecret,
          pin,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          json?.attempts_remaining != null && json.attempts_remaining > 0
            ? `${json.error} ${json.attempts_remaining} attempt${json.attempts_remaining === 1 ? "" : "s"} left.`
            : (json?.error ?? "Could not unlock."),
        );
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock.");
    } finally {
      setSubmitting(false);
    }
  }

  async function unlockWithBiometrics() {
    if (!device) return;
    setSubmitting(true);
    setError(null);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const optRes = await fetch("/api/auth/passkey/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "options", device_id: device.deviceId }),
      });
      if (!optRes.ok) {
        setError("Face ID is not set up on this device.");
        return;
      }
      const options = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verRes = await fetch("/api/auth/passkey/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "verify", device_id: device.deviceId, response: assertion }),
      });
      if (!verRes.ok) {
        const j = await verRes.json().catch(() => null);
        setError(j?.error ?? "Could not verify.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      // User dismissed the prompt, or the platform refused — fall back to PIN.
      setError(null);
    } finally {
      setSubmitting(false);
    }
  }

  function useDifferentAccount() {
    forgetDevice();
    setDevice(null);
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Enter your password, or tap 'Send magic link' instead.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    } else {
      // Session cookie is set; route to the dashboard.
      // "/" is role-aware: staff see the portfolio dashboard, everyone else
      // is redirected to their own home (my-property / account).
      router.push("/");
      router.refresh();
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setMessage("Check your email for the magic link.");
    }
    setSubmitting(false);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 text-cream-50">
      <MagneticFieldBackground tone="dark" />

      {/* Decorative gold chevron — echo of the business card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-1/2 hidden h-[140%] w-[60%] -translate-y-1/2 md:block"
      >
        <svg
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          className="h-full w-full opacity-90"
        >
          <defs>
            <linearGradient id="gold-1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E5C77E" />
              <stop offset="50%" stopColor="#C9A96A" />
              <stop offset="100%" stopColor="#8B6E34" />
            </linearGradient>
          </defs>
          <path
            d="M150 0 L320 400 L150 800 L210 800 L380 400 L210 0 Z"
            fill="url(#gold-1)"
            opacity="0.85"
          />
          <path
            d="M260 0 L430 400 L260 800 L320 800 L490 400 L320 0 Z"
            fill="#1a3263"
          />
          <path
            d="M370 0 L540 400 L370 800 L430 800 L600 400 L430 0 Z"
            fill="url(#gold-1)"
            opacity="0.85"
          />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <BrandMark tone="light" size="lg" showWordmark={false} className="mb-8" />

        <h1 className="text-3xl font-light tracking-tight text-cream-50">
          Beyond Don
        </h1>
        <p className="mt-1 text-sm font-medium uppercase tracking-[0.22em] text-gold-400">
          Operations Dashboard
        </p>
        <p className="mt-6 text-sm text-cream-200/80">
          Maximize Your Property&apos;s Potential.
        </p>

        <div className="mt-10 h-px w-12 bg-gold-500" />

        {!deviceChecked ? (
          <div className="mt-8 h-64" aria-hidden />
        ) : device ? (
          <div className="mt-8">
            <PinPad
              title="Welcome back"
              subtitle={device.label ? "Unlock " + device.label : "Enter your PIN to unlock"}
              onComplete={unlockWithPin}
              onBiometric={device.hasPasskey ? unlockWithBiometrics : undefined}
              showBiometric={!!device.hasPasskey}
              error={error}
              busy={submitting}
            />
            <button
              type="button"
              onClick={useDifferentAccount}
              className="mt-8 block w-full text-center text-xs uppercase tracking-[0.22em] text-cream-200/50 transition hover:text-gold-300"
            >
              Use a different account
            </button>
          </div>
        ) : (
        <form onSubmit={handlePasswordSignIn} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              placeholder="you@beyonddon.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-cream-200/70">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 block w-full rounded-md border border-navy-700 bg-navy-900/60 px-3 py-2.5 text-base text-cream-50 placeholder:text-cream-200/40 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              placeholder="Your password"
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="group relative w-full overflow-hidden rounded-md bg-gold-gradient px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={submitting}
            className="block w-full text-center text-xs uppercase tracking-[0.22em] text-cream-200/60 transition hover:text-gold-300 disabled:opacity-50"
          >
            Or send me a magic link
          </button>

          {message && (
            <p className="text-sm text-gold-300">{message}</p>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
        )}


        <p className="mt-12 text-[11px] uppercase tracking-[0.22em] text-cream-200/50">
          Beyond Don, LLC
        </p>
      </div>
    </main>
  );
}
