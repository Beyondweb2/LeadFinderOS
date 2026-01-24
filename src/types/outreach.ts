export type LeadStatus = 
  | 'not_contacted'
  | 'contacted'
  | 'call_back'
  | 'not_answered'
  | 'on_hold'
  | 'wants_draft'
  | 'interested'
  | 'not_interested';

export type NextActionType = 
  | 'call'
  | 'follow_up'
  | 'send_draft'
  | 'remove_if_no_reply'
  | 'none';
export type Country = 'UK' | 'AUS';

export type ListType = 'no_website' | 'broken_website';

export const LIST_TYPE_OPTIONS: { value: ListType; label: string }[] = [
  { value: 'no_website', label: 'No Website' },
  { value: 'broken_website', label: 'Broken Website' },
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
  { value: 'contacted', label: 'Contacted' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'not_answered', label: 'Not Answered' },
  { value: 'on_hold', label: 'On Hold / Waiting' },
  { value: 'wants_draft', label: 'Wants a Draft' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
];

export const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'send_draft', label: 'Send Draft' },
  { value: 'remove_if_no_reply', label: 'Remove if no reply' },
  { value: 'none', label: 'None' },
];
