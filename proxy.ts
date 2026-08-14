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
    // Run on every page/route except:
    //  - Next.js internals (_next/static, _next/image)
    //  - The sync/cron API routes (called by Vercel Cron, not by users)
    //  - The Mailgun inbound webhook (POSTed by Mailgun, authed by HMAC
    //    signature inside the route — must NOT be redirected to /login, or
    //    the guest-message pipeline never receives anything).
    //  - Any static asset by extension (png, jpg, svg, ico, webp, gif, etc.)
    //    Without the file-extension exclusion, /brand/logo.png gets 307'd to
    //    /login when the user isn't authenticated, so the login page itself
    //    can't render its own brand mark.
    "/((?!_next/static|_next/image|api/sync|api/cron|api/messages/intake|api/contracts/webhook|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|avif)$).*)",
  ],
};
