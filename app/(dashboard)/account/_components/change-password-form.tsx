"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-navy-600">
          New password
        </span>
        <input
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          className="mt-2 block w-full rounded-md border border-cream-200 bg-white px-3 py-2.5 text-base text-navy-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-navy-600">
          Confirm password
        </span>
        <input
          type="password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          className="mt-2 block w-full rounded-md border border-cream-200 bg-white px-3 py-2.5 text-base text-navy-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-navy-800 disabled:opacity-50"
      >
        {submitting ? "Updating…" : "Change password"}
      </button>

      {success && (
        <p className="text-sm text-emerald-700">
          Password updated. Use your new password next time you sign in.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
