/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE COLUMNS THE LEAD LIST DOWNLOADS  (2026-09-27, site-wide speed pass)

   useOutreach used to `select('*')` — all 111 columns of ~5,300 leads, 15.7 MB of JSON, ~3 KB per
   lead, two-thirds of it repeated key names — on every visit to Outreach and Find Leads, and in
   every Coverage niche row. The list reads 41 of them. These are those 41.

   ⛔ A COLUMN LEFT OUT OF THIS LIST ARRIVES AS `undefined`, SILENTLY, and a blank or a write made
   from `undefined` follows (a checklist tick that replaces the whole stored checklist, a status
   "restored" to not_contacted). Three guards, so that cannot happen quietly:
     1. scripts/outreach-list-columns.test.ts walks every file that holds LIST rows (the four callers
        of useOutreach) with a parser — so `as any`, helper-local types and destructuring cannot
        hide a read — and fails if any live column it reads is missing here.
     2. In development, every list row is wrapped by `guardListRows`: reading a field that was not
        downloaded logs a loud console error naming it.
     3. The DETAIL dialog never works from a list row: LeadDetailDialog fetches the complete row by
        id (`useFullLeadRow`) and renders nothing until it has it.
   Adding a read of a new field to list code: add the column here. Adding a column to the table:
   refresh scripts/fixtures/outreach-leads-columns.json (the test says so).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export const OUTREACH_LIST_COLUMNS = [
  // identity + dedupe
  'id', 'business_name', 'phone', 'email', 'google_maps_url', 'place_id', 'address', 'country',
  'created_at', 'is_archived', 'campaign_id', 'assigned_to_user_id',
  // trade / town (audit eligibility, town badge, "Set trade")
  'category', 'search_keyword', 'search_location', 'derived_town', 'town_fetch_note',
  // pipeline
  'status', 'previous_status', 'next_action', 'next_action_date', 'next_action_note', 'notes', 'is_potential_work',
  'amount_paid', 'product', 'contact_method', 'outreach_attempts', 'last_outreach_attempt_at',
  'call_booked_at', // the row's Meeting line (lead state audit, 2026-09-30)
  'instantly_pushed_at',
  // web presence (signal filters, enrich / find-email targeting)
  'website', 'facebook_url', 'instagram_url', 'line_type', 'email_last_checked_at',
  // the canonical social profiles + how sure (2026-09-30, the Socials line on every row)
  'linkedin_url', 'facebook_status', 'instagram_status', 'linkedin_status',
  // WhatsApp queue + send state
  'whatsapp_status', 'whatsapp_template', 'whatsapp_sent_at', 'whatsapp_delivery_status',
  'whatsapp_message_id', 'queued_at', 'contact_followup_queued_at',
  // Meta confirmed a delivery once (2026-10-01): a failed later send is still a real contact
  // (leadState.openerReallySent) and the number is WhatsApp verified (whatsAppCapability). Not in the
  // sales view — a salesperson's rows fall back to the status / delivery status, never a guess.
  'whatsapp_ever_delivered',
] as const;

export type OutreachListColumn = (typeof OUTREACH_LIST_COLUMNS)[number];

export const OUTREACH_LIST_SELECT = OUTREACH_LIST_COLUMNS.join(', ');

/* ══ A SALESPERSON READS THE SAME LIST FROM THE SAFE VIEW (2026-09-27, shared Outreach + Inbox) ══
   Sales cannot read outreach_leads at all (a restrictive admin-only policy). They read the
   `sales_leads` VIEW: only their own assigned prospects, never a client, and no money, delivery or
   admin-note columns — `amount_paid` is a literal NULL there and `notes` is not in it. The browser
   therefore never RECEIVES those fields for a salesperson; hiding them in the UI is not the barrier.
   SALES_VIEW_COLUMNS is the view's column list (pg_get_viewdef, 2026-09-27) —
   scripts/sales-shared-workflow.test.ts holds it equal to the migration that defines the view. */
