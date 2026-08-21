import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/* ══ WHO FILLED IN MY FORM? ═══════════════════════════════════════════════════════════════════
   ⛔ WHAT THIS REPLACES: running SQL. onboarding_responses is read by no operator page, so the
   ONLY way to see a submission was a query — and the notification email was the only thing that
   ever told anyone one had happened.

   ⛔ EMAIL IS SINGLE-CHANNEL AND LOAD-BEARING, WHICH IS THE REAL FAULT. Retrying a failed send
   (notify-onboarding-submit, 3 attempts) makes failure visible and recoverable; it does not make
   a delivered email arrive in the right inbox. A notification can be accepted by the provider and
   still land in spam, and until now that was indistinguishable from nobody having filled the form
   in at all.

   ⛔ AND dashboardTasks CANNOT COVER THIS. Its chase task is keyed on a LEAD (onboarding.get(l.id))
   and only fires after a day, so a submission with no lead_id — the generic path, which is how the
   second of the two real rows arrived — has no trace anywhere in the app. This reads the table
   itself, so a lead-less submission is visible the moment it lands.

   ⚠️ READ WITH THE USER'S OWN SESSION, so RLS decides what is visible. If the policy denies it the
   result is an empty list, not an error (§4: RLS returns 200 with []) — which is why `error` below
   is surfaced rather than swallowed, and why an empty list says "none yet" rather than "all clear".
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

export interface SubmissionRow {
  id: string;
  lead_id: string | null;
  business_name: string | null;
  contact_email: string | null;
  confirmed_location: string | null;
  /** Q2 answers. Read ONLY to decide whether the second questionnaire is done — see needsQ2. */
  services: string | null;
  business_address: string | null;
  status: string | null;
  incomplete: boolean | null;
  created_at: string;
  notify_sent_at: string | null;
  notify_attempts: number | null;
  notify_error: string | null;
  /* From the linked lead (the endpoint joins outreach_leads). The per-row nudge needs a phone —
     send-whatsapp-message resolves nothing from a lead_id — and amount_paid to know if the lead
     itself is paid. All null when there is no lead attached. */
  lead_phone: string | null;
  lead_country: string | null;
  lead_contact_name: string | null;
  lead_amount_paid: number | null;
  /** Has questionnaire_followup already gone to this lead (one per lead, no repeats). */
  followup_sent: boolean;
}

/** How the notification for a submission actually ended up. Derived, never stored. */
export type NotifyState = 'delivered' | 'pending' | 'failed' | 'retired';

/** Rows the notifier retired on purpose. They are NOT failures and must not be shown as such. */
const RETIRED_PREFIXES = ['not sent:', 'outcome not recorded'];

/**
 * ⛔ FOUR STATES, AND THE FOURTH IS WHY THIS IS NOT A BOOLEAN. "No delivery" covers a send still
 * waiting for its 20-minute window, a send that used every attempt and failed, and a row retired
 * deliberately because they paid inside the window. Collapsing those would either cry wolf about
 * a normal payment or hide a genuinely lost notification among them.
 *
 * ⚠️ The absent case is explicit: no attempts and no delivery is 'pending', never 'failed'.
 */
export function notifyStateFor(r: Pick<SubmissionRow, 'notify_sent_at' | 'notify_attempts' | 'notify_error'>,
                               maxAttempts = 3): NotifyState {
  if (r.notify_sent_at) return 'delivered';
  const err = (r.notify_error ?? '').trim().toLowerCase();
  if (err && RETIRED_PREFIXES.some((p) => err.startsWith(p))) return 'retired';
  if ((r.notify_attempts ?? 0) >= maxAttempts) return 'failed';
  return 'pending';
}

/** Paid is amount_paid > 0 everywhere (§6); on this table the status carries it. */
const PAID_STATUSES = new Set(['paid', 'payment_received', 'in_delivery', 'completed']);
export const isPaidSubmission = (r: SubmissionRow) => PAID_STATUSES.has(String(r.status ?? ''));

