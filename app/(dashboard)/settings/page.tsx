import { Suspense } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { SyncControls } from "./_components/sync-controls";
import { MobileQR } from "./_components/mobile-qr";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [{ data: properties }, { data: syncs }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, status")
      .order("name"),
    supabase
      .from("sync_log")
      .select("source, started_at, finished_at, status, records_processed, error")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Settings"
        description="Manage properties, integrations, and run manual syncs."
      />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold">Mobile / home-screen install</h2>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-navy-800/50" />}>
          <MobileQR />
        </Suspense>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Properties</h2>
          <Link
            href="/settings/properties/new"
            className="rounded-md bg-navy-700 px-3 py-2 text-xs font-medium text-cream-50 hover:bg-navy-800"
          >
            Add property
          </Link>
        </div>
        {!properties || properties.length === 0 ? (
          <p className="text-sm text-cream-200/60">No properties yet.</p>
        ) : (
          <ul className="divide-y divide-navy-700/40 overflow-hidden rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm">
            {properties.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs uppercase tracking-wide text-cream-200/60">
                    {p.status}
                  </div>
                </div>
                <Link
                  href={`/settings/properties/${p.id}`}
                  className="rounded px-3 py-2 text-xs font-medium text-cream-100 hover:bg-navy-800/50 hover:underline"
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold">Manual sync</h2>
        <SyncControls />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent sync runs</h2>
        {!syncs || syncs.length === 0 ? (
          <p className="text-sm text-cream-200/60">No sync runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm">
            <table className="w-full text-xs">
              <thead className="bg-navy-800/40 text-left text-cream-200/60">
                <tr>
                  <th className="px-4 py-2">Source</th>
                  {/* Hide full timestamp on mobile — show relative time */}
                  <th className="hidden px-4 py-2 sm:table-cell">Started</th>
                  <th className="px-4 py-2 sm:hidden">When</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/40">
                {syncs.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{s.source}</td>
                    {/* Full timestamp on sm+ */}
                    <td className="hidden px-4 py-2 text-cream-200/80 sm:table-cell">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    {/* Relative time on mobile */}
                    <td className="px-4 py-2 text-cream-200/80 sm:hidden">
                      {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          s.status === "ok"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : s.status === "error"
                              ? "bg-red-500/15 text-red-300"
                              : "bg-navy-800/50 text-cream-100"
                        }`}
                      >
                        {s.status}
                      </span>
                      {s.error && (
                        <div className="mt-1 text-[10px] text-red-400">{s.error}</div>
                      )}
                    </td>
                    <td className="hidden px-4 py-2 text-cream-200/80 sm:table-cell">
                      {s.records_processed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
