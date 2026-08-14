import Link from "next/link";
import { format } from "date-fns";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function OptimizerPage() {
  const supabase = await createClient();

  const [{ data: properties }, { data: latestOptimizations }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name, address, status")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("optimizations")
        .select("id, property_id, generated_at, cost_usd")
        .order("generated_at", { ascending: false }),
    ]);

  const lastByProperty = new Map<
    string,
    { id: string; generated_at: string; cost_usd: number | null }
  >();
  for (const o of latestOptimizations ?? []) {
    if (!lastByProperty.has(o.property_id)) {
      lastByProperty.set(o.property_id, {
        id: o.id,
        generated_at: o.generated_at,
        cost_usd: o.cost_usd,
      });
    }
  }

  return (
    <div>
      <PageHeader
        title="Listing Optimizer"
        description="AI-generated title, description, and amenity suggestions per property — powered by Claude Opus 4.7."
      />

      <div className="mb-6 rounded-lg border border-gold-500/50 bg-gold-500/15 p-4 text-sm text-cream-50">
        <strong className="text-gold-300">How this works:</strong>{" "}
        Click <em>Analyze</em> on a property and Claude reviews the listing data
        — recent reservations, pricing patterns, occupancy — and generates
        ranked title alternatives, a rewritten description, amenity gaps, and a
        positioning summary. Cost is typically $0.10–$0.50 per analysis. Run on
        demand, not on a schedule.
      </div>

      {!properties || properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-navy-700/50 bg-navy-900/60 backdrop-blur-sm p-10 text-center text-sm text-cream-200/60">
          No active properties.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-navy-800/40 text-left text-xs uppercase tracking-wide text-cream-200/60">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Last analyzed</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/40">
              {properties.map((p) => {
                const last = lastByProperty.get(p.id);
                return (
                  <tr key={p.id} className="hover:bg-navy-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-cream-50">{p.name}</div>
                      {p.address && (
                        <div className="text-xs text-cream-200/60">{p.address}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-cream-200/80">
                      {last ? (
                        <Link
                          href={`/optimizer/${p.id}`}
                          className="text-cream-100 hover:underline"
                        >
                          {format(
                            new Date(last.generated_at),
                            "MMM d, yyyy 'at' h:mma",
                          )}
                          {last.cost_usd != null && (
                            <span className="ml-2 text-xs text-cream-200/50">
                              · ${Number(last.cost_usd).toFixed(2)}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-cream-200/50">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/optimizer/${p.id}`}
                        className="rounded-md bg-gold-gradient px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110"
                      >
                        {last ? "View / re-analyze" : "Analyze"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
