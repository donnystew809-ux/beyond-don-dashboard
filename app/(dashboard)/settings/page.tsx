import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { SyncControls } from "./_components/sync-controls";

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Properties</h2>
          <Link
            href="/settings/properties/new"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Add property
          </Link>
        </div>
        {!properties || properties.length === 0 ? (
          <p className="text-sm text-neutral-500">No properties yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {properties.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500">
                    {p.status}
                  </div>
                </div>
                <Link
                  href={`/settings/properties/${p.id}`}
                  className="text-xs font-medium text-neutral-700 hover:underline"
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
          <p className="text-sm text-neutral-500">No sync runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {syncs.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{s.source}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          s.status === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : s.status === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {s.status}
                      </span>
                      {s.error && (
                        <div className="mt-1 text-[10px] text-red-600">
                          {s.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
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
