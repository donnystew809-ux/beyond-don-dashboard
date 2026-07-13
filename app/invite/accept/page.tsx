import Link from "next/link";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  cleaner: "Cleaner",
  owner: "Owner",
  operator: "Operator",
  partner: "Partner",
};

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceClient() as any;
  const { data: invite } = token
    ? await service
        .from("invites")
        .select("email, role, property_ids, access_level, status, expires_at")
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  let propertyNames: string[] = [];
  if (invite?.property_ids?.length) {
    const { data: props } = await service
      .from("properties")
      .select("name")
      .in("id", invite.property_ids);
    propertyNames = (props ?? []).map((p: { name: string }) => p.name);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6">
      <div className="rounded-xl border border-navy-700/40 bg-navy-900/60 p-8 backdrop-blur-sm">
        <h1 className="gold-underline text-xl font-semibold text-cream-50">
          You&apos;re invited to Beyond Don
        </h1>

        {!token || !invite ? (
          <p className="mt-4 text-sm text-cream-200/70">
            This invite link is invalid or has already been used. Ask Donovan to
            re-send your invite.
          </p>
        ) : invite.status !== "pending" ? (
          <p className="mt-4 text-sm text-cream-200/70">
            This invite has already been {invite.status}. If you already have
            access, head to <Link href="/today" className="text-gold-300 underline">your dashboard</Link>.
          </p>
        ) : !user ? (
          <p className="mt-4 text-sm text-cream-200/70">
            Please open this page from the link in your invite email so we can
            confirm it&apos;s you, then you can accept.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-cream-100">
              You&apos;ve been invited as{" "}
              <span className="font-semibold text-gold-300">
                {ROLE_LABEL[invite.role] ?? invite.role}
              </span>
              {propertyNames.length > 0 && (
                <>
                  {" "}for{" "}
                  <span className="font-medium">{propertyNames.join(", ")}</span>
                </>
              )}
              .
            </p>
            <p className="mt-2 text-xs text-cream-200/50">
              Accepting adds these to your account. You can always be updated
              later by an admin.
            </p>
            <div className="mt-6">
              <AcceptButton token={token} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