export const SALES_VIEW_COLUMNS = [
  'id', 'business_name', 'phone', 'email', 'google_maps_url', 'address', 'category', 'status', 'next_action',
  'next_action_date', 'next_action_note', 'call_booked_at', 'created_at', 'updated_at', 'country', 'list_type',
  'is_archived', 'is_potential_work', 'image_url', 'facebook_url', 'instagram_url', 'contact_method', 'place_id',
  'whatsapp_status', 'whatsapp_sent_at', 'whatsapp_delivery_status', 'whatsapp_template', 'queued_at',
  'contact_name', 'website', 'campaign_id', 'search_keyword', 'search_location', 'derived_town', 'review_count',
  'rating', 'lat', 'lng', 'line_type', 'product', 'hook_followup_queued_at', 'contact_followup_queued_at',
  'assigned_to_user_id', 'assigned_at', 'added_by_user_id', 'website_control', 'website_control_note', 'amount_paid',
  // 2026-09-28 (migration 20260928120000): where a self-sourced lead came from; appended at the view's end.
  'lead_source',
  // 2026-09-28 (migration 20260928160000): what the business does and where; appended at the view's end.
  'services_included', 'service_areas',
  // 2026-09-28 (migration 20260928180000): what Sales heard about the domain (A/B/C/D).
  'domain_control',
  // 2026-09-28 (migration 20260929000000): why the town is unconfirmed — the row's town-gate badge.
  'town_fetch_note',
  // 2026-09-30 (migration 20260930140000): the LinkedIn link and how sure each profile is.
  'linkedin_url', 'facebook_status', 'instagram_status', 'linkedin_status',
] as const;
const SALES_VIEW = new Set<string>(SALES_VIEW_COLUMNS);
/** The list columns a salesperson's list can have: the admin's list, cut to what the view carries.
 *  The rest arrive absent — every salesperson write goes through src/lib/leadRpc.ts, which never
 *  builds a value from a field it was not given. */
export const SALES_LIST_COLUMNS = OUTREACH_LIST_COLUMNS.filter((c) => SALES_VIEW.has(c));
export const SALES_LIST_SELECT = SALES_LIST_COLUMNS.join(', ');
/** One lead's detail for a salesperson: every column of the safe view, named. */
export const SALES_DETAIL_SELECT = SALES_VIEW_COLUMNS.join(', ');

/** Where a role reads leads from. Admin: the table, as before. Sales: the safe view. Nothing else. */
export function leadSourceFor(role: 'admin' | 'sales' | null | undefined): { table: 'outreach_leads' | 'sales_leads'; listSelect: string; detailSelect: string } {
  return role === 'sales'
    ? { table: 'sales_leads', listSelect: SALES_LIST_SELECT, detailSelect: SALES_DETAIL_SELECT }
    : { table: 'outreach_leads', listSelect: OUTREACH_LIST_SELECT, detailSelect: '*' };
}


/* ══ THE DASHBOARD'S LEADS (2026-09-27) ═══════════════════════════════════════════════════════
   useDashboardMetrics read `select('*')` one 1,000-row page at a time — seven waits in a row, 16 MB,
   ~8 s before the first card. These are the columns the Dashboard's code reads off `allLeads`
   (dashboard tasks, the funnel, the pipeline card, the client-delivery card — whose checklist is a
   read-modify-write, so delivery_checklist MUST be here). scripts/outreach-list-columns.test.ts walks
   the Dashboard the same way it walks the lead list. */
export const DASHBOARD_LEAD_COLUMNS = [
  'id', 'business_name', 'status', 'next_action', 'next_action_date', 'notes', 'created_at', 'updated_at',
  'is_archived', 'campaign_id', 'amount_paid', 'payment_date', 'subscription_status', 'product',
  'category', 'search_keyword', 'search_location', 'derived_town', 'contact_method', 'whatsapp_status',
  'phone', 'email', 'address', 'website', 'rating', 'user_id', 'assigned_to_user_id',
  'baseline_audit_id', 'remeasure_audit_id', 'remeasure_due_date', 'remeasure_results_sent_at',
  'delivery_checklist',
] as const;
export const DASHBOARD_LEAD_SELECT = DASHBOARD_LEAD_COLUMNS.join(', ');

const LISTED = new Set<string>(OUTREACH_LIST_COLUMNS);
/* Properties React, devtools, Promise resolution and JSON serialisation probe on any object. */
const PROBES = new Set(['then', 'toJSON', 'constructor', '$$typeof', '__proto__', 'nodeType', 'tagName', 'asymmetricMatch', '@@__IMMUTABLE_ITERABLE__@@', '@@__IMMUTABLE_RECORD__@@', 'toString', 'valueOf', 'length']);
const warned = new Set<string>();

/** Development only: wrap list rows so reading a field the list did not download is loud.
 *  Production gets the rows back untouched (no Proxy, no cost). */
export function guardListRows<T extends object>(rows: T[], where: string, enabled = !!import.meta.env?.DEV): T[] {
  if (!enabled) return rows;
  return rows.map((row) => new Proxy(row, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target) && !LISTED.has(prop) && !PROBES.has(prop) && !warned.has(prop)) {
        warned.add(prop);
        console.error(`[${where}] read "${prop}" off a LIST row, but the list does not download it — add it to OUTREACH_LIST_COLUMNS (src/lib/outreachLeadColumns.ts) or read the full row.`);
      }
      return Reflect.get(target, prop, receiver);
    },
  }));
}
