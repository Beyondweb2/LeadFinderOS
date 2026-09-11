export type LeadStatus =
  | 'not_contacted'
  | 'queued'            // in the WhatsApp outreach queue, not yet sent
  | 'initial_contact'   // unified "I've reached out" (replaces contacted/waiting/delivered)
  | 'second_attempt'    // queued for / sent the contact_followup no-reply follow-up (set when queued; persists after send since the lane never touches status). Contacted-not-replied, semantically between initial_contact and replied.
  | 'interested'
  | 'not_interested'
  | 'site_sent'
  | 'report_sent'
  | 'already_visible'   // AI already names them (>=3 of 6 on the first report). Parked: hidden from the
                        // default list, viewable via the status filter, and excluded from all automated pitches.
  | 'price_given'       // quote/price sent (operator-set only — nothing auto-writes it)
  | 'in_delivery'       // paid & being delivered (operator-set only)
  | 'opted_out'         // system-written by the suppression paths (drainer/triage) — NOT operator-pickable
  | 'replied'
  | 'payment_received'  // "Paid" — Outreach pipeline terminal (also Track Leads marker)
  /* ⛔ REFUNDED — MONEY IN, THEN MONEY BACK OUT. The ONLY status that removes a lead from the
     paying-customer count and every revenue total, via isPaidLead (src/lib/leadPayment.ts).
     `amount_paid` is DELIBERATELY LEFT ON THE ROW: it is the record of what was charged, and
     zeroing it would destroy that history and make the refund indistinguishable from a lead that
     never paid. "Refunded" means we still hold the amount; it just stops counting.
     ⚠️ NOT a pre-payment loss — that is already `not_interested` / `closed` / `opted_out`. And NOT
     "paid, delivery stopped, money kept", which must STAY in revenue and would need its own value
     if it ever happens (Paul's call, 2026-08-29: one value, not two). */
  | 'refunded'
  | 'completed'
  | 'no_whatsapp'        // number isn't on WhatsApp (permanent — reach via SMS/call/email)
  | 'no_whatsapp_needs_sms' // offline line-type gate: not a mobile → never queued; pick up for SMS
  | 'whatsapp_failed'    // WhatsApp send failed after retries (temporary — re-queueable)
  | 'email_sent'         // pushed to an Instantly.ai email campaign
  | 'bounced'            // Instantly reported the email bounced
  | 'closed';            // removed from the Inbox (set via a button, not manually picked)

export type NextActionType = 
  | 'call'
  | 'follow_up'
  | '2nd_follow_up'
  | 'send_draft'
  | 'remove_if_no_reply'
  | 'none'
  | 'send_initial_text'
  | 'send_voice_note'
  | 'send_follow_up'
  | 'check_3_day_removal';

export type Country = 'UK' | 'Australia' | 'USA' | 'Canada' | 'Germany' | 'France' | 'Spain' | 'Italy' | 'Netherlands' | 'Belgium' | 'Ireland' | 'NewZealand' | 'SouthAfrica' | 'India' | 'Singapore' | 'UAE' | 'Brazil' | 'Mexico' | 'Japan' | 'Sweden' | 'Thailand';

export type ListType = 'no_website' | 'broken_website';

export const LIST_TYPE_OPTIONS: { value: ListType; label: string }[] = [
  { value: 'no_website', label: 'No Website' },
  { value: 'broken_website', label: 'Broken Website' },
];

export type TemplateType = 'text' | 'voice_script';

export type TemplateCategory = 
  | 'initial'
  | 'follow_up'
  | 'no_website'
  | 'poor_website'
  | 'coming_soon'
  | 'other';

export interface Template {
  id: string;
  user_id: string;
  template_type: TemplateType;
  category: TemplateCategory;
  title: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const TEMPLATE_CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: 'initial', label: 'Initial Contact' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'no_website', label: 'No Website' },
  { value: 'poor_website', label: 'Poor Website' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'other', label: 'Other' },
];

/** Phase 3b: an operator-confirmed booking-page service (name + optional price/duration). */
export interface ConfirmedService {
  name: string;
  price?: string;
  durationMins?: number;
}

