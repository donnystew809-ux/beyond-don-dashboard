import { redirect } from "next/navigation";

// The pricing review grid was superseded by the Revenue cockpit (Phase 4).
// Keep the route alive as a redirect so old bookmarks and links land well.
export default function PricingRedirect() {
  redirect("/revenue");
}
