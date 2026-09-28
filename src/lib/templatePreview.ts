import { READABLE_TEMPLATE_BODIES } from './templateBodies';

/* ══ WHAT A TEMPLATE SAYS, BEFORE YOU PICK IT (2026-09-28, Paul) ═════════════════════════════════
   The template pickers show names only ("Initial contact — original opener"). This renders the
   template's CURRENT approved wording from the app's one copy of the bodies (READABLE_TEMPLATE_BODIES,
   held to the send path by the template-bodies parity test), with sample details wherever the
   message fills something in — or the lead's own business name when the picker is for one lead.
   It is a READING aid only: what is actually sent is still built by the server (the dry run shows
   that exact payload). */

export const SAMPLE_PREVIEW_VALUES = {
  businessName: "Smith's Plumbing",
  url: 'findable.live/r/abc123',
  trade: 'plumbers',
  competitors: 'Two local rivals',
  firstName: 'Mark',
  town: 'Wakefield',
  siteFault: 'your site has no page for your main service',
  siteFindings: 'Your site has no services page. Your town is not mentioned anywhere.',
} as const;

export interface PreviewValues {
  businessName?: string | null;
  firstName?: string | null;
  town?: string | null;
  trade?: string | null;
}

/** The template's wording with sample (or the lead's) details, or null when the app holds no copy of
 *  it — the caller then says so rather than showing nothing. */
export function templatePreviewText(templateName: string | null | undefined, values: PreviewValues = {}): string | null {
  if (!templateName) return null;
  const body = READABLE_TEMPLATE_BODIES[templateName];
  if (!body) return null;
  const s = SAMPLE_PREVIEW_VALUES;
  return body(
    values.businessName?.trim() || s.businessName,
    s.url,
    values.trade?.trim() || s.trade,
    s.competitors,
    values.firstName?.trim() || s.firstName,
    values.town?.trim() || s.town,
    s.siteFault,
    s.siteFindings,
  );
}
