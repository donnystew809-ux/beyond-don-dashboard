// Airbnb notification-email parser.
//
// Mailgun's inbound webhook delivers the email pre-parsed (subject, sender,
// stripped-text, Reply-To, etc.). This module extracts the Airbnb-specific
// facts the pipeline needs: guest name, reservation code, property hint,
// the actual message body, and the reply-relay address.
//
// Airbnb's email format is NOT a stable API — it changes. Every extractor
// here is defensive, and the intake route stores the raw payload in
// message_audit so any format change can be diagnosed and replayed.

export type ParsedGuestEmail = {
  guestFirstName: string | null;
  reservationCode: string | null; // e.g. HMABCD1234
  propertyHint: string | null;    // free-text listing-name hint, if present
  body: string | null;            // the guest's message text
  replyTo: string | null;         // *@reply.airbnb.com relay address
  messageId: string | null;       // for In-Reply-To threading on our reply
  subject: string;
  isAirbnbNotification: boolean;
};

/** Mailgun inbound POST fields we consume (multipart/form-data keys). */
export type MailgunInboundFields = {
  subject?: string;
  from?: string;
  sender?: string;
  "body-plain"?: string;
  "stripped-text"?: string;
  "Message-Id"?: string;
  "message-headers"?: string; // JSON array of [name, value]
};

const RESERVATION_CODE_RE = /\bHM[A-Z0-9]{6,12}\b/;

// Subject shapes seen from Airbnb notifications over the years. Order matters.
const GUEST_NAME_PATTERNS: RegExp[] = [
  /^Re:\s*(?:.*?from\s+)?([A-Z][a-zA-Z'’-]+)/,     // "Re: ... from Sara"
  /New message from ([A-Z][a-zA-Z'’-]+)/i,          // "New message from Sara"
  /([A-Z][a-zA-Z'’-]+) sent you a message/i,        // "Sara sent you a message"
  /Message from ([A-Z][a-zA-Z'’-]+)/i,
  /Inquiry from ([A-Z][a-zA-Z'’-]+)/i,
  /([A-Z][a-zA-Z'’-]+) has a question/i,
];

// Lines Airbnb appends under the actual message — everything from the first
// footer marker onward is dropped.
const FOOTER_MARKERS = [
  "Reply to this email",
  "Respond to ",
  "Visit your inbox",
  "Sent with ",
  "Airbnb, Inc.",
  "Get the app",
  "©",
];

export function parseAirbnbNotification(
  fields: MailgunInboundFields,
): ParsedGuestEmail {
  const subject = fields.subject ?? "";
  const rawBody = fields["stripped-text"] ?? fields["body-plain"] ?? "";
  const headers = parseHeaders(fields["message-headers"]);

  const fromLine = `${fields.from ?? ""} ${fields.sender ?? ""}`;
  const replyToHeader = headers.get("reply-to") ?? "";
  // Reply-relay address: prefer the Reply-To header; fall back to any
  // *@reply.airbnb.com address found in the body.
  const replyTo =
    extractEmail(replyToHeader, /@reply\.airbnb\.com/i) ??
    extractEmail(rawBody, /@reply\.airbnb\.com/i);

  // Detection has to survive FORWARDING, which is how every real message
  // reaches us. Plenty of providers (Outlook, and anything using SRS to keep
  // SPF passing) rewrite From/Sender to the forwarding mailbox — a
  // header-only check would then mark every forwarded Airbnb notification
  // "not_airbnb" and silently drop it. That failure looks exactly like "no
  // guest wrote in," so it could burn the entire shadow-mode window before
  // anyone noticed. Accept body-level evidence too: the *@reply.airbnb.com
  // relay address, or the original airbnb.com From line that forwards quote
  // inline. False positives are cheap (private catch-all address, drafts are
  // review-only); false negatives are invisible.
  const fromAirbnb =
    /airbnb\.com/i.test(fromLine) ||
    /reply\.airbnb\.com/i.test(replyToHeader) ||
    replyTo !== null ||
    /airbnb\.com/i.test(rawBody);

  const reservationCode =
    subject.match(RESERVATION_CODE_RE)?.[0] ??
    rawBody.match(RESERVATION_CODE_RE)?.[0] ??
    null;

  let guestFirstName: string | null = null;
  for (const re of GUEST_NAME_PATTERNS) {
    const m = subject.match(re);
    if (m) {
      guestFirstName = m[1];
      break;
    }
  }

  // Airbnb sends far more than guest messages to the same address: payout
  // notices, review requests, marketing. The inbox rule that feeds us matches
  // "airbnb.com anywhere in subject or body," so all of that arrives here too.
  // Treating it all as a guest message would spawn junk threads and drafts, so
  // require positive evidence that a human actually wrote something: either the
  // *@reply.airbnb.com relay address (only present on real message threads) or
  // a subject in the "New message from <Name>" family. Payout and review mail
  // has neither and is skipped.
  const looksLikeGuestMessage = replyTo !== null || guestFirstName !== null;
  const isAirbnbNotification = fromAirbnb && looksLikeGuestMessage;

  return {
    guestFirstName,
    reservationCode,
    propertyHint: extractPropertyHint(subject, rawBody),
    body: extractMessageBody(rawBody),
    replyTo,
    messageId: headers.get("message-id") ?? fields["Message-Id"] ?? null,
    subject,
    isAirbnbNotification,
  };
}

function parseHeaders(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  try {
    const arr = JSON.parse(raw) as Array<[string, string]>;
    for (const [name, value] of arr) map.set(name.toLowerCase(), value);
  } catch {
    // header blob unparseable — extractors fall back to body scans
  }
  return map;
}

function extractEmail(text: string, domainRe: RegExp): string | null {
  const candidates = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
  return candidates.find((e) => domainRe.test(e)) ?? null;
}

function extractPropertyHint(subject: string, body: string): string | null {
  // "… for Sweet Suite Escape" / "at The Caramel Cabin" in subject,
  // else the first quoted listing name in the body.
  const m =
    subject.match(/(?:for|at)\s+["“]?([A-Z][^"”·\n]{3,60})["”]?\s*$/) ??
    body.match(/(?:your listing|reservation at)\s+["“]?([^"”\n]{3,60})["”]?/i);
  return m ? m[1].trim() : null;
}

function extractMessageBody(raw: string): string | null {
  if (!raw.trim()) return null;
  let text = raw;
  for (const marker of FOOTER_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx > 0) text = text.slice(0, idx);
  }
  // Drop leading notification boilerplate lines ("You have a new message…").
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(you have a new message|new message from|translate)/i.test(l));
  const body = lines.join("\n").trim();
  return body.length > 0 ? body : null;
}