export interface OutreachLead {
  /** What we are selling them — separate from status. NULL/absent means undecided.
   *  ⚠️ Optional: the column post-dates most rows, and leads are read with select('*'), so it is
   *  simply missing until the ALTER runs. Always read it through `productOf()`. */
  product?: string | null;
  id: string;
  user_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  google_maps_url: string | null;
  place_id?: string | null;
  address: string | null;
  category: string | null;
  // The keyword + location used when the lead was found (e.g. "accountants" / "Wisbech").
  // Fetched via select('*'). Used as the audit's business_type / location_text source
  // (search_keyword||category, search_location||address) — mirrors the wizard's pickLead.
  search_keyword?: string | null;
  search_location?: string | null;
  /* ── FROM GOOGLE PLACE DETAILS, fetched once at lead creation ──────────────────────────────────
     All four ride along on the phone lookup that already ran, at no extra cost (phone is an
     Enterprise-tier field and so are rating/userRatingCount — see _shared/place-details.ts).
     Optional because the columns are added by SQL applied BY HAND; code must tolerate their absence. */
  rating?: number | null;
  review_count?: number | null;
  /** The town the business IS in, from Google's structured address. NOT search_location, which is the
   *  town that was SEARCHED — lead search has a radius, so the two often differ. First real term in
   *  the audit chain: confirmed_location || derived_town || search_location. */
  derived_town?: string | null;
  /** When a town fetch last COMPLETED. Set even when no town was found, so "never ran" and "ran and
   *  found nothing" stay distinguishable. Null here means the lookup has never run for this lead. */
  town_fetched_at?: string | null;
  /** Why derived_town is null despite town_fetched_at being set. Null = a town WAS found. See
   *  TownFetchNote in supabase/functions/_shared/place-details.ts for the values. */
  town_fetch_note?: string | null;
  status: LeadStatus;
  next_action: NextActionType | null;
  next_action_date: string | null;
  notes: string | null;
  country: Country | null;
  list_type: ListType;
  campaign_id?: string | null;
  sale_type?: string | null;
  created_at: string;
  updated_at: string;
  is_archived?: boolean;
  is_potential_work?: boolean;
  amount_paid?: number | null;
  paid_for?: string | null;
  payment_date?: string | null;
  project_duration?: string | null;
  next_checkin_date?: string | null;
  checkin_notes?: string | null;
  image_url?: string | null;
  facebook_url?: string | null;
  facebook_confidence?: number | null;
  facebook_method?: string | null;
  facebook_last_checked_at?: string | null;
  // Email enrichment (Phase 1: website scrape)
  email_status?: string | null;   // 'found' | 'none' | 'error' | null
  email_method?: string | null;   // 'website_scrape' | 'manual' | null
  email_last_checked_at?: string | null;
  // Phase 2 enrichment backbone (Apify-backed, stubbed)
  facebook_status?: string | null;          // 'found' | 'none' | 'error' | null
  instagram_url?: string | null;
  instagram_status?: string | null;         // 'found' | 'none' | 'error' | null
  instagram_method?: string | null;         // 'apify' | 'manual' | null
  instagram_last_checked_at?: string | null;
  enrichment_source?: string | null;        // 'website_scrape' | 'apify' | 'manual'
  contact_method?: string | null;
  whatsapp_status?: string | null;
  whatsapp_checked_at?: string | null;
  // HLR line-type (Twilio Lookup): 'mobile' | 'landline' | 'voip' | 'unknown' | null.
  // 'mobile' = WhatsApp-capable proxy (legal; no WhatsApp probing).
  line_type?: string | null;
  line_type_checked_at?: string | null;
  // WhatsApp outreach (queue + processor). whatsapp_template is the chosen approved
  // template; the rest are written server-side by process-whatsapp-queue on send.
  whatsapp_template?: string | null;
  queued_at?: string | null;
  /** The lead's status immediately BEFORE it was queued for WhatsApp, so cancelling
   *  the queue can restore it (instead of wiping to not_contacted). Null when not queued. */
  previous_status?: LeadStatus | null;
  whatsapp_sent_at?: string | null;
  /** Set = queued for the contact_followup (opener follow-up) drain lane; a timestamp so the lane
   *  drains oldest-first. Cleared on send or when de-queued. Separate from queued_at / status. */
  contact_followup_queued_at?: string | null;
  whatsapp_message_id?: string | null;
  whatsapp_delivery_status?: string | null; // 'simulated' | 'sent' | 'no_whatsapp' | 'failed_temporary' | 'failed'
  whatsapp_attempts?: number | null;
  outreach_attempts?: number;
  last_outreach_attempt_at?: string | null;
  // New fields
  potential_revenue?: number | null;
  contact_name?: string | null;
  website?: string | null;
  services_included?: string[] | null;
  // Phase 3b: operator-confirmed services (reviewed/edited from a website scan or
  // by hand) that pre-fill a booking-only page. null = fall back to Maps/defaults.
  confirmed_services?: ConfirmedService[] | null;
  project_overview?: string | null;
  project_value?: number | null;
  project_status?: string | null;
  delivery_notes?: string | null;
  /* ── DELIVERY COCKPIT (2026-08-18) — the client-delivery cockpit in LeadDetailDialog. All
     owner-RLS on outreach_leads, written via updateLead like every other field here.
     `remeasure_due_date` is a TYPED column (not JSONB) on purpose: it is the 8-week guarantee
     clock and must be queryable for a future "due soon across all clients" view. */
  remeasure_due_date?: string | null;          // YYYY-MM-DD; defaults to baseline + 56 days, editable
  delivery_checklist?: Record<string, boolean> | null;  // the 5 manual milestone ticks
  delivery_ref?: Record<string, string> | null;         // NON-SECRET reference info (login email, host, access notes)
  // Lead-detail journey markers (manual milestones set in the detail popup).
  site_sent_at?: string | null;
  call_booked_at?: string | null;
}

