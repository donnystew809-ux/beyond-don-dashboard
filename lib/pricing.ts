// Shared logic for applying PriceLabs suggested prices to a property.
// Used by /api/pricing/apply-suggested (manual) and /api/sync/auto-pricing (cron).

import { pushPriceLabsOverrides } from "@/lib/integrations/pricelabs";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplySuggestedResult = {
  property_id: string;
  property_name: string;
  pushed: number;
  skipped: number;
  errors: string[];
  details: Array<{
    date: string;
    old_price: number | null;
    new_price: number;
    reason?: string;
  }>;
};

export async function applySuggestedPrices(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>;
  property: {
    id: string;
    name: string;
    pricelabs_listing_id: string | null;
    auto_accept_max_deviation_pct?: number | null;
    auto_accept_min_price?: number | null;
    auto_accept_max_price?: number | null;
  };
  startDate: string; // yyyy-mm-dd
  endDate: string;
  source: "manual" | "auto_cron";
  userId?: string | null;
  pms?: string;
}): Promise<ApplySuggestedResult> {
  const result: ApplySuggestedResult = {
    property_id: opts.property.id,
    property_name: opts.property.name,
    pushed: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  if (!opts.property.pricelabs_listing_id) {
    result.errors.push("property has no pricelabs_listing_id");
    return result;
  }

  // Pull our cached prices for the date window
  const { data: rows, error } = await opts.service
    .from("prices")
    .select("date, suggested_price, base_price, override_price")
    .eq("property_id", opts.property.id)
    .gte("date", opts.startDate)
    .lte("date", opts.endDate)
    .order("date", { ascending: true });

  if (error) {
    result.errors.push(`db: ${error.message}`);
    return result;
  }
  if (!rows || rows.length === 0) {
    result.errors.push("no cached price rows in this window — run pricelabs sync first");
    return result;
  }

  // Determine guardrail bounds
  const baseFromRows = rows.find((r) => r.base_price)?.base_price ?? null;
  const deviationPct = opts.property.auto_accept_max_deviation_pct ?? 25;
  const minBound =
    opts.property.auto_accept_min_price ??
    (baseFromRows ? Number(baseFromRows) * (1 - deviationPct / 100) : null);
  const maxBound =
    opts.property.auto_accept_max_price ??
    (baseFromRows ? Number(baseFromRows) * (1 + deviationPct / 100) : null);

  const toPush: Array<{ date: string; price: number; old: number | null }> = [];
  for (const r of rows) {
    const suggested = r.suggested_price != null ? Number(r.suggested_price) : null;
    const override = r.override_price != null ? Number(r.override_price) : null;
    if (suggested == null || suggested <= 0) {
      result.skipped++;
      result.details.push({ date: r.date, old_price: override, new_price: 0, reason: "no suggested" });
      continue;
    }
    // No-op if override already matches (within $1)
    if (override != null && Math.abs(override - suggested) < 1) {
      result.skipped++;
      result.details.push({ date: r.date, old_price: override, new_price: suggested, reason: "already at suggested" });
      continue;
    }
    // Auto guardrails (only enforced for cron; manual respects them too as safety)
    if (minBound != null && suggested < minBound) {
      result.skipped++;
      result.details.push({ date: r.date, old_price: override, new_price: suggested, reason: `below min ${minBound.toFixed(0)}` });
      continue;
    }
    if (maxBound != null && suggested > maxBound) {
      result.skipped++;
      result.details.push({ date: r.date, old_price: override, new_price: suggested, reason: `above max ${maxBound.toFixed(0)}` });
      continue;
    }
    toPush.push({ date: r.date, price: Math.round(suggested), old: override });
  }

  if (toPush.length === 0) {
    return result;
  }

  // Push in a single bulk request
  let response = "";
  try {
    response = await pushPriceLabsOverrides(
      opts.property.pricelabs_listing_id,
      toPush.map(({ date, price }) => ({ date, price })),
      opts.pms ?? "airbnb",
    );
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "push failed");
    return result;
  }

  // Persist each as an override + log row
  const overrideUpdates = toPush.map((p) => ({
    property_id: opts.property.id,
    date: p.date,
    override_price: p.price,
    source: "auto",
    synced_at: new Date().toISOString(),
  }));

  // Best-effort upsert into prices (override_price column)
  for (const u of overrideUpdates) {
    await opts.service
      .from("prices")
      .update({ override_price: u.override_price, synced_at: u.synced_at })
      .eq("property_id", u.property_id)
      .eq("date", u.date);
  }

  await opts.service.from("pricing_override_log").insert(
    toPush.map((p) => ({
      property_id: opts.property.id,
      date: p.date,
      old_price: p.old,
      new_price: p.price,
      source: opts.source,
      pushed_by: opts.userId ?? null,
      pricelabs_response: response.slice(0, 1000),
    })),
  );

  result.pushed = toPush.length;
  result.details.push(
    ...toPush.map((p) => ({
      date: p.date,
      old_price: p.old,
      new_price: p.price,
    })),
  );
  return result;
}
