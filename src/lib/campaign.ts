// Campaign "intended channel" — how the operator PLANS to reach leads in this
// campaign. This is distinct from a lead's actual contact_method pill
// (call/sms/whatsapp/facebook_msg). The campaign method may be email; the pill
// has no email value. They are deliberately separate concepts.
export type CampaignMethod = 'whatsapp' | 'sms' | 'email';

export const CAMPAIGN_METHOD_OPTIONS: { value: CampaignMethod; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

export const CAMPAIGN_METHOD_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};
