/* ════════════════════════════════════════════════════════════════════════════════════════════════
   REPORT STYLE — which brand a public audit report wears (Paul, 2026-11-15).

   campaigns.report_style: 'findable' (default — every report as before, findable.live/r/<code>) or 'leadfinderos' (the
   LeadFinderOS report sent to web developers / agencies to sell the app: no Findable name, logo, price or guarantee,
   served at app.leadfinderos.com/r/<code>).
   ⛔ DECIDED AT RENDER TIME from the audit's lead's campaign, so a link already sent follows the campaign's current setting.
   ⛔ The LeadFinderOS address serves ONLY LeadFinderOS-style reports: a Findable client's report is refused there, so the two
      brands never cross (render-audit-report, `brand=leadfinderos` from functions/r/[slug].ts).
   Pure. IMPORTED BY EDGE FUNCTIONS AND functions/r/[slug].ts: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { OPERATOR_APP_URL } from '../config/operatorApp.ts';

export type ReportStyle = 'findable' | 'leadfinderos';
export const REPORT_STYLES: { value: ReportStyle; label: string }[] = [
  { value: 'findable', label: 'Findable' },
  { value: 'leadfinderos', label: 'LeadFinderOS' },
];
export const REPORT_STYLE_LABEL = 'Report style';
export const REPORT_STYLE_HINT = 'How the audit report link looks for leads in this campaign. LeadFinderOS: our app brand for web developers and agencies, on the LeadFinderOS app address, with no Findable name, price or guarantee.';

/** The address LeadFinderOS-style reports are served from (functions/r/[slug].ts on the V1 Pages project). */
export const LFOS_REPORT_ORIGIN = OPERATOR_APP_URL;
/** The query flag that proxy adds, so the renderer knows the request came in on the LeadFinderOS address. */
export const LFOS_BRAND_PARAM = 'brand';
export const LFOS_BRAND_VALUE = 'leadfinderos';
/** Where the report's call to action sends a reader. */
export const LFOS_SITE_URL = 'https://leadfinderos.com';
export const LFOS_CTA_LINE = 'Run reports like this for your clients. Start free at leadfinderos.com';

/** Anything but an explicit 'leadfinderos' is Findable (an older row, a lead with no campaign, a failed read). */
export function reportStyleOf(c: { report_style?: string | null } | null | undefined): ReportStyle {
  return c?.report_style === 'leadfinderos' ? 'leadfinderos' : 'findable';
}

/** The short LeadFinderOS report link for a code. */
export function lfosReportUrl(code: string): string {
  return `${LFOS_REPORT_ORIGIN}/r/${code}`;
}

/** The permanent sample report (src/lib/leadfinderExample.ts, served by functions/r/[slug].ts with no database read). */
export const LFOS_EXAMPLE_SLUG = 'example';
export const LFOS_EXAMPLE_URL = lfosReportUrl(LFOS_EXAMPLE_SLUG);

/** The one host the V1 proxy serves LeadFinderOS reports on: the app address (OPERATOR_APP_URL). Every other host keeps the 410. */
export function isLfosReportHost(host: string): boolean {
  const h = (host || '').toLowerCase().split(':')[0];
  return !!h && h === new URL(LFOS_REPORT_ORIGIN).hostname;
}