export interface OutreachActivity {
  id: string;
  lead_id: string;
  user_id: string;
  activity_type: string;
  description: string;
  created_at: string;
}

// Status FILTER options for the Outreach page — mirrors the 7-status pipeline so
// the filter and the row/expanded dropdowns are one consistent list.
export const OUTREACH_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'not_contacted', label: 'New' },
  { value: 'queued', label: 'Queued' },
  { value: 'initial_contact', label: 'Contacted' },
  { value: 'second_attempt', label: '2nd attempt' },
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'site_sent', label: 'Site Sent' },
  { value: 'report_sent', label: 'Report Sent' },
  /* Permanent, always-selectable filter option. This list is STATIC — the dropdown does NOT depend on
     which leads are loaded, so "Already Visible" is offered even when none are on screen. Selecting it
     un-hides these leads (see OutreachTable's default-hide). Unique label → its own filter group. */
  { value: 'already_visible', label: 'Already Visible' },
  { value: 'price_given', label: 'Price Given' },
  { value: 'interested', label: 'Interested ⭐' },
  { value: 'not_interested', label: 'Not Interested' },
  /* ⚠️ THE FILTER LIST IS A THIRD LABEL SOURCE, and it is the one the operator reads BEFORE
     choosing. It must match the pill, so these carry the same simplification — see
     PipelineStatusBadge for why both read "No WhatsApp".
     ⚠️ KNOWN COST OF THAT CHOICE, FLAGGED AND ACCEPTED: this dropdown now offers TWO entries with
     identical text and no colour to separate them, so picking the wrong one shows 53 rows instead of
     509. On the pills the colour still distinguishes them; in a <select> there is nothing to. If
     that becomes annoying the fix is one combined option that filters on both values, NOT a
     re-split of the labels. */
  { value: 'no_whatsapp', label: 'No WhatsApp' },
  { value: 'no_whatsapp_needs_sms', label: 'No WhatsApp' },
  /* ⚠️ Two entries, one label. That is right for this list, which is the canonical status -> label
     map and is also what the per-row status SETTER renders — a setter must offer every status
     individually, because setting one is choosing exactly one. The FILTER does not use this list;
     see OUTREACH_STATUS_FILTER_OPTIONS below. */
  { value: 'whatsapp_failed', label: 'WhatsApp Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'payment_received', label: 'Paid' },
  { value: 'in_delivery', label: 'In Delivery' },
  { value: 'completed', label: 'Completed' },
  /* Sits AFTER the money statuses because that is the order it happens in. Its label is UNIQUE, so
     OUTREACH_STATUS_FILTER_OPTIONS (derived from this list) gives it its own filter group for free
     — and status-constants.test.ts asserts no two filter options share a label. */
  { value: 'refunded', label: 'Refunded' },
];

