export type LeadStatus =
  | 'not_contacted'
  | 'queued'            // in the WhatsApp outreach queue, not yet sent
  | 'initial_contact'   // unified "I've reached out" (replaces contacted/waiting/delivered)
  | 'interested'
  | 'not_interested'
  | 'site_sent'
  | 'report_sent'
  | 'price_given'       // quote/price sent (operator-set only — nothing auto-writes it)
  | 'in_delivery'       // paid & being delivered (operator-set only)
  | 'opted_out'         // system-written by the suppression paths (drainer/triage) — NOT operator-pickable
  | 'replied'
  | 'payment_received'  // "Paid" — Outreach pipeline terminal (also Track Leads marker)
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
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'site_sent', label: 'Site Sent' },
  { value: 'report_sent', label: 'Report Sent' },
  { value: 'price_given', label: 'Price Given' },
  { value: 'interested', label: 'Interested ⭐' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'no_whatsapp', label: 'No WhatsApp' },
  { value: 'no_whatsapp_needs_sms', label: 'Not Mobile — Needs SMS' },
  { value: 'whatsapp_failed', label: 'WhatsApp Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'payment_received', label: 'Paid' },
  { value: 'in_delivery', label: 'In Delivery' },
  { value: 'completed', label: 'Completed' },
];

/** Approved WhatsApp outreach templates (Meta). value = template name; both carry
 *  {{1}} business name + {{2}} claim URL. Keep in sync with the edge function's
 *  TEMPLATES allowlist in process-whatsapp-queue. */
export const WHATSAPP_TEMPLATES: { value: string; label: string }[] = [
  { value: 'booking_page_intro', label: 'Booking page intro' },
  { value: 'no_website_barbers', label: 'Free website intro' },
  { value: 'barber_poor_website', label: 'Updated website intro' },
  { value: 'booking_switch_barbers', label: 'Booking switch (no commission)' },
  { value: 'barber_fresha_booksy', label: 'Fresha/Booksy switch' },
  { value: 'initial_contact', label: 'Initial contact (opener)' },
  { value: 'audit_reply', label: 'Audit reply (report + competitors)' },
  { value: 'onboarding_followup', label: 'Onboarding follow-up (sign-up link)' },
];

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
  | 'replied'
  | 'site_sent'
  | 'report_sent'
  | 'interested'
  | 'not_interested'
  | 'no_whatsapp'
  | 'no_whatsapp_needs_sms'
  | 'whatsapp_failed'
  | 'payment_received'
  | 'price_given'
  | 'in_delivery'
  | 'completed'
  | 'opted_out';   // render-only (system-written); not in the pickable options below

export const PIPELINE_STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: 'not_contacted', label: 'New' },
  { value: 'queued', label: 'Queued' },
  { value: 'initial_contact', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'site_sent', label: 'Site Sent' },
  { value: 'report_sent', label: 'Report Sent' },
  { value: 'price_given', label: 'Price Given' },
  { value: 'interested', label: 'Interested ⭐' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'payment_received', label: 'Paid' },
  { value: 'in_delivery', label: 'In Delivery' },
  { value: 'completed', label: 'Completed' },
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
