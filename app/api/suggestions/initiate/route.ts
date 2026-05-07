import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Central dispatcher — receives { type, payload } and routes to the right action
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, payload } = await req.json();

  try {
    switch (type) {
      // ── Apply suggested prices for a property ──────────────────────────────
      case "apply_prices": {
        const { property_id } = payload;
        const baseUrl = req.nextUrl.origin;
        const res = await fetch(`${baseUrl}/api/pricing/apply-suggested`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({ property_id }),
        });
        const json = await res.json();
        if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status });
        return NextResponse.json({ message: `Prices applied for property` });
      }

      // ── Toggle auto-pricing ON for a property ──────────────────────────────
      case "toggle_auto_pricing": {
        const { property_id } = payload;
        const baseUrl = req.nextUrl.origin;
        const res = await fetch(`${baseUrl}/api/pricing/auto-toggle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({ property_id, enabled: true }),
        });
        const json = await res.json();
        if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status });
        return NextResponse.json({ message: "Auto-pricing enabled!" });
      }

      // ── Trigger a sync (airbnb-ical, pricelabs, turno) ────────────────────
      case "run_sync": {
        const { source } = payload as { source: string };
        const validSources = ["airbnb-ical", "pricelabs", "turno"];
        if (!validSources.includes(source)) {
          return NextResponse.json({ error: "Invalid source" }, { status: 400 });
        }
        const baseUrl = req.nextUrl.origin;
        const secret = process.env.CRON_SECRET ?? "";
        const res = await fetch(`${baseUrl}/api/sync/${source}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${secret}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return NextResponse.json({ error: json.error ?? "Sync failed" }, { status: 500 });
        return NextResponse.json({
          message: `${source} sync triggered — ${json.synced ?? "running"}`,
        });
      }

      // ── Apply last-minute discount for a property ──────────────────────────
      // Pushes a discounted price to PriceLabs for dates within N days that are vacant
      case "apply_last_minute_discount": {
        const { property_id, discount_pct = 20, days = 7 } = payload;

        // Get property PriceLabs ID
        const { data: prop } = await supabase
          .from("properties")
          .select("pricelabs_listing_id, name")
          .eq("id", property_id)
          .single();

        if (!prop?.pricelabs_listing_id) {
          return NextResponse.json({ error: "No PriceLabs listing ID configured" }, { status: 400 });
        }

        // Get current prices for the next N days
        const today = new Date();
        const until = new Date(today);
        until.setDate(until.getDate() + days);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        const { data: prices } = await supabase
          .from("prices")
          .select("date, base_price, suggested_price, override_price")
          .eq("property_id", property_id)
          .gte("date", fmt(today))
          .lte("date", fmt(until));

        // Get reservations in that range (so we don't discount booked dates)
        const { data: reservations } = await supabase
          .from("reservations")
          .select("check_in, check_out")
          .eq("property_id", property_id)
          .gte("check_out", fmt(today))
          .lte("check_in", fmt(until));

        // Build set of booked dates
        const booked = new Set<string>();
        for (const r of reservations ?? []) {
          const ci = new Date(r.check_in);
          const co = new Date(r.check_out);
          for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
            booked.add(fmt(d));
          }
        }

        // Build discounted overrides for vacant dates
        const overrides: Array<{ date: string; price: number }> = [];
        for (const p of prices ?? []) {
          if (booked.has(p.date)) continue;
          const base = p.suggested_price ?? p.base_price;
          if (!base) continue;
          const discounted = Math.round(Number(base) * (1 - discount_pct / 100));
          overrides.push({ date: p.date, price: discounted });
        }

        if (overrides.length === 0) {
          return NextResponse.json({ message: "No vacant dates found in range — already booked!" });
        }

        // Push to PriceLabs
        const plKey = process.env.PRICELABS_API_KEY;
        if (!plKey) {
          return NextResponse.json({ error: "PriceLabs API key not configured" }, { status: 500 });
        }

        const plRes = await fetch(
          `https://api.pricelabs.co/v1/listings/${prop.pricelabs_listing_id}/prices`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": plKey,
            },
            body: JSON.stringify({
              prices: overrides.map((o) => ({
                date: o.date,
                price: o.price,
                min_stay: 1,
              })),
            }),
          }
        );

        if (!plRes.ok) {
          const err = await plRes.text();
          return NextResponse.json({ error: `PriceLabs error: ${err}` }, { status: 500 });
        }

        // Log overrides — match the pricing_override_log schema exactly
        await supabase.from("pricing_override_log").insert(
          overrides.map((o) => ({
            property_id,
            date: o.date,
            new_price: o.price,
            source: "manual" as const,
            pushed_by: user.id,
          }))
        );

        return NextResponse.json({
          message: `${discount_pct}% discount applied to ${overrides.length} vacant date${overrides.length > 1 ? "s" : ""}`,
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action type" }, { status: 400 });
    }
  } catch (e) {
    console.error("[suggestions/initiate]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
