"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">BEYOND DON LLC</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Operations dashboard. Sign in to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send magic link"}
          </button>

          {message && (
            <p className="text-sm text-emerald-700">{message}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  );
}
