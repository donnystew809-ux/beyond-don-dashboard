import { format, addDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 14;

export default async function PricingPage() {
  const supabase = await createClient();
  const today = new Date();
  const horizon = addDays(today, HORIZON_DAYS - 1);

  const [{ data: properties }, { data: prices }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, pricelabs_listing_id, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("prices")
      .select(
        "property_id, date, base_price, suggested_price, override_price, currency",
      )
      .gte("date", format(today, "yyyy-MM-dd"))
      .lte("date", format(horizon, "yyyy-MM-dd"))
      .order("date"),
  ]);

  const pricesByProperty = new Map<
    string,
    Map<string, NonNullable<typeof prices>[number]>
  >();
  for (const p of prices ?? []) {
    const list = pricesByProperty.get(p.property_id) ?? new Map();
    list.set(p.date, p);
    pricesByProperty.set(p.property_id, list);
  }

  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i));

  return (
    <div>
      <PageHeader
        title="Pricing review"
        description="PriceLabs suggested rates. Override individual nights when needed."
      />

      {!properties || properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          Add a property with a PriceLabs listing ID to start.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-50">
              <tr>
                <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">
                  Property
                </th>
                {days.map((d) => (
                  <th
                    key={d.toISOString()}
                    className="border-l border-neutral-100 px-2 py-2 text-center text-neutral-600"
                  >
                    <div>{format(d, "EEE")}</div>
                    <div className="text-[10px] text-neutral-400">{format(d, "M/d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const propertyPrices = pricesByProperty.get(p.id) ?? new Map();
                return (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-sm font-medium">
                      {p.name}
                      {!p.pricelabs_listing_id && (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                          not connected
                        </span>
                      )}
                    </td>
                    {days.map((d) => {
                      const key = format(d, "yyyy-MM-dd");
                      const price = propertyPrices.get(key);
                      const value =
                        price?.override_price ??
                        price?.suggested_price ??
                        price?.base_price ??
                        null;
                      const overridden = price?.override_price != null;
                      return (
                        <td
                          key={key}
                          className={`border-l border-neutral-100 px-2 py-2 text-center ${
                            overridden ? "bg-amber-50" : ""
                          }`}
                        >
                          {value != null ? (
                            <span
                              className={`text-sm ${overridden ? "font-semibold text-amber-800" : "text-neutral-800"}`}
                            >
                              {formatCurrency(Number(value), price?.currency ?? "USD")}
                            </span>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        Highlighted cells show manual overrides. Click a cell on a property page to override
        a specific night (coming next iteration).
      </p>
    </div>
  );
}
