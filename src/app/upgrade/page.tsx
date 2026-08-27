import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  PLAN_COPY,
  PRO_PRICE_USD,
  checkoutUrl,
  getTier,
  getUsageToday,
} from "@/lib/entitlement";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [tier, usage] = await Promise.all([getTier(supabase), getUsageToday(supabase)]);
  const url = checkoutUrl(user.id);

  const rows = [
    { key: "photo_meal", label: "Photo meal scans" },
    { key: "text_meal", label: "AI meal estimates" },
    { key: "coach_chat", label: "Coach messages" },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">FitTrack Pro</h1>
        <p className="mt-1 text-sm text-muted">
          {tier === "pro"
            ? "You're on Pro. Thanks for supporting the app."
            : `Higher daily AI limits and a smarter coach, $${PRO_PRICE_USD}/month.`}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Per day</th>
              <th className="px-4 py-3 font-medium">Free</th>
              <th className="px-4 py-3 font-medium">Pro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-foreground">
                  {row.label}
                  {usage[row.key] ? (
                    <span className="ml-2 text-xs text-muted">
                      {usage[row.key]} used today
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">{PLAN_COPY.free[row.key]}</td>
                <td className="px-4 py-3 font-medium text-accent">
                  {PLAN_COPY.pro[row.key]}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3 text-foreground">Coach model</td>
              <td className="px-4 py-3 text-muted">Haiku</td>
              <td className="px-4 py-3 font-medium text-accent">Sonnet</td>
            </tr>
          </tbody>
        </table>
      </div>

      {tier === "pro" ? (
        <p className="text-sm text-muted">
          Manage or cancel your subscription from the receipt email Stripe sent
          you. If you subscribed on iPhone instead, manage it in the App Store.
        </p>
      ) : url ? (
        <>
          <a
            href={url}
            className="block w-full rounded-md bg-accent py-3 text-center text-sm font-semibold text-white hover:opacity-90"
          >
            Upgrade to Pro — ${PRO_PRICE_USD}/month
          </a>
          <p className="text-xs text-muted">
            Checkout is handled by Stripe; FitTrack never sees your card details.
            Pro applies to your account, so it works on the web app and the
            iPhone app with the same login. Access can take a few seconds to
            appear after payment.
          </p>
        </>
      ) : (
        <p className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Upgrades aren&apos;t available yet — no payment link is configured on
          this deployment.
        </p>
      )}

      <Link href="/" className="block text-sm text-muted hover:text-foreground">
        ← Back to today
      </Link>
    </div>
  );
}