/* ══ THE STATUS FILTER, WHICH IS NOT THE STATUS LIST ═════════════════════════════════════
   ⛔ FILTERING AND SETTING ARE DIFFERENT QUESTIONS AND THIS IS WHY THEY GET DIFFERENT LISTS.
   Setting a status means choosing exactly one, so the setter must offer all seventeen separately.
   Filtering means "show me everyone in this situation" — and when Paul filters by No WhatsApp he
   wants everyone he cannot WhatsApp, not one of two arbitrary halves of them. Two identical entries
   showing 53 rows or 509 depending on which he happened to click is worse than the long labels this
   replaced.

   ⚠️ DERIVED BY GROUPING ON THE LABEL, NOT HAND-MAINTAINED. That is the whole point: a second
   hand-written list is a thing to forget, and forgetting it means a status nobody can filter for.
   Grouping guarantees three properties for free —
     * every status is reachable through exactly one filter option,
     * any two statuses that share a label are automatically ONE option,
     * and the decision about which labels may be shared stays in one place (the labels themselves,
       policed by scripts/status-constants.test.ts's allowlist).
   Give two more statuses a shared label tomorrow and the filter merges them with no edit here.

   ⚠️ value IS THE FIRST STATUS IN THE GROUP, so for the sixteen single-status options it is
   byte-identical to what it always was — persisted table state keeps working untouched. */
/* ══ THE ONE FILTER THAT IS NOT A STATUS AT ALL ═══════════════════════════════════════════════
   ⛔ `paid` MEANS `amount_paid > 0`, EVERYWHERE (CLAUDE.md §6) — NOT `status = 'payment_received'`.
   The two diverge, in both directions, and that is exactly why this cannot be a status option:
     * a customer moved on to `in_delivery` is STILL PAID, and a status filter would hide the very
       people the operator is mid-delivery with;
     * a £0 lead dragged to `payment_received` by hand is NOT paid, and a status filter would count
       it as revenue.
   So "Paid" is a SENTINEL — a value the row filter special-cases against `amount_paid`, the same
   shape the Inbox already uses for its site-milestone filters (__opened__ / __claimed__ /
   __upsell__), which are likewise not lead statuses.

   ⚠️ AND ITS LABEL IS DELIBERATELY NOT THE BARE WORD "Paid". The status `payment_received` already
   carries that label, and two options reading the same word showing different row counts is the
   53-vs-509 "No WhatsApp" failure this file's own comments were written about. The parenthetical is
   what the option actually tests, so the two are told apart by their words rather than by luck.
   scripts/status-constants.test.ts asserts they never collide. */
/* ════════════════════════════════════════════════════════════════════════════════════════════
   PRODUCT — WHAT WE ARE SELLING THEM. A DIFFERENT QUESTION FROM STATUS.

   🔴 Paul, 2026-09-11: "Status and PRODUCT are two different things and I only have one field for
   both." Status is a position in a conversation (queued -> replied -> report_sent); product is
   what the pitch should be. Measured that day: 498 unarchived leads sit at replied/report_sent/
   interested with nothing recording which of the three products they are for — and 421 of those
   are at report_sent, i.e. already sent a report with no decision about what comes next.

   ⛔ NULL MEANS UNDECIDED, AND IT IS NOT STORED AS A WORD. No default and no backfill of 3,203
   rows, and absence stays honestly absent — the same reasoning as every other absent value in
   this codebase. `productOf()` is the only place that reads it, so a row written before the
   column existed reads as undecided rather than as an error.

   ⛔ THIS FIELD MUST NEVER BE READ BY process-whatsapp-queue. Paul's rule, stated when he
   approved it: the moment the sender consults it, a field he sets by hand starts deciding sends.
   It is an operator's note about intent, not a trigger.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export const PRODUCT_VALUES = ['rebuild', 'ai_only', 'no_website'] as const;
export type ProductValue = typeof PRODUCT_VALUES[number];

/** The sentinel for "not decided yet". Never written to the database — NULL is. */
export const PRODUCT_UNDECIDED = '__undecided__';

export const PRODUCT_OPTIONS: Array<{ value: ProductValue; label: string; hint: string }> = [
  { value: 'rebuild', label: 'Rebuild', hint: 'Their site loses the comparison — send the before-and-after mockup' },
  { value: 'ai_only', label: 'AI only', hint: 'Their site is fine — sell AI visibility on the site they have' },
  { value: 'no_website', label: 'No website', hint: 'Nothing to compare against — a different product again' },
];

