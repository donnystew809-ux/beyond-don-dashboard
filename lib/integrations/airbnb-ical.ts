// Parse an Airbnb (or any platform) iCal feed into structured reservation rows.
// Airbnb's per-listing export URL returns an .ics file with VEVENT blocks per
// reservation/blocked night. Limited data: dates, summary, reservation code in
// the description/URL. No guest names, no revenue.

import ICAL from "ical.js";

export type ParsedReservation = {
  ical_uid: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  guest_name: string | null;
  reservation_code: string | null;
  status: string | null;
  raw: { summary?: string; description?: string; url?: string };
};

export async function fetchAirbnbIcal(url: string): Promise<ParsedReservation[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseIcal(text);
}

export function parseIcal(text: string): ParsedReservation[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jcal = (ICAL as any).parse(text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comp = new (ICAL as any).Component(jcal);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = comp.getAllSubcomponents("vevent") as any[];

  const out: ParsedReservation[] = [];
  for (const ev of events) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = new (ICAL as any).Event(ev);
    if (!e.startDate || !e.endDate) continue;
    const checkIn = formatDate(e.startDate.toJSDate());
    const checkOut = formatDate(e.endDate.toJSDate());
    const summary: string = e.summary ?? "";
    const description: string = ev.getFirstPropertyValue("description") ?? "";
    const urlValue: string = ev.getFirstPropertyValue("url") ?? "";

    // Airbnb reservations have summary like "Reserved" with a reservation code
    // in the description (e.g. "Reservation URL: https://...HM12345"). Blocked
    // dates are usually summary "Not available" / "Airbnb (Not available)".
    const isBlocked = /not available|blocked/i.test(summary);
    const code = extractReservationCode(description, urlValue);

    out.push({
      ical_uid: e.uid,
      check_in: checkIn,
      check_out: checkOut,
      guest_name: null, // Airbnb iCal does not include guest names
      reservation_code: code,
      status: isBlocked ? "blocked" : "confirmed",
      raw: { summary, description, url: urlValue },
    });
  }
  return out;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function extractReservationCode(description: string, url: string): string | null {
  const match =
    description.match(/HM[A-Z0-9]{6,}/i) ?? url.match(/HM[A-Z0-9]{6,}/i);
  return match ? match[0] : null;
}
