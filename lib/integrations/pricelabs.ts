// PriceLabs Customer API client.
// Base: https://api.pricelabs.co/v1
// Auth: header X-API-Key
//
// Verified endpoints (Swagger docs at app.swaggerhub.com → Customer_API):
//   GET  /v1/listings                        list all account listings
//   GET  /v1/listings/{id}                   single listing details
//   POST /v1/listing_prices                  daily price + booking status per listing
//   GET  /v1/listings/{id}/overrides         current date-specific overrides (DSO)
//   POST /v1/listings/{id}/overrides         add/update DSO
//   DELETE /v1/listings/{id}/overrides       delete DSO
//   GET  /v1/reservation_data                reservations from connected PMS
//
// The /v1/listing_prices endpoint returns daily rows including:
//   { date, price, user_price, uncustomized_price, min_stay,
//     booking_status: "" | "Booked" | "Booked (Check-In)",
//     ADR, demand_color, demand_desc, ... }
// user_price is -1 if no customer override, otherwise the override price.

const BASE = "https://api.pricelabs.co/v1";

function headers() {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) throw new Error("PRICELABS_API_KEY is not set");
  return {
    "X-API-Key": key,
    "Content-Type": "application/json",
  };
}

export type PriceLabsListing = {
  id: string;
  pms: string;
  name: string;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  base_price: number | null;
};

export async function fetchPriceLabsListings(): Promise<PriceLabsListing[]> {
  const res = await fetch(`${BASE}/listings`, { headers: headers() });
  if (!res.ok) throw new Error(`PriceLabs listings ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(data) ? data : (data.listings ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((row: any) => ({
    id: String(row.id),
    pms: row.pms ?? "airbnb",
    name: row.name ?? "",
    city: row.city_name ?? null,
    state: row.state ?? null,
    bedrooms: numberOrNull(row.no_of_bedrooms),
    base_price: numberOrNull(row.base),
  }));
}

export type PriceLabsDay = {
  date: string;
  suggested_price: number | null;
  override_price: number | null;
  base_price: number | null;
  booking_status: "free" | "booked" | "checkin";
  adr: number | null;
  min_stay: number | null;
  currency: string;
};

export async function fetchPriceLabsDays(
  listings: Array<{ id: string; pms: string }>,
): Promise<Map<string, PriceLabsDay[]>> {
  if (listings.length === 0) return new Map();
  const res = await fetch(`${BASE}/listing_prices`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ listings }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PriceLabs listing_prices ${res.status}: ${text}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json();
  const out = new Map<string, PriceLabsDay[]>();

  for (const row of data) {
    if (row.error) {
      // listing toggle off, no permission, etc — skip but don't fail the batch
      continue;
    }
    const days: PriceLabsDay[] = (row.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => {
        const userPrice = numberOrNull(d.user_price);
        return {
          date: String(d.date ?? "").slice(0, 10),
          suggested_price: numberOrNull(d.uncustomized_price),
          override_price: userPrice && userPrice > 0 ? userPrice : null,
          base_price: numberOrNull(d.price),
          booking_status: parseBookingStatus(d.booking_status),
          adr: numberOrNull(d.ADR),
          min_stay: numberOrNull(d.min_stay),
          currency: row.currency ?? "USD",
        };
      })
      .filter((d: PriceLabsDay) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));

    out.set(String(row.id), days);
  }
  return out;
}

export async function pushPriceLabsOverride(
  listingId: string,
  date: string,
  price: number,
  pms = "airbnb",
): Promise<void> {
  await pushPriceLabsOverrides(listingId, [{ date, price }], pms);
}

/**
 * Push many date overrides in a single request. PriceLabs accepts an array.
 * Returns the raw response text for audit logging.
 */
export async function pushPriceLabsOverrides(
  listingId: string,
  overrides: Array<{ date: string; price: number }>,
  pms = "airbnb",
): Promise<string> {
  if (overrides.length === 0) return "no overrides";
  const body = { overrides, pms };
  const res = await fetch(
    `${BASE}/listings/${encodeURIComponent(listingId)}/overrides`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PriceLabs override ${res.status}: ${text}`);
  }
  return text;
}

function parseBookingStatus(value: unknown): "free" | "booked" | "checkin" {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("check-in")) return "checkin";
  if (v.includes("book")) return "booked";
  return "free";
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
