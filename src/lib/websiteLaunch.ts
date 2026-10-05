/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE LAUNCH — the ONE rule for "may this client's site go to production?", and the server's
   refusal of a save that would record a launch the rule does not allow (fix workstream 6, 2026-10-04;
   certification D-04 / D-06 / D-15 / M-040 / M-042).

   Session D found the production prompt and the PowerShell production commands unlocked on a recorded
   preview URL, domain, folder and Cloudflare project alone — even when the gate said needs_attention,
   and for Optimise clients. Now production needs ALL of:

     · a Build client (websiteRoute.ts) — never Optimise, never an unrecorded route
     · the domain-authority rule ready, when the onboarding row is known (domainAuthority.ts)
     · a build result that is PREVIEW READY by LeadFinderOS's own rule (previewReadyProblems: the site
       gate, the quality standard and the build standard all pass — a failed preview never unlocks)
     · that result for THIS client's project and domain: the recorded preview URL is the reported one,
       on the recorded Cloudflare project, and the build reported a commit
     · every required preview QA tick (requiredPreviewQa), "No unverified claim published" among them —
       the technical ones answered by the automatic gate once the preview is ready (outstandingPreviewQa)
     · a live enquiry form switched on when the build has a site-enquiry form

     productionReadiness()       the problems, in Paul's words. Empty = production may be offered.
     productionGateProblems()    why an imported LIVE gate report cannot verify the launch
     websiteBuildSaveRefusal()   paid-client-hub's save_website_build: refuses a save that NEWLY records
                                 production, ticks "Production checked", or switches the form on while
                                 the rule says no. The browser hides the buttons; the server refuses.

   ⛔ Positive matches only (CLAUDE.md §4): an unknown route, an absent build result, an unread gate
      report are all "not ready".
   ⚠️ Edge-reachable (paid-client-hub): relative .ts imports only. Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ServiceRoute } from './findableOffer.ts';
import { OPTIMISE_BUILD_REFUSAL } from './websiteRoute.ts';
import {
  outstandingPreviewQa, parseWebsiteBuild, previewReadyProblems, readProductionGate, stateHasExistingSite,
  type ProductionGateRecord, type WebsiteBuildState,
} from './websiteBuildState.ts';
import { siteFormProblems } from './siteForm.ts';

export interface DomainReadiness { applies: boolean; ready: boolean; reasons: string[] }

export interface LaunchInput {
  state: WebsiteBuildState;
  route: ServiceRoute | null;
  /** Why the route is what it is (websiteServiceRoute().source) — shown when it is null. */
  routeSource?: string;
  hasExistingSite: boolean;
  /** The domain-authority verdict for the client's onboarding row; null = not known here. */
  domain?: DomainReadiness | null;
}

const PAGES_DEV = /^https:\/\/([a-z0-9-]+\.)?([a-z0-9-]+)\.pages\.dev(\/|$)/i;
const bare = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');

/** Build tooling (prompts, commands, the form registry) for this route: '' = allowed. */
export function buildToolingRefusal(route: ServiceRoute | null): string {
  return route === 'optimise' ? OPTIMISE_BUILD_REFUSAL : '';
}

/** Everything that stops production being offered. Empty = ready. */
export function productionReadiness(i: LaunchInput): string[] {
  const s = i.state, b = s.build_execution;
  const out: string[] = [];
  if (i.route === 'optimise') return [OPTIMISE_BUILD_REFUSAL];
  if (i.route !== 'build') out.push('Client route is not Build (' + (i.routeSource || 'not recorded') + ') — record the route before anything goes live');
  if (i.domain && i.domain.applies && !i.domain.ready) out.push('Domain ownership / authority not settled: ' + (i.domain.reasons.join('; ') || 'see the client page'));
  if (!b.result_imported_at) out.push('No build result imported');
  else if (b.result_status !== 'preview_ready') out.push('The last build result is ' + (b.result_status || 'unknown').replace('_', ' ') + ', not preview ready — fix and re-run the build (Retry prompt)');
  else for (const p of previewReadyProblems(s, i.hasExistingSite)) out.push('Preview not ready: ' + p);
  if (!s.preview_url) out.push('Preview URL not recorded');
  else if (b.preview_url && bare(b.preview_url) !== bare(s.preview_url)) out.push('The recorded preview ' + s.preview_url + ' is not the one the build reported (' + b.preview_url + ')');
  const m = PAGES_DEV.exec(s.preview_url || '');
  if (!s.cloudflare_project) out.push('Cloudflare project not recorded');
  else if (m && m[2].toLowerCase() !== s.cloudflare_project.toLowerCase()) out.push('The preview ' + s.preview_url + ' is not on the recorded Cloudflare project ' + s.cloudflare_project);
  if (b.cloudflare_project && s.cloudflare_project && b.cloudflare_project.toLowerCase() !== s.cloudflare_project.toLowerCase()) out.push('The build deployed to Cloudflare project ' + b.cloudflare_project + ', not ' + s.cloudflare_project);
  if (!s.canonical_domain) out.push('Domain (canonical) not recorded');
  if (!s.local_repo_path) out.push('Local folder not recorded');
  if (b.result_imported_at && !b.commit_hash) out.push('The build reported no commit — production must publish a known commit');
  /* Website Build Simple (2026-10-05): the technical ticks are answered by the automatic gate once the
     preview is ready by LeadFinderOS's own rule (gateAnsweredQa); Paul's own review ticks are still owed. */
  const missing = outstandingPreviewQa(s, i.hasExistingSite);
  if (missing.length) out.push(missing.length + ' preview QA tick(s) not done: ' + missing.slice(0, 4).map((q) => q.label).join('; ') + (missing.length > 4 ? ' …' : ''));
  if ((b.standard.form === 'site_enquiry') && !s.form.enabled) out.push('The site has an enquiry form but it is not switched on in LeadFinderOS — the live form would not deliver');
  return out;
}