/**
 * Read a lead's product.
 *
 * ⚠️ Returns null for undecided AND for anything unrecognised. An unknown value must show up as
 * undecided rather than silently joining one of the three piles — absence is never a decision, and
 * a value this build does not know about is not one either.
 */
export function productOf(lead: { product?: string | null } | null | undefined): ProductValue | null {
  const v = String(lead?.product ?? '').trim().toLowerCase();
  return (PRODUCT_VALUES as readonly string[]).includes(v) ? (v as ProductValue) : null;
}

export const PAID_FILTER_VALUE = '__paid__';

/** What the Outreach status filter can hold: a real status, or the Paid sentinel. */
export type StatusFilterValue = LeadStatus | typeof PAID_FILTER_VALUE;

/** True when a filter value is the money sentinel rather than a status. */
export function isPaidFilterValue(value: string | null | undefined): boolean {
  return value === PAID_FILTER_VALUE;
}

export interface StatusFilterOption {
  /** The filter's key. A real LeadStatus (the group's first), or the Paid sentinel. */
  value: StatusFilterValue;
  label: string;
  /**
   * Every status this option matches. One member for all but the no-WhatsApp pair — and EMPTY for
   * the Paid sentinel, which matches on `amount_paid` instead.
   *
   * ⚠️ AN EMPTY LIST IS NOT "MATCHES NOTHING" HERE, AND CALLERS MUST NOT TREAT IT THAT WAY. A
   * filter constant that matches nothing renders as a smaller number rather than an error (see the
   * `'contacted'` incident above `CRAWLABLE_STATUSES_DEFAULT`), so the row filter must test
   * `isPaidFilterValue` FIRST and never reach the status path for this option.
   */
  statuses: LeadStatus[];
}

export const OUTREACH_STATUS_FILTER_OPTIONS: StatusFilterOption[] = (() => {
  const byLabel = new Map<string, LeadStatus[]>();
  for (const o of OUTREACH_STATUS_OPTIONS) {
    if (!byLabel.has(o.label)) byLabel.set(o.label, []);
    byLabel.get(o.label)!.push(o.value);
  }
  /* Map preserves insertion order, so the filter reads in the same order as the status list. */
  const fromStatuses: StatusFilterOption[] =
    [...byLabel.entries()].map(([label, statuses]) => ({ value: statuses[0], label, statuses }));
  /* First in the list, because it is the one filter that answers "who is actually a customer". */
  return [{ value: PAID_FILTER_VALUE, label: 'Paid (money in)', statuses: [] }, ...fromStatuses];
})();

/**
 * Which statuses a chosen filter value matches.
 *
 * ⚠️ TAKES ANY LeadStatus, not just a group's own value, and returns the WHOLE group. That is
 * deliberate: a table state saved before this existed may hold 'no_whatsapp_needs_sms', which is no
 * longer any option's value. Returning its group means such a filter keeps working rather than
 * silently matching nothing — an empty table that reads as "no such leads" is precisely the failure
 * mode a filter constant matching nothing already caused once.
 * An unrecognised value matches only itself, never everything: a filter that cannot be understood
 * must narrow, not widen.
 *
 * ⛔ AND IT IS NOT THE MECHANISM FOR THE PAID SENTINEL. `statusesForFilter(PAID_FILTER_VALUE)`
 * returns `[]` because there is no status that means paid — the caller must branch on
 * `isPaidFilterValue` before it gets here. Returning `[PAID_FILTER_VALUE]` instead would look
 * harmless and quietly show an empty table, which is precisely the failure mode this file's
 * comments already record twice.
 */
export function statusesForFilter(value: StatusFilterValue): LeadStatus[] {
  if (isPaidFilterValue(value)) return [];
  return OUTREACH_STATUS_FILTER_OPTIONS.find((o) => o.statuses.includes(value as LeadStatus))?.statuses
    ?? [value as LeadStatus];
}

/** The option value that owns a status — used to normalise restored filter state onto the list. */
export function canonicalFilterValue(value: StatusFilterValue): StatusFilterValue {
  return OUTREACH_STATUS_FILTER_OPTIONS
    .find((o) => o.value === value || o.statuses.includes(value as LeadStatus))?.value ?? value;
}

