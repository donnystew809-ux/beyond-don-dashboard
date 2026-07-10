// Pricing engine abstraction.
//
// The whole point of this file: today PriceLabs is our pricing brain, but
// Donovan wants to eventually replace it with our own in-house model. So the
// rest of the app must NEVER call PriceLabs directly for suggestions/pushes —
// it goes through this interface. Swapping engines later = writing a second
// implementation and changing getPricingEngine(), nothing else.
//
// PriceLabsEngine is the sole implementation now, wrapping lib/integrations/
// pricelabs.ts. A future InHouseEngine would implement the same interface
// using our own portfolio data + a market-data source.

import {
  fetchPriceLabsDays,
  pushPriceLabsOverrides,
  type PriceLabsDay,
} from "@/lib/integrations/pricelabs";

/** One day of pricing truth for a listing, engine-agnostic. */
export type EngineDay = {
  date: string; // yyyy-mm-dd
  /** The engine's recommended price with no human override applied. */
  suggested: number | null;
  /** The price currently live (a human/auto override), if any. */
  current: number | null;
  /** The engine's base/anchor price. */
  base: number | null;
  bookingStatus: "free" | "booked" | "checkin";
  adr: number | null;
  minStay: number | null;
  currency: string;
};

export type PriceOverride = { date: string; price: number };

/**
 * Market context for a listing — occupancy/comp signals an engine can expose.
 * Optional because PriceLabs' Customer API doesn't surface a clean market
 * feed; the in-house engine will. Callers must handle `null`.
 */
export type MarketContext = {
  medianCompPrice: number | null;
  marketOccupancy: number | null;
} | null;

export interface PricingEngine {
  /** Stable identifier, surfaced in the UI ("Powered by …") and audit logs. */
  readonly name: string;

  /** Daily suggestions for one or more listings, keyed by listing id. */
  getSuggestions(
    listings: Array<{ id: string; pms: string }>,
  ): Promise<Map<string, EngineDay[]>>;

  /** Push date-specific overrides. Returns raw response text for audit. */
  pushPrices(
    listingId: string,
    overrides: PriceOverride[],
    pms?: string,
  ): Promise<string>;

  /** Market context for a listing, or null when the engine can't provide it. */
  getMarketContext(listingId: string): Promise<MarketContext>;
}

class PriceLabsEngine implements PricingEngine {
  readonly name = "PriceLabs";

  async getSuggestions(listings: Array<{ id: string; pms: string }>) {
    const raw = await fetchPriceLabsDays(listings);
    const out = new Map<string, EngineDay[]>();
    for (const [id, days] of raw) {
      out.set(id, days.map(toEngineDay));
    }
    return out;
  }

  async pushPrices(listingId: string, overrides: PriceOverride[], pms = "airbnb") {
    return pushPriceLabsOverrides(listingId, overrides, pms);
  }

  async getMarketContext(): Promise<MarketContext> {
    // PriceLabs Customer API has no clean market feed. The in-house engine
    // will fill this in; until then callers must handle null.
    return null;
  }
}

function toEngineDay(d: PriceLabsDay): EngineDay {
  return {
    date: d.date,
    suggested: d.suggested_price,
    current: d.override_price,
    base: d.base_price,
    bookingStatus: d.booking_status,
    adr: d.adr,
    minStay: d.min_stay,
    currency: d.currency,
  };
}

// Single instance; swap this factory to change engines app-wide.
const engine: PricingEngine = new PriceLabsEngine();

export function getPricingEngine(): PricingEngine {
  return engine;
}
