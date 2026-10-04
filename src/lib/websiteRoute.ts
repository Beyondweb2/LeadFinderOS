/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE ROUTE — is this paid client one we BUILD a website for, or one whose own site we OPTIMISE?
   (fix workstream 6, 2026-10-04; certification D-06 / M-040)

   The Website Build tooling (build prompts, preview and production steps, the enquiry-form registry)
   is for BUILD clients only. An Optimise client keeps their own website; Findable must never replace,
   deploy over or take it down (agreement 9.4). Session D found the tooling open to every paid client.

   websiteServiceRoute()  the route, from every positive signal the records carry:
                            1. onboarding plan_tier (+ website_addon agreeing) — serviceRouteFromRow, the
                               rule checkout uses
                            2. the older onboarding website_route ('new_site' / 'rebuild_existing' = build,
                               'optimise_existing' = optimise) — BS4, the first real Build, has only this
                            3. the lead's contract_total_payments (12 = build, 6 = optimise)
                          Two signals that DISAGREE → null ("conflict"), never a guess. None → null.
   ⛔ Positive match only: null is "not recorded", and every caller treats it as NOT build for anything
      outward-facing (production, the live enquiry form). It only lets the preview work go on.
   ⚠️ Edge-reachable (paid-client-hub, site-enquiry): relative .ts imports only. Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { serviceRouteForTotal, serviceRouteFromRow, type ServiceRoute } from './findableOffer.ts';

export interface WebsiteRouteVerdict {
  route: ServiceRoute | null;
  /** Where it came from, in words — or why it is null. */
  source: string;
}

export function websiteServiceRoute(
  onboarding: { plan_tier?: unknown; website_addon?: unknown; website_route?: unknown } | null | undefined,
  lead: { contract_total_payments?: unknown } | null | undefined,
): WebsiteRouteVerdict {
  const signals: Array<{ route: ServiceRoute; source: string }> = [];
  const plan = serviceRouteFromRow(onboarding as never);
  if (plan) signals.push({ route: plan, source: 'the onboarding plan (' + (plan === 'build' ? 'new site' : 'keep their site') + ')' });
  const wr = String(onboarding?.website_route ?? '').trim();
  if (wr === 'new_site' || wr === 'rebuild_existing') signals.push({ route: 'build', source: 'the onboarding website route (' + wr.replace('_', ' ') + ')' });
  else if (wr === 'optimise_existing') signals.push({ route: 'optimise', source: 'the onboarding website route (optimise existing)' });
  const total = serviceRouteForTotal(lead?.contract_total_payments);
  if (total) signals.push({ route: total, source: 'the contract (' + String(lead?.contract_total_payments) + ' payments)' });
  if (!signals.length) return { route: null, source: 'not recorded — no plan, website route or contract on file' };
  const routes = new Set(signals.map((s) => s.route));
  if (routes.size > 1) return { route: null, source: 'records disagree: ' + signals.map((s) => s.route + ' from ' + s.source).join('; ') };
  return { route: signals[0].route, source: signals.map((s) => s.source).join(' + ') };
}

/** The one sentence every refused Build action shows for an Optimise client. */
export const OPTIMISE_BUILD_REFUSAL =
  'This is a Findable Optimise client: they keep their own website. Website Build, preview / production deployment and the enquiry-form registry are for Build clients only — Findable never replaces, deploys over or takes down an Optimise client\'s site. Use the page generator for their pages.';