/* ⛔ TWO LISTS NOW, AND THE SPLIT IS THE POINT (2026-09-05, Paul: strip the barber-era leftovers).
   WHATSAPP_TEMPLATES is what an operator may CHOOSE TO SEND — Findable only. LEGACY_WHATSAPP_
   TEMPLATES is the old barber-sites product: still sent 71 times historically, so its rows must
   still be LABELLED, but it must never again be offered in a send picker for a product we do not
   sell. Presence in a picker is a decision about the future; presence in the label map is a fact
   about the past, and conflating them is why booking_page_intro was the DEFAULT-SELECTED template
   on two send screens (both already carry a comment about that hazard).
   ⚠️ 70 of those 71 sends are on ARCHIVED leads, so almost nothing surfaces — but "almost" is
   why the label map exists rather than a deletion.
   ⚠️ AND THE SEND PICKERS ARE NOT THE ONLY CONSUMER: CampaignFormDialog VALIDATES a stored
   default_template against this list. Two barber campaigns still store booking_switch_barbers, so
   that dialog now preserves an unrecognised stored value instead of silently resetting it — see
   the note there. Shrinking an allowlist that something validates against is how a value gets
   quietly rewritten to null on the next save.
   ⚠️ AdminSiteManage (the old barber-site admin page) deliberately keeps the FULL list via
   ALL_WHATSAPP_TEMPLATES: it is the one screen whose job IS that product, and taking its templates
   away would break a working page rather than tidy it. */

/** Approved WhatsApp outreach templates (Meta) an operator may send. Findable only.
 *  Keep in sync with the edge function's TEMPLATES allowlist in process-whatsapp-queue. */
export const WHATSAPP_TEMPLATES: { value: string; label: string }[] = [
  { value: 'initial_contact', label: 'Initial contact (opener)' },
  { value: 'audit_reply', label: 'Audit reply (report + competitors)' },
  { value: 'audit_result_hook', label: 'Audit result hook (outreach)' },
  { value: 'audit_reply_warm', label: 'Audit reply — warm (after the opener)' },
  { value: 'onboarding_followup', label: 'Onboarding follow-up (sign-up link)' },
  /* The OPENER follow-up: a business that got the initial_contact opener and never replied. Bulk-
     queued from Outreach into its OWN drain lane (contact_followup_queued_at), NOT the status=queued
     path — see handleQueueForWhatsApp. Only eligible leads (contacted 3+ days ago, no reply, once
     per lead) are queued; the server re-verifies. */
  { value: 'contact_followup', label: 'No-reply follow-up (chase the opener)' },
  { value: 'book_call', label: 'Arrange a call' },
  /* Re-engage a lead who went quiet. ⚠️ THE DOC COMMENT ABOVE THIS LIST IS ALREADY WRONG for four
     of the entries — book_call, initial_contact and re_engage carry ONE variable (business name)
     and audit_reply carries four. Left as-is rather than rewritten mid-task, but do not trust it. */
  { value: 're_engage', label: 'Re-engage (gone quiet)' },
];

/** The old barber-sites product. NOT sendable — label-only, so historic rows read as words rather
 *  than raw keys and can be marked as what they are. */
export const LEGACY_WHATSAPP_TEMPLATES: { value: string; label: string }[] = [
  { value: 'booking_page_intro', label: 'Booking page intro' },
  { value: 'no_website_barbers', label: 'Free website intro' },
  { value: 'barber_poor_website', label: 'Updated website intro' },
  { value: 'booking_switch_barbers', label: 'Booking switch (no commission)' },
  { value: 'barber_fresha_booksy', label: 'Fresha/Booksy switch' },
  { value: 'free_website_intro', label: 'Free website intro (early)' },
];

/* ⚠️ FINDABLE TEMPLATES THAT ARE SENT BY THE SERVER AND MUST NOT BE HAND-SENDABLE. Each has real
   rows in whatsapp_messages and, before this list existed, printed on the dashboard as its raw key:
   hook_followup (9 sends), payment_recieved (2 — and that misspelling is the LIVE template name at
   Meta, do not "fix" it here), free_check_result (1). They are labels only, deliberately absent
   from WHATSAPP_TEMPLATES: payment_recieved fires from stripe-webhook on payment, free_check_result
   from the free-check flow, hook_followup from its own queue. An operator sending one by hand would
   be claiming something the system has not done. */
const SERVER_ONLY_TEMPLATE_LABELS: Record<string, string> = {
  hook_followup: 'Hook follow-up (chase the hook)',
  payment_recieved: 'Payment received',
  free_check_result: 'Free check result',
};

