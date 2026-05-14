"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Property = { id: string; name: string };

const CATEGORIES = [
  { value: "cleaning", label: "🧹 Cleaning" },
  { value: "maintenance", label: "🔧 Maintenance" },
  { value: "supplies", label: "🛒 Supplies" },
  { value: "platform_fee", label: "💻 Platform Fee" },
  { value: "utilities", label: "💡 Utilities" },
  { value: "insurance", label: "🛡️ Insurance" },
  { value: "other", label: "📦 Other" },
];

export function AddExpenseForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const body = {
      property_id: fd.get("property_id") as string,
      date: fd.get("date") as string,
      category: fd.get("category") as string,
      amount: parseFloat(fd.get("amount") as string),
      vendor: fd.get("vendor") as string || null,
      description: fd.get("description") as string || null,
    };

    if (!body.property_id || !body.date || !body.category || isNaN(body.amount)) {
      setError("Please fill in all required fields.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Failed to save expense.");
      } else {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-5">
      <h2 className="mb-4 text-sm font-semibold">Add expense</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Property */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Property *</label>
          <select
            name="property_id"
            required
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          >
            <option value="">Select property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Date *</label>
          <input
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Category *</label>
          <select
            name="category"
            required
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          >
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Amount (USD) *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>

        {/* Vendor */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Vendor / Payee</label>
          <input
            name="vendor"
            type="text"
            placeholder="e.g. Maria's Cleaning Co."
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-100">Notes</label>
          <input
            name="description"
            type="text"
            placeholder="Optional details…"
            className="w-full rounded-md border border-navy-700/50 bg-navy-800/40 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-3 text-xs text-emerald-400">Expense saved ✓</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy-700 px-4 py-2.5 text-xs font-medium text-cream-50 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save expense"}
        </button>
      </div>
    </form>
  );
}
