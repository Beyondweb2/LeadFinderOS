/* HIDE EARNINGS, ON THE SERVER (2026-11-10). The Team page's switch (app_metadata.hide_earnings, src/lib/teamAccounts.ts)
   was a screen rule only: the hidden salesperson's browser asked for nothing, but sales-earnings and sales-performance
   still answered with every figure to anyone who asked with that person's session. The two functions that carry a
   salesperson's own commission ask this first and send no money when it says hidden.

   ⛔ Only a SALESPERSON can be hidden; the admin's answer is never changed.
   ⛔ Unreadable = hidden. The same way the screen treats "not read yet" (viewerEarningsHidden): an unpaid salesperson
      must never be sent commission because a lookup failed. A paid one sees an error and tries again.
   The ledger, the stamps and every commission rule are untouched: switching it off shows what was always there. */
import { earningsHidden } from "../../../src/lib/teamAccounts.ts";

// deno-lint-ignore no-explicit-any
type Service = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const EARNINGS_HIDDEN_ERROR = "earnings_hidden";
export const EARNINGS_HIDDEN_DETAIL = "Earnings are switched off for this account.";

export async function salesEarningsHidden(service: Service, actor: { id: string; role: string }): Promise<boolean> {
  if (actor.role !== "sales") return false;
  try {
    const { data, error } = await service.auth.admin.getUserById(actor.id);
    if (error || !data?.user) return true;
    return earningsHidden(data.user.app_metadata as Record<string, unknown> | null | undefined);
  } catch (e) {
    console.error("[earnings-hidden] could not read the account, treating as hidden:", (e as Error).message);
    return true;
  }
}