/** Every template that can appear anywhere, for pickers that legitimately span both products. */
export const ALL_WHATSAPP_TEMPLATES: { value: string; label: string }[] = [
  ...WHATSAPP_TEMPLATES,
  ...LEGACY_WHATSAPP_TEMPLATES,
];

const LEGACY_TEMPLATE_VALUES = new Set(LEGACY_WHATSAPP_TEMPLATES.map((t) => t.value));

/** True for a template belonging to the old barber-sites product. */
export const isLegacyTemplate = (name: string): boolean => LEGACY_TEMPLATE_VALUES.has(name);

const TEMPLATE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ALL_WHATSAPP_TEMPLATES.map((t) => [t.value, t.label])),
  ...SERVER_ONLY_TEMPLATE_LABELS,
};

/** A readable name for any template ever sent. Falls back to the raw key, which is the honest
 *  answer for a template nobody has registered here yet — never a blank and never "Unknown", both
 *  of which hide that a real message went out. */
export const templateLabel = (name: string): string => TEMPLATE_LABELS[name] ?? name;

// Contact method options (how the business was contacted)
export type ContactMethod = 'call' | 'sms' | 'whatsapp' | 'facebook_msg' | 'email';

export const CONTACT_METHOD_OPTIONS: { value: ContactMethod; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook_msg', label: 'Messenger' },
  { value: 'email', label: 'Email' },
];

// Pipeline status options (where the lead is in the pipeline). Simplified to a
// single linear funnel: New → Initial Contact → Replied → Site Sent → Interested
// → Not Interested → Paid. The old Attempted/Contacted/Delivered all collapse to
// "Initial Contact"; "Closed" becomes "Paid" (payment_received).
export type PipelineStatus =
  | 'not_contacted'
  | 'queued'
  | 'initial_contact'
  | 'second_attempt'
  | 'replied'
  | 'site_sent'
  | 'report_sent'
  | 'already_visible'
  | 'interested'
  | 'not_interested'
  | 'no_whatsapp'
  | 'no_whatsapp_needs_sms'
  | 'whatsapp_failed'
  | 'payment_received'
  | 'price_given'
  | 'in_delivery'
  | 'completed'
  | 'refunded'     // money returned — the one status that removes a lead from revenue (isPaidLead)
  | 'opted_out';   // render-only (system-written); not in the pickable options below

export const PIPELINE_STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: 'not_contacted', label: 'New' },
  { value: 'queued', label: 'Queued' },
  { value: 'initial_contact', label: 'Contacted' },
  { value: 'second_attempt', label: '2nd attempt' },
  { value: 'replied', label: 'Replied' },
  { value: 'site_sent', label: 'Site Sent' },
  { value: 'report_sent', label: 'Report Sent' },
  { value: 'price_given', label: 'Price Given' },
  { value: 'interested', label: 'Interested ⭐' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'payment_received', label: 'Paid' },
  { value: 'in_delivery', label: 'In Delivery' },
  { value: 'completed', label: 'Completed' },
  /* The Inbox's own pickable list. Present in BOTH lists on purpose: a status the operator can set
     on one screen but not the other is exactly the drift that makes two screens disagree. */
  { value: 'refunded', label: 'Refunded' },
];

// ── Status semantics shared by the dashboard (Outreach status = source of truth) ──
// A lead counts as "contacted / sent" once it has left "New" (any status except
// not_contacted). This deliberately includes Not Interested and Closed — i.e.
// "everyone I've actually contacted".
export function isSentStatus(status?: string | null): boolean {
  return !!status && status !== 'not_contacted';
}

// CUMULATIVE FUNNEL MILESTONES. Pipeline order:
//   New → Contacted → Replied → Site Sent → Interested → Not Interested → Paid.
// Leads progress strictly in order, so a milestone includes its status AND every
// later one. These power FUNNEL metrics (reply rate, journey steps) — NOT the
// discrete Pipeline-card buckets (each lead sits in exactly one bucket).

// Replied-or-beyond: replied through every later stage. Includes not_interested
// (they replied to say no — and were sent a site) and the Paid terminals.
const REPLIED_OR_BEYOND = ['replied', 'site_sent', 'report_sent', 'price_given', 'interested', 'not_interested', 'payment_received', 'in_delivery', 'completed'];
export function isRepliedStatus(status?: string | null): boolean {
  return !!status && REPLIED_OR_BEYOND.includes(status);
}

