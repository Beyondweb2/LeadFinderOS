export type LeadStatus = 
  | 'not_contacted'
  | 'contacted'
  | 'call_back'
  | 'not_answered'
  | 'on_hold'
  | 'wants_draft'
  | 'interested'
  | 'not_interested'
  | 'sent_initial_text'
  | 'replied'
  | 'sent_voice_note'
  | 'awaiting_decision'
  | 'waiting'
  | 'reviewing_draft'
  | 'paid_for_draft'
  | 'completed'
  | 'no_whatsapp'
  | 'sms'
  | 'whatsapp'
  | 'facebook_msg';

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

export type Country = 'UK' | 'Australia' | 'USA' | 'Canada' | 'Germany' | 'France' | 'Spain' | 'Italy' | 'Netherlands' | 'Belgium' | 'Ireland' | 'NewZealand' | 'SouthAfrica' | 'India' | 'Singapore' | 'UAE' | 'Brazil' | 'Mexico' | 'Japan' | 'Sweden';

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

export interface OutreachLead {
  id: string;
  user_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  google_maps_url: string | null;
  address: string | null;
  category: string | null;
  status: LeadStatus;
  next_action: NextActionType | null;
  next_action_date: string | null;
  notes: string | null;
  country: Country | null;
  list_type: ListType;
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
  contact_method?: string | null;
  whatsapp_status?: string | null;
  whatsapp_checked_at?: string | null;
}

export interface OutreachActivity {
  id: string;
  lead_id: string;
  user_id: string;
  activity_type: string;
  description: string;
  created_at: string;
}

export const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'sent_initial_text', label: 'Sent Initial Text' },
  { value: 'replied', label: 'Replied' },
  { value: 'sent_voice_note', label: 'Sent Voice Note' },
  { value: 'awaiting_decision', label: 'Awaiting Decision' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'not_answered', label: 'Not Answered' },
  { value: 'on_hold', label: 'On Hold / Waiting' },
  { value: 'wants_draft', label: 'Wants a Draft' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'no_whatsapp', label: 'No WhatsApp' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'reviewing_draft', label: 'Reviewing Draft' },
  { value: 'paid_for_draft', label: 'Paid for Draft' },
  { value: 'completed', label: 'Completed (Client)' },
];

// Simplified status options for the Outreach page (initial contact only)
export const OUTREACH_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook_msg', label: 'FB Messenger' },
  { value: 'contacted', label: 'Called' },
  { value: 'not_answered', label: 'No Answer' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'sent_voice_note', label: 'Sent Voice Note' },
  { value: 'replied', label: 'Replied' },
  { value: 'interested', label: 'Interested ⭐' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'no_whatsapp', label: 'No WhatsApp' },
];

// Contact method options (how the business was contacted)
export type ContactMethod = 'call' | 'sms' | 'whatsapp' | 'facebook_msg';

export const CONTACT_METHOD_OPTIONS: { value: ContactMethod; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook_msg', label: 'Messenger' },
];

// Pipeline status options (where the lead is in the pipeline)
export type PipelineStatus = 
  | 'not_contacted'
  | 'waiting'
  | 'no_reply'
  | 'sent_follow_up'
  | 'sent_voice_note'
  | 'interested'
  | 'not_interested'
  | 'completed';

export const PIPELINE_STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'waiting', label: 'Waiting for Reply' },
  { value: 'no_reply', label: 'No Reply' },
  { value: 'sent_follow_up', label: 'Sent Follow-up' },
  { value: 'sent_voice_note', label: 'Sent Voice Message' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'completed', label: 'Closed' },
];

export const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'send_initial_text', label: 'Send Initial Text' },
  { value: 'send_voice_note', label: 'Send Voice Note' },
  { value: 'send_follow_up', label: 'Send Follow-up' },
  { value: '2nd_follow_up', label: '2nd Follow-up' },
  { value: 'check_3_day_removal', label: 'Check 3-Day Removal' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'send_draft', label: 'Send Draft' },
  { value: 'remove_if_no_reply', label: 'Remove if no reply' },
  { value: 'none', label: 'None' },
];