/** Why an imported LIVE gate report (scripts/findable-site-gate.mjs --url https://<domain>) cannot
 *  verify the launch. Empty = it can. */
export function productionGateProblems(g: ProductionGateRecord, canonicalDomain: string): string[] {
  if (!g.imported_at) return ['Live site gate not imported (run it on the real domain and paste qa/site-gate-production.json)'];
  const out: string[] = [];
  const dom = (canonicalDomain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (g.mode !== 'url' || g.preview) out.push('The imported gate was not a --url run on the live site (it was ' + (g.mode || 'unknown') + (g.preview ? ', preview' : '') + ')');
  if (dom && g.domain !== dom) out.push('The gate ran for ' + (g.domain || 'no domain') + ', not ' + dom);
  if (g.passed !== true || g.fails.length) out.push('The live site gate FAILED' + (g.fails.length ? ': ' + g.fails.slice(0, 5).join('; ') : ''));
  return out;
}

/** The production fields a save may newly set. */
function launches(prev: WebsiteBuildState, next: WebsiteBuildState): string[] {
  const out: string[] = [];
  if (next.production_url && bare(next.production_url) !== bare(prev.production_url)) out.push('the production URL');
  if (next.production_status !== 'not_live' && next.production_status !== prev.production_status) out.push('the production status');
  if (next.custom_domain_status === 'active' && prev.custom_domain_status !== 'active') out.push('the custom domain as active');
  if (next.qa.production_deployed === true && prev.qa.production_deployed !== true) out.push('"Production deployed"');
  if (next.qa.redirects_tested === true && prev.qa.redirects_tested !== true) out.push('"Redirects tested on production"');
  return out;
}

/**
 * The server's refusal of one save, or '' to allow it. `prevRaw` / `nextRaw` are the stored and incoming
 * website_build values. Only NEW production records, a NEW "Production checked" / verified, and a NEW
 * form switch-on are judged — an old row is never locked by a rule it predates.
 */
export function websiteBuildSaveRefusal(prevRaw: unknown, nextRaw: unknown, ctx: { route: ServiceRoute | null; routeSource?: string; domain?: DomainReadiness | null; ended: boolean }): string {
  const prev = parseWebsiteBuild(prevRaw), next = parseWebsiteBuild(nextRaw);
  const newly = launches(prev, next);
  const verifies = (next.qa.production_checked === true && prev.qa.production_checked !== true) || (next.production_status === 'verified' && prev.production_status !== 'verified');
  const formOn = next.form.enabled && (!prev.form.enabled || prev.form.site_key !== next.form.site_key || prev.form.recipient !== next.form.recipient);
  if (ctx.route === 'optimise' && (newly.length || verifies || formOn)) return OPTIMISE_BUILD_REFUSAL;
  if (newly.length) {
    const problems = productionReadiness({ state: next, route: ctx.route, routeSource: ctx.routeSource, hasExistingSite: stateHasExistingSite(next), domain: ctx.domain ?? null });
    if (problems.length) return 'Not saved: this would record ' + newly.join(', ') + ', but the site is not cleared for production — ' + problems.slice(0, 4).join('; ') + (problems.length > 4 ? ' …' : '') + '.';
  }
  if (verifies) {
    const g = productionGateProblems(readProductionGate(next.production_gate), next.canonical_domain);
    if (!next.production_url) g.unshift('No production URL recorded');
    if (g.length) return 'Not saved: "Production checked" needs the live site gate to pass first — ' + g.join('; ') + '.';
  }
  if (formOn) {
    const p = siteFormProblems({ form: next.form, canonicalDomain: next.canonical_domain, cloudflareProject: next.cloudflare_project, clientRoute: ctx.route, ended: ctx.ended });
    if (p.length) return 'Not saved: the enquiry form cannot be switched on — ' + p.join('; ') + '.';
  }
  return '';
}
