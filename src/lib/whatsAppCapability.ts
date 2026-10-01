/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAN WE REACH THIS NUMBER ON WHATSAPP? — the one truth model (2026-10-01).
   Paul: "A mobile number is NOT automatically proof that WhatsApp exists." Before this, the row's green
   phone icon said "Mobile — WhatsApp-capable (line-type check)" from line_type alone, while the status
   pill said "No WhatsApp" from Meta's rejection — 201 leads showed both (2026-10-01).
   What each stored field really means:
   - line_type      an OFFLINE guess from the number's format (libphonenumber, src/lib/lineType.ts):
                    mobile / landline / voip / unknown. It is NOT a network lookup and NOT WhatsApp.
   - status 'no_whatsapp' / whatsapp_delivery_status 'no_whatsapp'
                    Meta rejected a message to it: the number is not on WhatsApp (131026). Positive.
   - whatsapp_ever_delivered, or whatsapp_delivery_status delivered / read
                    Meta confirmed a delivery to it: it IS on WhatsApp. Positive. (The list views carry the
                    delivery status for both roles; ever_delivered only where the caller read it.)
   - status 'no_whatsapp_needs_sms'
                    the offline check says it is not a mobile (landline / VoIP) — never sent to.
   Most recent positive evidence wins: a Meta rejection beats an older delivery (the person may have
   left WhatsApp). Pure; used by every screen that shows WhatsApp reachability.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type WhatsAppCapability = 'not_on_whatsapp' | 'verified' | 'not_mobile' | 'mobile_unchecked' | 'unchecked';

export interface WhatsAppCapabilityInput {
  status?: string | null;
  line_type?: string | null;
  whatsapp_delivery_status?: string | null;
  whatsapp_ever_delivered?: boolean | null;
}

export function whatsAppCapabilityOf(l: WhatsAppCapabilityInput): WhatsAppCapability {
  const status = (l.status ?? '').trim();
  if (status === 'no_whatsapp' || (l.whatsapp_delivery_status ?? '') === 'no_whatsapp') return 'not_on_whatsapp';
  const ds = (l.whatsapp_delivery_status ?? '').trim();
  if (l.whatsapp_ever_delivered === true || ds === 'delivered' || ds === 'read') return 'verified';
  if (status === 'no_whatsapp_needs_sms' || l.line_type === 'landline' || l.line_type === 'voip') return 'not_mobile';
  if (l.line_type === 'mobile') return 'mobile_unchecked';
  return 'unchecked';
}

export const WHATSAPP_CAPABILITY_LABEL: Record<WhatsAppCapability, string> = {
  not_on_whatsapp: 'No WhatsApp',
  verified: 'WhatsApp verified',
  not_mobile: 'Not a mobile',
  mobile_unchecked: 'Mobile number',
  unchecked: 'WhatsApp not checked',
};

/** The one-line explanation shown in tooltips — what we actually know and how. */
export const WHATSAPP_CAPABILITY_DETAIL: Record<WhatsAppCapability, string> = {
  not_on_whatsapp: 'No WhatsApp — Meta rejected a message to this number. Call or email instead.',
  verified: 'WhatsApp verified — a message to this number was delivered.',
  not_mobile: 'Not a mobile (landline or VoIP, from the number format) — call or email.',
  mobile_unchecked: 'Mobile number — WhatsApp not checked yet (only a message can confirm it).',
  unchecked: 'WhatsApp not checked.',
};

/** Worth trying on WhatsApp: verified, or a mobile nobody has tried yet. Never a rejected number. */
export const isWhatsAppWorthTrying = (c: WhatsAppCapability): boolean => c === 'verified' || c === 'mobile_unchecked';
