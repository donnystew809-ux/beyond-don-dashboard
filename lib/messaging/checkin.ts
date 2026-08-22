// Stay-stage logic for proactive guest check-in messages.
//
// A single "how is your stay going?" blast is worse than nothing: sending it
// to someone who checked out this morning, or who walked in an hour ago, reads
// as automated and careless. Stage is derived here (pure, no I/O) so both the
// draft prompt and the UI label agree, and so it stays unit-testable.

export type StayStage =
  | "arriving_today"
  | "checking_out_today"
  | "checking_out_tomorrow"
  | "mid_stay"
  | "not_current";

export type StayInfo = {
  stage: StayStage;
  /** 1-based day of the stay (day 1 = arrival day). */
  dayNumber: number;
  nights: number;
  nightsRemaining: number;
  label: string;
};

const DAY_MS = 86_400_000;

/** Whole days between two ISO yyyy-mm-dd dates (b - a). UTC-safe. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * Classify where a guest is in their stay, relative to `today`.
 * All args are ISO yyyy-mm-dd. Airbnb convention: check_out is the morning
 * they leave, so it is NOT a billable night.
 */
export function stayInfo(checkIn: string, checkOut: string, today: string): StayInfo {
  const nights = daysBetween(checkIn, checkOut);
  const elapsed = daysBetween(checkIn, today);
  const nightsRemaining = daysBetween(today, checkOut);
  const dayNumber = elapsed + 1;

  let stage: StayStage;
  if (elapsed < 0 || nightsRemaining < 0) stage = "not_current";
  else if (nightsRemaining === 0) stage = "checking_out_today";
  else if (elapsed === 0) stage = "arriving_today";
  else if (nightsRemaining === 1) stage = "checking_out_tomorrow";
  else stage = "mid_stay";

  const label = {
    arriving_today: "Arrived today",
    checking_out_today: "Checking out today",
    checking_out_tomorrow: "Checks out tomorrow",
    mid_stay: `Mid-stay · day ${dayNumber} of ${nights}`,
    not_current: "Not currently staying",
  }[stage];

  return { stage, dayNumber, nights, nightsRemaining, label };
}

/** What the message should actually do at each stage. Feeds the AI prompt. */
export const STAGE_INTENT: Record<Exclude<StayStage, "not_current">, string> = {
  arriving_today:
    "They arrived TODAY. Confirm they got in okay and found everything. Do NOT ask how the stay is going — they just walked in.",
  mid_stay:
    "They are in the middle of their stay. A genuine check-in: how is it going, anything they need.",
  checking_out_tomorrow:
    "They check out TOMORROW. Thank them, wish them a good last night, offer help before departure. Do NOT ask how the stay is going as if it were early.",
  checking_out_today:
    "They are checking out TODAY. Thank them and wish them safe travels. Do NOT ask how the stay is going and do NOT ask for a review.",
};
