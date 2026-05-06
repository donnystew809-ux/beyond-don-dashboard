import { format, addDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";
import { AutoPricingControls } from "./_components/auto-pricing-controls";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 14;

export default async function PricingPage() {
  const supabase = await createClient();
  const today = new Date();
  const horizon = addDays(today, HORIZON_DAYS - 1);

  const [{ data: properties }, { data: prices }] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, pricelabs_listing_id, status, auto_accept_pricing, auto_accept_max_deviation_pct, auto_accept_horizon_days, auto_accept_min_price, auto_accept_max_price",
      )
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

  type PropertyRow = {
    id: string;
    name: string;
    pricelabs_listing_id: string | null;
    status: string;
    auto_accept_pricing: boolean | null;
    auto_accept_max_deviation_pct: number | null;
    auto_accept_horizon_days: number | null;
    auto_accept_min_price: number | null;
    auto_accept_max_price: number | null;
  };
  type PriceRow = {
    property_id: string;
    date: string;
    base_price: number | null;
    suggested_price: number | null;
    override_price: number | null;
    currency: string | null;
  };
  const propertyRows = (properties ?? []) as unknown as PropertyRow[];
  const priceRows = (prices ?? []) as unknown as PriceRow[];

  const pricesByProperty = new Map<string, Map<string, PriceRow>>();
  for (const p of priceRows) {
    const list = pricesByProperty.get(p.property_id) ?? new Map();
    list.set(p.date, p);
    pricesByProperty.set(p.property_id, list);
  }

  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i));

  return (
    <div>
      <PageHeader
        title="Pricing review"
        description="PriceLabs suggested rates. Apply manually or flip Auto on per property."
      />

      <div className="mb-6 rounded-lg border border-gold-300 bg-gold-50 p-4 text-sm text-navy-800">
        <strong className="text-gold-800">How auto-pricing works:</strong>{" "}
        With Auto on, the dashboard pushes PriceLabs&apos; suggested prices to
        Airbnb every morning at 9:30am for the next N days. Guardrails (deviation
        %, min/max price) prevent runaway suggestions. Click <em>Config</em> per
        row to tune. Click <em>Apply</em> for a one-shot manual push.
      </div>

      {propertyRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-white p-10 text-center text-sm text-navy-500">
          Add a property with a PriceLabs listing ID to start.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-cream-50">
              <tr>
                <th className="sticky left-0 z-10 bg-cream-50 px-3 py-2 text-left font-medium text-navy-600">
                  Property
                </th>
                {days.map((d) => (
                  <th
                    key={d.toISOString()}
                    className="border-l border-cream-200 px-2 py-2 text-center text-navy-600"
                  >
                    <div>{format(d, "EEE")}</div>
                    <div className="text-[10px] text-navy-400">{format(d, "M/d")}</div>
                  </th>
                ))}
                <th className="border-l border-cream-200 px-3 py-2 text-right font-medium text-navy-600">
                  Auto
                </th>
              </tr>
            </thead>
            <tbody>
              {propertyRows.map((p) => {
                const propertyPrices = pricesByProperty.get(p.id) ?? new Map();
                return (
                  <tr key={p.id} className="border-t border-cream-200">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-sm font-medium">
                      {p.name}
                      {!p.pricelabs_listing_id && (
                        <span className="ml-2 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold-800">
                          not connected
                        </span>
                      )}
                      {p.auto_accept_pricing && (
                        <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-green-800">
                          auto on
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
                          className={`border-l border-cream-200 px-2 py-2 text-center ${
                            overridden ? "bg-gold-50" : ""
                          }`}
                        >
                          {value != null ? (
                            <span
                              className={`text-sm ${overridden ? "font-semibold text-gold-800" : "text-navy-800"}`}
                            >
                              {formatCurrency(Number(value), price?.currency ?? "USD")}
                            </span>
                          ) : (
                            <span className="text-navy-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l border-cream-200 px-3 py-2 text-right">
                      <AutoPricingControls property={p} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-navy-500">
        Highlighted cells = manual or auto overrides. Gold = an override is in
        place. Audit trail in <code>pricing_override_log</code>.
      </p>
    </div>
  );
}
