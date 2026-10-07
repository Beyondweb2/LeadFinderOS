/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NUMBER A SALESPERSON CALLS (Paul, 2026-10-07).

   Reps ring prospects from their OWN phone or from the WhatsApp app. So the Call popup shows the number to
   read and copy — never a tel: link (on a laptop with WhatsApp Desktop installed, tel: is WhatsApp's, which
   is how "Call" came to say "Open WhatsApp?" without being asked to).

   🔴 TWO WAYS TO CALL (Paul, 2026-10-07, mid-build): "Call on WhatsApp" opens the WhatsApp app at this number
      (the rep calls from there), "Call manually" just closes the window. whatsappUrl is offered ONLY for a UK
      (44) or Australian (61) number — the two outreach markets. India is not an outreach market: no WhatsApp
      option. Opening WhatsApp to call writes nothing in this app; the outcome is still Log call.
   ⛔ ONE NORMALISATION: toWhatsAppDigits (waNumber.ts) — the same UK / Australia rule every send and the
      phone-history guard use. The international form is shown first because it dials correctly from any
      phone, in any country; the number as stored is shown underneath when it reads differently.
   ⛔ A number that rule refuses (an Australian 13 / 1300 / 1800 number, an 04… number on a UK lead) is shown
      exactly as stored, never re-shaped into someone else's number, and has no WhatsApp option.
   ⛔ PURE, relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { toWhatsAppDigits } from './waNumber.ts';

export interface CallNumberView {
  /** What the rep reads: "+44 7700 900123", "+61 412 345 678", or the stored text when it cannot be normalised. */
  display: string;
  /** What Copy puts on the clipboard: "+447700900123" — no spaces, dials from any phone. */
  copy: string;
  /** The number as stored, when it reads differently from `display` ("07700 900123"). */
  stored: string | null;
  /** The WhatsApp app at this number (UK / Australia only), or null. Opened only by the rep's own tap. */
  whatsappUrl: string | null;
}

/** The outreach markets whose numbers may be opened in WhatsApp to call: UK and Australia. */
export const WHATSAPP_CALL_PREFIXES: readonly string[] = ['44', '61'];

function grouped(d: string): string {
  if (/^44\d{10}$/.test(d)) return '+44 ' + d.slice(2, 6) + ' ' + d.slice(6);
  if (/^614\d{8}$/.test(d)) return '+61 ' + d.slice(2, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8);
  if (/^61[2378]\d{8}$/.test(d)) return '+61 ' + d.slice(2, 3) + ' ' + d.slice(3, 7) + ' ' + d.slice(7);
  return '+' + d;
}

export function callNumberView(raw: string | null | undefined, country?: string | null): CallNumberView | null {
  const stored = (raw ?? '').trim();
  if (!stored) return null;
  const d = toWhatsAppDigits(stored, country);
  if (!d) return { display: stored, copy: stored.replace(/[^\d+]/g, '') || stored, stored: null, whatsappUrl: null };
  const display = grouped(d);
  const same = stored.replace(/\s+/g, ' ') === display;
  const whatsappUrl = WHATSAPP_CALL_PREFIXES.some((p) => d.startsWith(p)) ? 'https://wa.me/' + d : null;
  return { display, copy: '+' + d, stored: same ? null : stored, whatsappUrl };
}
