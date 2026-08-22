"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";
import { MagneticFieldBackground } from "@/components/magnetic-field-background";

import { PinLogin } from "./_components/pin-login";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Magic link is the fallback: first sign-in before a PIN exists, and the
  // recovery path when one is forgotten.
  const [magicMode, setMagicMode] = useState(false);

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
        // Access is invite-only. Supabase creates a user by default here,
        // which would let anyone mint an account just by typing an address.
        shouldCreateUser: false,
      },
    });

    // Deliberately uniform: an unknown address gets the same confirmation as a
    // real one, so this form cannot be used to discover who has an account.
    if (signInError && !/signup|not found|disabled/i.test(signInError.message)) {
      setError(signInError.message);
    } else {
      setMessage("If that email has access, a sign-in link is on its way.");
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
          <path d="M260 0 L430 400 L260 800 L320 800 L490 400 L320 0 Z" fill="#1a3263" />
          <path
            d="M370 0 L540 400 L370 800 L430 800 L600 400 L430 0 Z"
            fill="url(#gold-1)"
            opacity="0.85"
          />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <BrandMark tone="light" size="lg" showWordmark={false} className="mb-8" />

        <h1 className="text-3xl font-light tracking-tight text-cream-50">Beyond Don</h1>
        <p className="mt-1 text-sm font-medium uppercase tracking-[0.22em] text-gold-400">
          Operations Dashboard
        </p>
        <p className="mt-6 text-sm text-cream-200/80">
          Maximize Your Property&apos;s Potential.
        </p>

        <div className="mt-10 h-px w-12 bg-gold-500" />

        {magicMode ? (
          <div className="mt-8 space-y-5">
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

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={submitting}
              className="w-full rounded-md bg-gold-gradient px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send magic link"}
            </button>

            <button
              type="button"
              onClick={() => setMagicMode(false)}
              className="block w-full text-center text-xs uppercase tracking-[0.22em] text-cream-200/60 transition hover:text-gold-300"
            >
              Back to PIN sign-in
            </button>

            {message && <p className="text-sm text-gold-300">{message}</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>
        ) : (
          <PinLogin onUseMagicLink={() => setMagicMode(true)} />
        )}

        <p className="mt-12 text-[11px] uppercase tracking-[0.22em] text-cream-200/50">
          Beyond Don, LLC
        </p>
      </div>
    </main>
  );
}