// Site-sent-or-beyond: a site was sent once a lead reaches site_sent or any later
// stage (interested / not_interested / paid all happen AFTER they've seen the site).
const SITE_SENT_OR_BEYOND = ['site_sent', 'interested', 'not_interested', 'payment_received', 'completed'];
export function isSiteSentStatus(status?: string | null): boolean {
  return !!status && SITE_SENT_OR_BEYOND.includes(status);
}

export const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'send_initial_text', label: 'Send Initial Text' },
  { value: 'send_voice_note', label: 'Send Voice Note' },
  { value: 'send_follow_up', label: 'Send Follow-up' },
  { value: '2nd_follow_up', label: '2nd Follow-up' },
  { value: 'check_3_day_removal', label: 'Check 3-Day Removal' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'send_draft', label: 'Respond' },
  { value: 'remove_if_no_reply', label: 'Remove if no reply' },
  { value: 'none', label: 'Set Action' },
];

/* ⛔ WHICH STATUSES MAY BE CRAWLED, AND WHY THE DEFAULT IS THESE TWO.
   The crawl itself contacts nobody — but it MANUFACTURES THE ABILITY TO CONTACT, and that is what
   makes it worth a filter. Before cross-channel suppression existed, running it over everything
   would have handed an email address to 79 people who had already said no.
     no_whatsapp_needs_sms  WhatsApp could not reach them, so email is the only channel left
     contacted              an opener went out and they never replied — a fair second attempt
   ⚠️ THE SUPPRESSION LIST IS THE REAL GUARD, NOT THIS. _shared/suppression.ts is checked at SEND
   time by instantly-push, so a suppressed lead cannot be emailed even if it is crawled. This filter
   is a convenience — it stops you paying attention to rows you were never going to mail — and it
   must never be mistaken for the safety net, or someone will widen it and assume they are still
   protected. */
/* ⛔ 'contacted' WAS NOT A STATUS AND MATCHED NOTHING. It was here because Paul described the
   population as "contacted — I sent an opener and they never replied" and I used his words as a
   literal value without checking one existed. The filter silently targeted 289 leads instead of
   ~446: no error, a real count on the button, and 157 leads left out of email entirely.
   The four below are the real values that mean "WhatsApp is not the channel for this lead":
     no_whatsapp_needs_sms  not a mobile — cannot take WhatsApp OR SMS (509)
     no_whatsapp            a real mobile with no WhatsApp account — SMS still works (53)
     initial_contact        opener sent, no reply (166)
     report_sent            report sent, no reply (93)
   ⚠️ Typed as LeadStatus[], not string[] — that plus the suite is what makes a value that does not
   exist fail at build rather than quietly narrowing a campaign. */
export const CRAWLABLE_STATUSES_DEFAULT: LeadStatus[] =
  ['no_whatsapp_needs_sms', 'no_whatsapp', 'initial_contact', 'report_sent'];

/** Statuses that have said no. Offered in the picker only so it is VISIBLE that they are excluded —
 *  selecting one still cannot cause an email, because the send path checks suppression. */
export const CRAWL_STATUS_OPTIONS: LeadStatus[] = [
  'no_whatsapp_needs_sms', 'no_whatsapp', 'initial_contact', 'report_sent',
  'not_contacted', 'queued', 'replied', 'interested',
];

/**
 * The label the rest of the CRM shows for a status.
 *
 * ⛔ ONE MAP, NOT A SECOND COPY. OUTREACH_STATUS_OPTIONS above is what the status filter and the row
 * dropdowns render, so anything that shows a status to a human reads it from there. The email-crawl
 * picker was printing the RAW VALUE instead — so `not_contacted` appeared as "not_contacted" in one
 * control and "New" in every other, and the two read as different statuses. They are not: the value
 * is `not_contacted` and its label has always been "New".
 *
 * ⚠️ THE FALLBACK IS THE RAW VALUE, DELIBERATELY, AND IT IS ALSO A TELL. Every current member of
 * CRAWL_STATUS_OPTIONS is mapped, so it should never fire — if a snake_case label ever appears in
 * that picker again, the status is missing from OUTREACH_STATUS_OPTIONS and belongs there rather than
 * being special-cased here. Returning the value beats returning "Unknown", which would hide which
 * status it was.
 */
export function leadStatusLabel(status: LeadStatus): string {
  return OUTREACH_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}
