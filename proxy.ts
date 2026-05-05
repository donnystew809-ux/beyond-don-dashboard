import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on every page/route except static assets and image optimization
    "/((?!_next/static|_next/image|favicon.ico|api/sync|api/cron).*)",
  ],
};
