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
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Add property
          </Link>
        }
      />

      {!properties || properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-600">
            No properties yet. Add one to start syncing data.
          </p>
          <Link
            href="/settings/properties/new"
            className="mt-3 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Add your first property
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Integrations</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {properties.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/properties/${p.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.nickname && (
                      <div className="text-xs text-neutral-500">{p.nickname}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.address ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <IntegrationPill
                        label="iCal"
                        connected={Boolean(p.ical_url)}
                      />
                      <IntegrationPill
                        label="PriceLabs"
                        connected={Boolean(p.pricelabs_listing_id)}
                      />
                      <IntegrationPill
                        label="Turno"
                        connected={Boolean(p.turno_property_id)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">
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

function IntegrationPill({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        connected
          ? "bg-emerald-100 text-emerald-800"
          : "bg-neutral-100 text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}
