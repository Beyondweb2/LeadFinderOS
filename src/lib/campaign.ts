// Campaign "intended channel" — how the operator PLANS to reach leads in this
// campaign. This is distinct from a lead's actual contact_method pill
// (call/whatsapp/facebook_msg, plus a historic sms value). The campaign method may be
// email; the pill has no email value. They are deliberately separate concepts.
// SMS left the product 2026-09-16; no campaign row ever carried it (10 whatsapp, 5 null).
export type CampaignMethod = 'whatsapp' | 'email';

export const CAMPAIGN_METHOD_OPTIONS: { value: CampaignMethod; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

export const CAMPAIGN_METHOD_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
};
