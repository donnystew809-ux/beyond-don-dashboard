"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeButton({
  propertyId,
  hasExisting,
}: {
  propertyId: string;
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (
      hasExisting &&
      !confirm(
        "Re-run the analysis? This will charge approximately $0.10–$0.50 to your Anthropic API account.",
      )
    ) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/optimizer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={run}
        disabled={running}
        className="rounded-md bg-gold-gradient px-4 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 transition hover:brightness-110 disabled:opacity-50"
      >
        {running
          ? "Analyzing… ~30–60s"
          : hasExisting
            ? "Re-analyze with AI"
            : "Analyze with AI"}
      </button>
      {error && (
        <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