/** The LINKED LEAD is paid (amount_paid > 0). Distinct from isPaidSubmission: a lead can be paid
 *  while this particular submission row's status is not paid-class (e.g. an early answers_saved
 *  row for a customer who has since paid). The nudge and the bulk-delete protection both treat a
 *  row as paid if EITHER is true — same rule the server enforces. */
export const isLeadPaid = (r: SubmissionRow) => (r.lead_amount_paid ?? 0) > 0;

/**
 * ⛔ PAID, AND THE SECOND QUESTIONNAIRE IS STILL OUTSTANDING — its own state, never mixed in.
 * This is the one that costs money to miss: no confirmed town and no services means
 * startPaidBaseline defers, so there is no week-eight measurement, so the guarantee cannot be
 * delivered and the exposure is a refund. Finding that out at week eight is finding out too late.
 *
 * ⚠️ DERIVED FROM THE ANSWERS, NOT STORED. Same rule as serveGate: a stored "q2_done" flag would
 * freeze old rows against a stale definition and let the readers drift. The three fields are
 * exactly the ones Q2 makes required, so "we have them" and "they finished" cannot disagree.
 *
 * ⚠️ Unpaid rows are NOT in this state. Someone who has not paid has nothing outstanding — they
 * are a chase about money, which the card already shows separately.
 */
export function needsQ2(r: SubmissionRow): boolean {
  if (!isPaidSubmission(r)) return false;
  const has = (v: string | null) => !!(v ?? '').trim();
  return !(has(r.confirmed_location) && has(r.services) && has(r.business_address));
}

/** Whole days since payment-era submission — what the day 2 / day 5 / day 7 chase counts. */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export function useSubmissions(limit = 25) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['submissions', user?.id, limit],
    queryFn: async (): Promise<SubmissionRow[]> => {
      /* ⛔ THROUGH THE ENDPOINT, NOT .from('onboarding_responses'). The table has RLS enabled with
         NO policies, so a direct read returns 200 with [] — a card that silently claims nobody has
         ever filled the form in. See the endpoint's own header. */
      const { data: res, error: e } = await supabase.functions.invoke('submissions', { body: { limit } });
      if (e) throw new Error(e.message);
      if (!res?.ok) throw new Error(res?.error ?? 'could not load submissions');
      return (res.rows ?? []) as SubmissionRow[];
    },
    enabled: !!user?.id,
  });

  const rows = useMemo(() => data ?? [], [data]);

  /* The two counts worth putting on a card: how many have not paid, and how many the email did not
     reach. Both derived here so the card renders and does not decide. */
  const summary = useMemo(() => {
    let unpaid = 0, undelivered = 0, awaitingQ2 = 0;
    for (const r of rows) {
      if (!isPaidSubmission(r)) unpaid += 1;
      if (notifyStateFor(r) === 'failed') undelivered += 1;
      /* Counted separately and shown first: a paid customer whose delivery cannot start is the
         only row here with a refund attached to it. */
      if (needsQ2(r)) awaitingQ2 += 1;
    }
    return { total: rows.length, unpaid, undelivered, awaitingQ2 };
  }, [rows]);

  /* Delete rows through the endpoint (never a direct .delete() — RLS-no-policy would 200 and
     remove nothing). `allowPaid` is set ONLY by the per-row single-delete confirm; the bulk
     buttons leave it false so the server skips paid rows. Returns the server's counts so the
     card can report what was kept. Refetches on success. */
  const deleteRows = async (ids: string[], allowPaid = false): Promise<{ deleted: number; skippedPaid: number }> => {
    const { data: res, error: e } = await supabase.functions.invoke('submissions', {
      body: { action: 'delete', ids, allow_paid: allowPaid },
    });
    if (e) throw new Error(e.message);
    if (!res?.ok) throw new Error(res?.error ?? 'delete failed');
    await refetch();
    return { deleted: Number(res.deleted) || 0, skippedPaid: Number(res.skipped_paid) || 0 };
  };

  return {
    rows,
    summary,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    deleteRows,
  };
}
