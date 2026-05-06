import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, nickname, address, status, ical_url, pricelabs_listing_id, turno_property_id")
    .order("name");

  return (
    <div>
      <PageHeader
        title="Properties"
        description="All BEYOND DON LLC managed properties."
        action={
          <Link
            href="/settings/properties/new"
            className="rounded-md bg-navy-700 px-4 py-2.5 text-xs font-medium text-cream-50 hover:bg-navy-800"
          >
            Add property
          </Link>
        }
      />

      {!properties || properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-white p-10 text-center">
          <p className="text-sm text-navy-600">
            No properties yet. Add one to start syncing data.
          </p>
          <Link
            href="/settings/properties/new"
            className="mt-3 inline-block rounded-md bg-navy-700 px-4 py-2.5 text-xs font-medium text-cream-50 hover:bg-navy-800"
          >
            Add your first property
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                {/* Hide address column on mobile — too much text for 390px */}
                <th className="hidden px-4 py-3 md:table-cell">Address</th>
                <th className="px-4 py-3">Integrations</th>
                {/* Hide status on mobile — shown inline with property name */}
                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {properties.map((p) => (
                <tr key={p.id} className="hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/properties/${p.id}`}
                      className="font-medium text-navy-900 hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.nickname && (
                      <div className="text-xs text-navy-500">{p.nickname}</div>
                    )}
                    {/* Show status inline on mobile */}
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-navy-400 sm:hidden">
                      {p.status}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-navy-600 md:table-cell">
                    {p.address ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <IntegrationPill label="iCal" connected={Boolean(p.ical_url)} />
                      <IntegrationPill label="PL" connected={Boolean(p.pricelabs_listing_id)} />
                      <IntegrationPill label="Turno" connected={Boolean(p.turno_property_id)} />
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-xs uppercase tracking-wide text-navy-500 sm:table-cell">
                    {p.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IntegrationPill({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        connected ? "bg-emerald-100 text-emerald-800" : "bg-cream-100 text-navy-500"
      }`}
    >
      {label}
    </span>
  );
}
