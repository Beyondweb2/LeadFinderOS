import { useLeadCrmRow, useWrongNumber } from '@/components/LeadCrmPanel';
import { useLeadActivity } from '@/hooks/useSalesCrm';
import { lastContactOf, lastLoggedContactOf, salesStateOf, type LastContactView, type WhatsAppTouch } from '@/lib/leadState';

/* THE DATA BEHIND THE SALES STATE PILL AND THE LAST CONTACT LINE (lead state audit, 2026-09-30).
   The reading is src/lib/leadState.ts; these hooks only gather its facts from the queries every other
   lead panel already uses, so a save anywhere (notifyLeadChanged) shows here at once. Read-only.
   The many-leads version (Outreach rows) is src/hooks/useLastLoggedContacts.ts — kept apart so the list
   never imports the Work panel. */

/** One lead's sales state, last contact (logged or WhatsApp) and newest logged contact — from the CRM
 *  row (status, star, paid, meeting), the activity timeline and the Wrong number mark. Pass the newest
 *  WhatsApp message when the screen has the thread (Focus Mode); otherwise the opener's send time. */
export function useLeadSalesState(leadId: string, whatsapp?: WhatsAppTouch | null) {
  const crm = useLeadCrmRow(leadId);
  const activity = useLeadActivity(leadId);
  const wrong = useWrongNumber(leadId);
  const row = crm.data;
  const lastLogged = lastLoggedContactOf(activity.data);
  const view = row ? salesStateOf({
    ...row,
    lastLogged: lastLogged ? { outcome: lastLogged.outcomeValue ?? '', at: lastLogged.at } : null,
    wrongNumber: wrong.data?.wrong ?? null,
  }) : null;
  const wa: WhatsAppTouch | null = whatsapp ?? (row?.whatsapp_sent_at ? { direction: 'outbound', at: row.whatsapp_sent_at } : null);
  const lastContact: LastContactView | null = lastContactOf(lastLogged, wa);
  return { view, lastLogged, lastContact, row };
}
