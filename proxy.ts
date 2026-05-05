import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (err) {
    // Don't take the whole site down if Supabase is misconfigured;
    // just let the request through unauthenticated.
    console.error("[proxy] updateSession failed:", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    // Run on every page/route except static assets and image optimization
    "/((?!_next/static|_next/image|favicon.ico|api/sync|api/cron).*)",
  ],
};
