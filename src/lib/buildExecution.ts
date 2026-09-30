/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BUILD EXECUTION — Phase 4: READY TO BUILD → a client site in its OWN repository → a Cloudflare
   Pages PREVIEW → a structured build result → the LeadFinderOS record updated.

   LeadFinderOS orchestrates; Claude Code builds. No GitHub / Cloudflare API is called from here.

     executionBlockers()   what stops a build prompt being generated (never silently ignored)
     executionPrompt()     the route-aware Build Execution prompt (template: the generated config)
     parseBuildResult()    Claude's reply → a validated BuildResult + a summary shown before import
     applyBuildResult()    merged into website_build; conflicting project values are NOT replaced
                           without Paul's say-so; a failed build never erases the last good one
     builtCoverage()       every source URL against the REAL build's routes + the redirect map
     retryPrompt()         only the failure, the config and the correction — not a new full build
     reviewPrompt()        Template Review / Design Review of the deployed preview

   ⛔ THE SEED TEMPLATE IS READ-ONLY. The prompt names the ONE destination repository, forbids the
      template's repository by URL, and makes Claude verify the git remote before writing.
   ⛔ CONTAMINATION BLOCKS THE PREVIEW. A seed hit, a missing noindex, a failed build or link check,
      or a non-pages.dev preview can never read as PREVIEW READY (previewGateProblems) — and neither can a
      preview that fails the Findable quality standard (previewReadyProblems, websiteQuality.ts): an
      undecided existing-site strength, an unassessed intent, or no old-vs-new "clearly an upgrade".
      Nor one that fails the BUILD standard (websiteBuildStandard.ts, X5c): the areas hub not led by its
      map, genuine reviews left off, a mailto form or a dropped working form, a stacked mobile hero with
      no reason, repeated or unused photos — judged from quality.standard against standardEvidence().
   ⛔ PREVIEW ONLY. pages.dev, noindex, tracking off, no custom domain.
   ⚠️ Browser + prompt module. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { BuildExecution, BuildQaKey, BuildResultStatus, ManifestAsset, WebsiteBuildState } from './websiteBuildState.ts';
import { BUILD_QA_KEYS, BUILD_ROUTE_LABELS, EMPTY_BUILD_EXECUTION, PAGE_FAMILY_LABELS, mayPreserveCopy, previewReadyProblems, standardEvidence } from './websiteBuildState.ts';
import { CONTENT_INTENTS, CONTENT_INTENT_LABELS, EMPTY_UPGRADE, QUALITY_STANDARD_LINES, STRENGTH_CATEGORY_LABELS, STRENGTH_DISPOSITION_LABELS, UPGRADE_QA_LINES, UPGRADE_VERDICTS, intentProblems, readUpgradeReview, strengthProblems, type UpgradeReview } from './websiteQuality.ts';
import type { BuildPackInput } from './buildPack.ts';
import { BUILD_STANDARD_LINES, EMPTY_STANDARD, SITE_ENQUIRY_ENDPOINT, STANDARD_RESULT_RULES, STANDARD_RESULT_SCHEMA_LINE, readStandardReport, standardProblems, type StandardReport } from './websiteBuildStandard.ts';
import { cloudflareBranches, cloudflareModeProblem, modeLabel, previewDeploySteps, stablePreviewUrl } from './cloudflareDeploy.ts';
import { cloudflareProblem, codeConfig, deployInputFor, isBespokeRoute, isFaithfulRoute, isTemplateRoute, MARK, masterPrompt, setupProblems, winPath } from './buildPack.ts';
import { computeMapping, type Mapping } from './templateMapping.ts';
import { clean, extractJson, safeUrl } from './recon.ts';
import { oneLine } from './manifestSummary.ts';
import { pathKey, redirectMatcher, toPath } from './buildArchitecture.ts';
import { EMPTY_SITE_GATE, GATE_QA_OVERRIDES, readSiteGateReport, siteGateLines, siteGateProblems, siteIntentMap, siteIntentMapLines, type SiteGateReport } from './siteGate.ts';

/* ── assets to download (shared with the standalone Asset Download prompt) ──────────────────── */

/** Faithful: every USE asset. Template: USE assets ASSIGNED to a slot. Bespoke: assigned USE, else every USE. */
/**
 * The assets a build downloads: every asset Paul marked USE — never REVIEW, never IGNORE.
 *   assigned            USE assets placed in a slot (hero, logo, gallery lead…), with the slot named
 *   approvedAdditional  every other USE asset: gallery / project / service evidence, used where it fits
 * Before the BS4 pilot (2026-09-25, F12) a template build — or a bespoke one with any slot filled —
 * downloaded ONLY the slot-assigned assets: 2 of BS4's 12 approved job photos. A gallery is a
 * collection; it does not need a slot per photo.
 * ⛔ An unassigned USE LOGO / FAVICON is not "additional": which logo the site uses is a slot decision.
 */
export interface AssetPlan {
  assigned: Array<{ asset: ManifestAsset; slot: string }>;
  approvedAdditional: ManifestAsset[];
  /** assigned, then approvedAdditional — the whole download list. */
  list: Array<{ asset: ManifestAsset; slot: string }>;
  held: number; ignored: number; unassignedBrand: ManifestAsset[];
  /** Approved, but not recorded as client-owned — never downloaded. */
  notClientOwned: number;
}
export function assetsToDownload(i: BuildPackInput, m?: Mapping): AssetPlan {
  const s = i.state;
  /* ⛔ APPROVED AND CLIENT-OWNED (Paul, 2026-09-28): an asset being visible on the old site does not
     make it the client's. Only an asset recorded as client-owned is downloaded; an approved one whose
     ownership is third-party or unknown is held (counted in `notClientOwned`) until that is settled. */
  const approved = s.manifest.assets.filter((a) => a.approval === 'approved');
  const use = approved.filter((a) => a.ownership === 'client_owned');
  const notClientOwned = approved.length - use.length;
  const held = s.manifest.assets.filter((a) => a.approval === 'pending').length;
  const ignored = s.manifest.assets.filter((a) => a.approval === 'rejected').length;
  const map = m ?? computeMapping(s, i.template, i.facts, i.businessName);
  const slotOf = new Map<string, string>();
  for (const st of map.slots) for (const a of st.publishable) if (!slotOf.has(a.source_url)) slotOf.set(a.source_url, st.slot.label);
  const assigned = use.filter((a) => slotOf.has(a.source_url)).map((asset) => ({ asset, slot: slotOf.get(asset.source_url)! }));
  const isBrand = (a: ManifestAsset) => a.type === 'logo' || a.type === 'favicon';
  const rest = use.filter((a) => !slotOf.has(a.source_url));
  const approvedAdditional = rest.filter((a) => !isBrand(a));
  const unassignedBrand = rest.filter(isBrand);
  return { assigned, approvedAdditional, list: [...assigned, ...approvedAdditional.map((asset) => ({ asset, slot: '' }))], held, ignored, unassignedBrand, notClientOwned };
}

/** The X3 / Asset Download lines: assigned by slot, then the additional approved assets. */
export function assetPlanLines(plan: AssetPlan, name: (a: ManifestAsset, n: number) => string): string[] {
  let n = 0;
  const line = (a: ManifestAsset, slot: string) => '- ' + (slot ? '[' + slot + '] ' : '') + oneLine(a.source_url, 300) + ' → ' + name(a, n++) + (a.purpose ? '  (' + oneLine(a.purpose, 80) + ')' : '');
  return [
    'Assigned to a slot (' + plan.assigned.length + '):',
    ...(plan.assigned.length ? plan.assigned.map((x) => line(x.asset, x.slot)) : ['- (none assigned)']),
    '',
    'Additional approved assets (' + plan.approvedAdditional.length + ') — gallery, project and service evidence. Use each where it genuinely fits (the gallery, the page of the service it shows); never as a stand-in for something it does not show:',
    ...(plan.approvedAdditional.length ? plan.approvedAdditional.map((a) => line(a, '')) : ['- (none)']),
    ...(plan.unassignedBrand.length ? ['', plan.unassignedBrand.length + ' approved logo / favicon file(s) are not assigned to the Logo slot — NOT downloaded; which logo the site uses is decided in LeadFinderOS.'] : []),
    '',
    'Do NOT download: ' + plan.held + ' REVIEW asset(s), ' + plan.ignored + ' IGNORE asset(s), or anything else you see on the old site.',
  ];
}
export const safeAssetName = (a: ManifestAsset, n: number) =>
  (a.suggested_filename || (a.source_url.split('/').pop() || 'asset-' + (n + 1))).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);

/** What this client HAS, so the build standard's defaults are not guesses: the gate checks the same. */
function standardEvidenceLines(s: WebsiteBuildState): string[] {
  const e = standardEvidence(s);
  return [
    'WHAT THIS CLIENT HAS (LeadFinderOS — the gate checks the build against it):',
    '- Approved genuine photos: ' + e.approvedPhotos + (e.hasPhotoStrength ? ' — the old site\'s photography / gallery / project work is a strength: the rebuild must not feel sparser.' : '.') + ' Use enough to represent the business and cover every image role; never pad with weak or redundant shots.',
    '- Review evidence: ' + (e.hasReviewEvidence ? 'YES — show genuine excerpts, attribution and the source link, and the current rating / count with its snapshot date where confidently sourced (hold only for a conflict, uncertain identity or an unsourced figure).' : 'none recorded — if the client has public reviews, report them in warnings rather than leaving them out.'),
    '- Areas hub: ' + (e.areasHubNeeded ? 'needed — it leads with a genuine map by default (a fallback must be relevant to the locality and say why).' : 'not marked needed.'),
    '- Old site had a working enquiry form: ' + (e.hadWorkingForm ? 'YES — the new site keeps a working form (X5d).' : 'no.'),
    '- Verified credentials: ' + (e.hasCredentials ? 'YES — give them visual weight near the top.' : 'none verified.'),
  ];
}

/* ── the result contract ──────────────────────────────────────────────────────────────────────── */

export const BUILD_RESULT_VERSION = 1;
export const BUILD_RESULT_SCHEMA_LINES: string[] = [
  '{',
  '  "buildResultVersion": 1,',
  '  "status": "preview_ready",',
  '  "repository": { "url": "https://github.com/…", "name": "", "branch": "main", "commitHash": "" },',
  '  "local": { "path": "", "devCommand": "", "buildCommand": "", "outputDirectory": "" },',
  '  "cloudflare": { "projectName": "", "previewUrl": "https://preview.<project>.pages.dev", "deploymentId": "", "status": "", "noindexConfirmed": true },',
  '  "build": { "pages": ["/", "/services/…/"], "services": [], "locations": [], "assets": ["<source url> -> <local file>"], "unsupportedFields": [] },',
  '  "redirects": { "kept": 0, "redirected": 0, "retired": 0, "unresolved": ["/old-path/"], "issues": [] },',
  '  "qa": { "buildPassed": true, "seedContaminationPassed": true, "linksPassed": true, "responsivePassed": true, "schemaPassed": true },',
  '  "quality": {',
  '    "oldVsNew": { "verdict": "upgrade", "widths": [1440, 390], "stillStronger": [], "notes": "" },',
  '    "siteGate": { "siteGateVersion": 1, "…": "the WHOLE of qa/site-gate.json, unedited" },',
  '    "siteGatePreview": { "siteGateVersion": 1, "…": "the WHOLE of qa/site-gate-preview.json, unedited" },',
  STANDARD_RESULT_SCHEMA_LINE,
  '  },',
  '  "seedHits": [],',
  '  "warnings": [],',
  '  "errors": []',
  '}',
];
export const BUILD_RESULT_RULES: string[] = [
  'Rules for the JSON (LeadFinderOS imports it; a malformed result is refused):',
  '- ONE ```json block at the very end. Valid JSON, no comments, no trailing commas. Use "" / [] / false when unknown — never guess.',
  '- status: "preview_ready" (built, pushed, preview deployed, noindex confirmed, every QA check passed),',
  '  "built" (built and pushed, NOT deployed — say why in errors), "needs_attention" (deployed or built but a check',
  '  failed), "failed" (the build did not complete).',
  '- Every qa value is true only if you RAN the check and it passed. seedHits lists every forbidden value you found.',
  '- build.pages: every route the built site serves (paths). redirects.unresolved: every source path with no decision.',
  '- quality.oldVsNew (existing-site rebuilds): verdict "upgrade" ONLY if you compared old and new side by side at the widths listed',
  '  and the new site is clearly an upgrade; otherwise "not_upgrade" with every place the old site still wins in stillStronger.',
  '  status may be "preview_ready" only with verdict "upgrade" and an empty stillStronger (no old site: leave verdict "").',
  ...STANDARD_RESULT_RULES,
  '  status may be "preview_ready" only when quality.standard meets X5c (LeadFinderOS re-checks it and says why not).',
  '- quality.siteGate / quality.siteGatePreview: the gate\'s own JSON files, pasted whole. status may be "preview_ready" only when both',
  '  passed. LeadFinderOS reads the gate over your qa values: a failed gate check makes the matching qa value false and is an error.',
];

/* ── blockers ─────────────────────────────────────────────────────────────────────────────────── */

export function executionBlockers(i: BuildPackInput, m: Mapping): string[] {
  const s = i.state;
  return [
    ...(!s.route ? ['Build route not chosen'] : []),
    ...m.readiness.blockers,
    ...setupProblems(s).map((p) => p.label + ' ' + p.problem),
    ...(cloudflareProblem(s) ? [cloudflareProblem(s)] : []),
    ...(cloudflareModeProblem(s) ? [cloudflareModeProblem(s)] : []),
    ...(isFaithfulRoute(s) && !s.rebuild_style ? ['Rebuild fidelity not chosen'] : []),
    ...(isFaithfulRoute(s) && !s.copy_ownership ? ['Copy ownership not recorded'] : []),
    /* ⛔ A FAITHFUL OR MODERNISED REBUILD REPRODUCES THE CURRENT SITE (Paul, 2026-09-28): only where the
       client has confirmed their business owns it or may reuse it (copy_ownership client_wrote /
       client_permission — the onboarding answer site_rights is shown beside it on the client page).
       Agency-owned or unclear: a genuinely new Findable-template build using business facts and
       client-owned material only. The new-design style reproduces nothing and is not blocked. */
    ...(isFaithfulRoute(s) && s.copy_ownership && s.rebuild_style !== 'new_design' && !mayPreserveCopy(s.copy_ownership)
      ? ['Reuse of the current site’s design, text and images is not confirmed by the client — choose the template route (a fresh Findable build) or record their confirmation'] : []),
    ...(!isTemplateRoute(s) && !s.pages.length ? ['Page architecture (no pages planned)'] : []),
    ...(s.pages.some((p) => p.action === 'undecided') ? ['Undecided pages in the page plan'] : []),
    ...(isFaithfulRoute(s) && !i.existingSiteUrl ? ['Source website URL'] : []),
    /* The quality standard: the builder needs every strength decided and every intent assessed. */
    ...strengthProblems(s.quality, !!i.existingSiteUrl),
    ...intentProblems(s.quality, []),
    /* ⛔ The destination may never be the template's own repository. */
    ...(i.template && isTemplateRoute(s) && s.github_owner && s.repo_name && sameRepo(expectedRemote(s), i.template.sourceRepoUrl)
      ? ['Destination repository is the TEMPLATE’s own repository (' + i.template.sourceRepoUrl + ') — choose a new repository name for this client'] : []),
    ...(s.repo_url && i.template && isTemplateRoute(s) && sameRepo(s.repo_url, i.template.sourceRepoUrl) ? ['Repository URL points at the template’s repository'] : []),
  ];
}
const sameRepo = (a: string, b: string) => a.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '') === b.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');

/** A short fingerprint of the config the prompt was built from — to spot "the config changed since". */
export function configVersion(m: Mapping): string {
  const txt = JSON.stringify(m.config);
  let h = 5381;
  for (let k = 0; k < txt.length; k++) h = ((h << 5) + h + txt.charCodeAt(k)) >>> 0;
  return 'c' + h.toString(36);
}

/** The existing site and the new one live on the same domain (www ignored) — a rebuild in place, where
 *  "the old domain" is also the canonical one and cannot be a forbidden value (BS4 pilot, 2026-09-25). */
export function sameDomainRebuild(existingSiteUrl: string, canonicalDomain: string): boolean {
  const host = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  const a = host(existingSiteUrl || ''), b = host(canonicalDomain || '');
  return !!a && a === b;
}

const expectedRemote = (s: WebsiteBuildState) => 'https://github.com/' + (s.github_owner || MARK.owner) + '/' + (s.repo_name || MARK.repo) + '.git';

/* ── the Build Execution prompt ───────────────────────────────────────────────────────────────── */

export function executionPrompt(i: BuildPackInput): { text: string; blockedBy: string[]; configVersion: string } {
  const s = i.state, t = isTemplateRoute(s) ? i.template : null;
  const m = computeMapping(s, i.template, i.facts, i.businessName);
  const blockedBy = executionBlockers(i, m);
  const ver = configVersion(m);
  if (blockedBy.length) {
    return { blockedBy, configVersion: ver, text: ['Build route: ' + (s.route ? BUILD_ROUTE_LABELS[s.route] : 'NOT CHOSEN'), '', 'NOT READY TO BUILD — no build prompt has been generated.', '', 'Resolve these in LeadFinderOS first:', ...blockedBy.map((b) => '- ' + b)].join('\n') };
  }
  const cfg = codeConfig(s, i.template);
  const path = winPath(s.local_repo_path);
  const remote = expectedRemote(s);
  const plan = assetsToDownload(i, m);
  const { list: assets, held } = plan;
  const sourcePaths = [...new Set(s.manifest.pages.map((p) => toPath(p.url)))].slice(0, 300);
  const inPlace = sameDomainRebuild(i.existingSiteUrl, s.canonical_domain);
  const H = (x: string) => ['', '## ' + x, ''];
  const L: string[] = [
    masterPrompt(i, { lean: true, execution: true }).text,
    '',
    '# ════════ EXECUTION — build it, push it, deploy the PREVIEW, report ════════',
    'LeadFinderOS config fingerprint: ' + ver + ' (quote it in your final report).',
    ...H('X1. DESTINATION — a SEPARATE client project (check before you write anything)'),
    '- Local folder: ' + path + '   Repository: ' + remote + '   Branch: main',
    ...(t ? ['- The template ' + t.name + ' lives at ' + t.sourceRepoUrl + '. It is READ-ONLY: clone it to ' + winPath(path.replace(/\\[^\\]+$/, '')) + '\\_templates\\' + t.id + ' (or "git pull --ff-only" there), then copy it into the client folder WITHOUT its .git folder. Never commit, push or open a branch in the template repository.'] : []),
    ...(t ? ['- ⛔ INHERITED HAZARDS — the template repository is a finished client site, not a clean kit. Before building, check and fix in the CLIENT copy: public/_headers must send X-Robots-Tag noindex ONLY for https://:project.pages.dev/* and https://:branch.:project.pages.dev/* (a "/*" noindex rule would hide the production site from search); remove any AggregateRating / Review structured data; and rewrite any service or location pages that share their wording (the gate fails near-duplicates). The site quality gate (X9b) fails all three.'] : []),
    '- ⛔ Never write to: the template repository, the MCL / any other client\'s production repository, the Findable website repository, or LeadFinderOS.',
    '- Before the first commit run "git remote -v" in ' + path + '. It must show exactly ' + remote + '. If the folder already exists with a different remote, or its git history belongs to another project, STOP and report.',
    '- If ' + remote + ' does not exist yet: create it (private, empty) with "gh repo create" if the GitHub CLI is installed and signed in. If it is not, STOP and report the operator action: "Create an EMPTY private repository ' + (s.repo_name || MARK.repo) + ' under ' + (s.github_owner || MARK.owner) + ' at https://github.com/new, then re-run".',
    ...H('X2. CLIENT CONFIG — one source of truth'),
    ...(t ? [
      '- Write the generated client config (section E2) into the template\'s REAL config / content layer: ' + t.clientContentFiles.slice(0, 5).join(', ') + '.',
      '- Business identity, phone, WhatsApp, email, domain, hours, service area, services, prices, credentials, guarantee, payments, tracking, locations, images and the structured data must all read from that layer. Never scatter a client detail into a component.',
      '- Brand: ' + (m.config.brand.mark === 'logo' ? 'the approved logo file ' + m.config.brand.logo + '.' : 'NO logo — render a TEXT WORDMARK of "' + m.config.brand.wordmark + '" in the template\'s own typography. Do not create, generate or trace a logo image.'),
      '- A mapped field the template cannot hold yet: do NOT hard-code it somewhere else — list it in build.unsupportedFields.',
    ] : [
      '- Put every business fact in ONE config / content module (src/lib/siteConfig.ts) and have pages and components read from it. No client detail hard-coded in components.',
    ]),
    ...H('X3. ASSETS — ' + assets.length + ' approved (USE): ' + plan.assigned.length + ' assigned to a slot, ' + plan.approvedAdditional.length + ' additional'),
    ...(assets.length ? assetPlanLines(plan, safeAssetName) : ['- (none — build without images; never a stock or seed image)', ...(held ? [held + ' asset(s) are still REVIEW in LeadFinderOS — do not download them.'] : [])]),
    '- Originals to capture/assets/original/ (never edited); optimised web copies (WebP/AVIF, longest edge ≤ 2400px; SVG as-is) to public/images/; safe lowercase filenames; each URL once; identical bytes kept once.',
    '- Never hotlink. Record every "source URL -> local file" in build.assets; a failed download goes in warnings — never substitute another image.',
    ...(t && m.config.brand.mark !== 'logo' ? ['- Text wordmark: no logo file is downloaded or created.'] : []),
    ...H('X4. SEED-CLIENT SCRUB — blocks the preview'),
    ...(t ? [
      '- LeadFinderOS has already scanned the config: clean.',
      '- AFTER building, search the WHOLE source (src, public, functions, astro.config.*, package.json, README) AND the built output (' + cfg.outputDir + '/) — whole words, case-insensitive — for every one of:',
      '    ' + t.leftoverNeedles.join(' · '),
      '- A hit is legitimate ONLY if that exact value is in the client config above. Every other hit: remove it and re-build. If any remain, DO NOT deploy the preview: status "needs_attention", qa.seedContaminationPassed false, list them in seedHits.',
    ] : inPlace ? [
      '- The old site and the new one share the domain ' + s.canonical_domain + ': canonicals, links and schema MUST use https://' + s.canonical_domain + ' — that is not a hit.',
      '- Search the source and ' + cfg.outputDir + '/ instead for what the OLD PLATFORM leaves behind: any file hotlinked from the old site or its CDN, internal links to old-only paths (anything not built and not in the redirect map), copy lifted from the old site, and any placeholder or another business\'s details. Any hit blocks the preview (qa.seedContaminationPassed false, list in seedHits).',
    ] : [
      '- Search the source and ' + cfg.outputDir + '/ for the OLD domain' + (i.existingSiteUrl ? ' (' + i.existingSiteUrl + ')' : '') + ' in canonicals / links / schema and for any placeholder or another business\'s details. Any hit blocks the preview (qa.seedContaminationPassed false, list in seedHits).',
    ]),
    ...H('X5. PAGES — only these'),
    ...(t ? [
      '- Service pages ONLY for: ' + (m.config.services.map((x) => x.name).join(', ') || '(none)') + '.',
      '- Location pages ONLY for: ' + ((m.config.locations.pages as string[]).join(', ') || '(none)') + '. Served areas without a page appear only in the service-area wording.',
      '- Plus the template\'s required core pages (home, services index, about, contact, legal) and any optional page whose data is in the config. Nothing mass-generated.',
    ] : isFaithfulRoute(s) ? ['- The approved source architecture (section H): every kept / created page, nothing else.'] : ['- The approved Architecture (section H): every kept / created page, nothing else.']),
    '- One important intent = one primary page. Copy, where it must be written: CUSTOMER QUESTION → DIRECT ANSWER → SUPPORTING DETAIL → EVIDENCE, from approved facts only. No padding, no keyword stuffing.',
    ...H('X5b. THE FINDABLE QUALITY STANDARD — perceived quality is half of Preview Ready'),
    ...QUALITY_STANDARD_LINES.map((l) => '- ' + l),
    '',
    ...(s.quality.strengths.length ? [
      'EXISTING-SITE STRENGTHS and Paul\'s decision for each (the no-downgrade rule — every one must be honoured):',
      ...s.quality.strengths.map((x) => '- [' + STRENGTH_CATEGORY_LABELS[x.category] + '] ' + oneLine(x.label) + ' → ' + (x.disposition ? STRENGTH_DISPOSITION_LABELS[x.disposition].toUpperCase() : 'UNDECIDED') + (x.where ? ' at ' + oneLine(x.where) : '') + (x.reason ? ' (' + oneLine(x.reason) + ')' : '')),
    ] : [i.existingSiteUrl ? 'Existing-site strengths: none recorded.' : 'No existing site: enforce the completeness standard anyway — never a sparse site because there is nothing to compare with.']),
    '',
    'CONTENT INTENTS — one primary page each:',
    ...CONTENT_INTENTS.map((k) => { const d = s.quality.intents[k]; return '- ' + CONTENT_INTENT_LABELS[k] + ': ' + (!d?.need ? 'NOT ASSESSED' : d.need === 'needed' ? 'needed → ' + (oneLine(d.page) || '(no page)') : 'not needed') + (d?.note ? ' — ' + oneLine(d.note) : ''); }),
    ...H('X5c. THE FINDABLE BUILD STANDARD — what MCL and BS4 had to be corrected for, required from the first build'),
    ...BUILD_STANDARD_LINES.map((l) => '- ' + l),
    '',
    ...standardEvidenceLines(s),
    ...H('X5d. ENQUIRY FORM — the Findable site-enquiry backend'),
    '- If the site has an enquiry / quote form (required where the old site had a working one), it posts to ' + SITE_ENQUIRY_ENDPOINT + '?site=<site key> — JSON from the page script, or a plain form post without JavaScript (answered with a 303 back to the site). Fields: name, phone, email, service, location, message; a hidden honeypot input named company_website; fill_ms = milliseconds from page load to submit (a duration, never a timestamp).',
    '- The recipient is NEVER in the page: it comes from the site key\'s CLIENT_SITES entry in LeadFinderOS (supabase/functions/_shared/site-enquiry.ts). The preview origin is TEST mode automatically (the Resend test inbox, never the client). Show the real success / failure state; no fake thank-you.',
    '- If the site key is not registered yet, the form cannot be proven: say so in warnings as an operator step (add the CLIENT_SITES entry for this client\'s production and *.pages.dev origins, redeploy site-enquiry), report formTest "not_run", and do NOT call it preview_ready. Once registered, submit ONE test enquiry from the preview and report formTest "passed" only if it succeeded.',
    '- No form (phone / WhatsApp / email only) is allowed only when the old site had no working form. Never a mailto or text/plain post dressed as a form.',
    ...H('X6. SEO / AI VISIBILITY'),
    '- Crawlable public HTML, HTTPS-ready, self-referencing canonicals on https://' + s.canonical_domain + ', XML sitemap of every built page, robots.txt allowing OAI-SearchBot / ChatGPT-User / Claude-User / PerplexityBot and pointing at the sitemap, no noindex in the PRODUCTION configuration.',
    '- Titles and meta descriptions: unique per page, specific (service · place · business), about 60 / 155 characters, never stuffed. Exactly ONE H1 per page naming what the page is for; headings in order (H2 then H3, no skipped level).',
    '- Internal links (by need, never a link farm): home → every service page (or the services hub) and the areas hub; services hub → each service; each service page → the areas it genuinely serves (and those location pages) + contact; each location page → the services offered there + contact; breadcrumbs on every page below home; no orphan, nothing deeper than three clicks; link to final URLs (trailing slash), never to a redirect.',
    '- Structured data (JSON-LD, only verified facts, matching what the page shows): ONE business entity with a stable @id of https://' + s.canonical_domain + '/#business, typed with the schema.org trade SUBTYPE where one exists (Electrician, Locksmith, Plumber, HVACBusiness, RoofingContractor, AccountingService …; plain LocalBusiness only when none fits), with name, url, telephone, email, address (only if customers visit / it is public) and areaServed; sameAs only for verified profiles. Every other page refers to it by @id — never a second business. A BreadcrumbList on every page below home. Service nodes only for BUILT service pages, with provider → the business @id and areaServed where genuine.',
    '- Entity and contact details identical everywhere — page copy, header, footer, tel: / mailto: links and schema.',
    '- Do NOT add: llms.txt, hidden AI text, prompt pages, fake citations, review / rating schema (show genuine reviews as visible content only — never AggregateRating / Review markup), mass FAQs or FAQ schema on every page, schema stuffing.',
    ...H('X6b. SITE INTENT MAP — which page owns which intent'),
    ...siteIntentMapLines(siteIntentMap(i, m), i),
    ...H('X7. GITHUB'),
    '- Commit the initial client build ("Initial ' + (i.businessName || 'client') + ' build' + (t ? ' from ' + t.name + ' v' + t.version : '') + '"), push main to ' + remote + ', record the commit hash.',
    '- Safe git only: never force push, reset, rebase, amend or clean.',
    ...H('X8. CLOUDFLARE PAGES — PREVIEW ONLY'),
    '- Project: ' + s.cloudflare_project + ' · deployment: ' + modeLabel(s) + '. Build with tracking OFF for the preview (no analytics / ads tags emitted, whatever the config holds).',
    ...previewDeploySteps(deployInputFor(s, i.template)),
    '- Confirm noindex: curl -sI ' + stablePreviewUrl(s) + '/ must show an X-Robots-Tag noindex header. If it does not, do not call it preview_ready.',
    '- ⛔ Never deploy to the production branch (' + cloudflareBranches(s).production + '), never add a custom domain, never touch DNS, never store or ask for a credential.',
    ...H('X9. QA — before you say preview_ready'),
    '- TECHNICAL: the production build passes; every internal link resolves; canonicals; sitemap; robots.txt; the 404 page; schema is valid JSON-LD matching the page; no accidental noindex in the production configuration; preview noindex confirmed; no broken assets; ' + (inPlace ? 'no hotlinked old-site file anywhere' : 'no old domain anywhere') + '; seed scrub clean.',
    '- CONTENT: correct business name; phone and email consistent everywhere; selected services only; selected locations only; approved facts only; no placeholder copy; no unsupported proof.',
    '- RESPONSIVE (Playwright screenshots under qa/): 1440, 1024, 768, 390 and iPhone SE (375×667) — no horizontal overflow; navigation, hero, cards, CTAs, footer, floating controls, images and forms (fill, never submit) all correct.',
    ...UPGRADE_QA_LINES,
    '- BUILD STANDARD (X5c): at 390 and 375 check the hero is one first screen (photo behind the copy, readable, call button visible), the areas map labels are legible, reviews and credentials are visible, tap targets are 44px+ and the form works; then fill quality.standard with what you BUILT.',
    ...(i.existingSiteUrl ? ['- The OLD site for the comparison: ' + i.existingSiteUrl + ' (read-only — never submit its forms).'] : []),
    '- Targeted checks on the built client site only — do not run large unrelated test suites.',
    ...H('X9b. THE FINDABLE SITE QUALITY GATE — the automated check LeadFinderOS trusts over your own'),
    ...siteGateLines(cfg.outputDir, s.canonical_domain, stablePreviewUrl(s)),
    ...H('X10. OLD URL COVERAGE — on the REAL build'),
    ...(sourcePaths.length ? [
      'For each source path below, check the BUILT site: it exists (KEPT), public/_redirects sends it with ONE 301 to a page that exists (REDIRECTED), it is deliberately gone (RETIRED), or nothing (UNRESOLVED). Flag: a redirect target that does not exist, chains, loops, redirects to an unrelated page, and important pages nothing links to.',
      '    ' + sourcePaths.join('  '),
    ] : ['(No source URL inventory — report redirects as 0 and say so in warnings if the client has an old site.)']),
    ...H('X11. REPORT — end with ONE JSON result'),
    ...BUILD_RESULT_SCHEMA_LINES,
    '',
    ...BUILD_RESULT_RULES,
  ];
  return { text: L.join('\n'), blockedBy: [], configVersion: ver };
}

/* ── parse the result ─────────────────────────────────────────────────────────────────────────── */

export const MAX_BUILD_RESULT_CHARS = 600_000;
export interface BuildResult {
  status: BuildResultStatus;
  repository: { url: string; name: string; branch: string; commitHash: string };
  local: { path: string; devCommand: string; buildCommand: string; outputDirectory: string };
  cloudflare: { projectName: string; previewUrl: string; deploymentId: string; status: string; noindexConfirmed: boolean | null };
  build: { pages: string[]; services: string[]; locations: string[]; assets: string[]; unsupportedFields: string[] };
  redirects: { kept: number | null; redirected: number | null; retired: number | null; unresolved: string[]; issues: string[] };
  qa: Partial<Record<BuildQaKey, boolean>>;
  seedHits: string[]; warnings: string[]; errors: string[];
  /** The old-vs-new comparison (quality.oldVsNew). Optional in the contract: an old result reads as not reported. */
  upgrade: UpgradeReview;
  /** The build standard (quality.standard). Optional in the contract: an old result reads as not reported. */
  standard: StandardReport;
  /** The site quality gate on the build output (quality.siteGate) and on the preview (quality.siteGatePreview). */
  siteGate: SiteGateReport;
  siteGatePreview: SiteGateReport;
}
export interface BuildResultSummary { dropped: string[]; ignoredKeys: string[]; notes: string[] }
export type BuildResultParse = { ok: true; result: BuildResult; summary: BuildResultSummary } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const KNOWN = new Set(['buildResultVersion', 'status', 'repository', 'local', 'cloudflare', 'build', 'redirects', 'qa', 'quality', 'seedHits', 'warnings', 'errors']);
const num = (v: unknown) => { const n = Math.floor(Number(v)); return v != null && v !== '' && Number.isFinite(n) && n >= 0 && n < 100000 ? n : null; };

export function parseBuildResult(input: string): BuildResultParse {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Nothing pasted.' };
  if (input.length > MAX_BUILD_RESULT_CHARS) return { ok: false, error: 'That is ' + Math.round(input.length / 1000) + ' KB — the limit is ' + Math.round(MAX_BUILD_RESULT_CHARS / 1000) + ' KB. Ask Claude for the build-result JSON only.' };
  const ex = extractJson(input);
  if ('error' in ex) return { ok: false, error: ex.error.replace('recon result', 'build result') };
  const o = ex.value;
  if (!isObj(o)) return { ok: false, error: 'The JSON is not an object. A build result is one { … } object.' };
  if (o.buildResultVersion !== BUILD_RESULT_VERSION) return { ok: false, error: o.buildResultVersion == null ? 'This is not a build result: no "buildResultVersion". (A recon result goes in Capture → Import Recon Result.)' : 'buildResultVersion ' + clean(o.buildResultVersion, 10) + ' is not supported (this LeadFinderOS reads version ' + BUILD_RESULT_VERSION + ').' };
  const status = clean(o.status, 30).toLowerCase() as BuildResultStatus;
  if (!['preview_ready', 'built', 'needs_attention', 'failed'].includes(status)) return { ok: false, error: '"status" must be preview_ready, built, needs_attention or failed — got "' + clean(o.status, 30) + '".' };
  for (const k of ['repository', 'local', 'cloudflare', 'build', 'redirects', 'qa'] as const) if (o[k] != null && !isObj(o[k])) return { ok: false, error: '"' + k + '" must be an object ({ … }).' };
  for (const k of ['seedHits', 'warnings', 'errors'] as const) if (o[k] != null && !Array.isArray(o[k])) return { ok: false, error: '"' + k + '" must be a list ([ … ]).' };
  const dropped: string[] = [], notes: string[] = [];
  const rep = isObj(o.repository) ? o.repository : {}, loc = isObj(o.local) ? o.local : {}, cf = isObj(o.cloudflare) ? o.cloudflare : {};
  const bd = isObj(o.build) ? o.build : {}, rd = isObj(o.redirects) ? o.redirects : {}, qa0 = isObj(o.qa) ? o.qa : {};
  /* A site root keeps no trailing slash (https://preview.x.pages.dev), as Paul types it. */
  const url = (v: unknown, what: string) => { const raw = clean(v, 500); const u = safeUrl(raw); if (raw && !u) dropped.push(what + ' "' + raw.slice(0, 80) + '" is not an http(s) URL'); return u.replace(/^(https?:\/\/[^/]+)\/$/, '$1'); };
  const list = (v: unknown, n: number, cap: number, what: string) => {
    const a = Array.isArray(v) ? v.map((x) => clean(x, cap)).filter(Boolean) : [];
    if (a.length > n) dropped.push((a.length - n) + ' ' + what + ' over the ' + n + ' limit');
    return a.slice(0, n);
  };
  const commit = clean(rep.commitHash, 64);
  if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) dropped.push('commitHash "' + commit.slice(0, 20) + '" is not a git hash');
  const repoUrl = url(rep.url, 'repository.url');
  if (repoUrl && !/^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(repoUrl)) notes.push('The repository is not on github.com — check it is the client’s.');
  const previewUrl = url(cf.previewUrl, 'cloudflare.previewUrl');
  if (previewUrl && !/\.pages\.dev(\/|$)/i.test(previewUrl)) notes.push('The preview URL is not a pages.dev address — it cannot count as a safe preview.');
  const qa: Partial<Record<BuildQaKey, boolean>> = {};
  for (const k of BUILD_QA_KEYS) if (typeof qa0[k] === 'boolean') qa[k] = qa0[k] as boolean;
  const pages = list(bd.pages, 600, 300, 'page(s)').map((p) => (/^https?:\/\//i.test(p) ? toPath(p) : p.startsWith('/') ? p : '/' + p));
  const result: BuildResult = {
    status,
    repository: { url: repoUrl, name: clean(rep.name, 100), branch: clean(rep.branch, 100), commitHash: /^[0-9a-f]{7,40}$/i.test(commit) ? commit.toLowerCase() : '' },
    local: { path: clean(loc.path, 500), devCommand: clean(loc.devCommand, 200), buildCommand: clean(loc.buildCommand, 200), outputDirectory: clean(loc.outputDirectory, 200) },
    cloudflare: { projectName: clean(cf.projectName, 100).toLowerCase(), previewUrl, deploymentId: clean(cf.deploymentId, 100), status: clean(cf.status, 60), noindexConfirmed: typeof cf.noindexConfirmed === 'boolean' ? cf.noindexConfirmed : null },
    build: { pages, services: list(bd.services, 100, 160, 'service(s)'), locations: list(bd.locations, 100, 160, 'location(s)'), assets: list(bd.assets, 300, 600, 'asset line(s)'), unsupportedFields: list(bd.unsupportedFields, 50, 160, 'unsupported field(s)') },
    redirects: { kept: num(rd.kept), redirected: num(rd.redirected), retired: num(rd.retired), unresolved: list(rd.unresolved, 600, 500, 'unresolved URL(s)'), issues: list(rd.issues, 200, 500, 'redirect issue(s)') },
    qa, seedHits: list(o.seedHits, 100, 300, 'seed hit(s)'), warnings: list(o.warnings, 100, 500, 'warning(s)'), errors: list(o.errors, 100, 500, 'error(s)'),
    upgrade: isObj(o.quality) && isObj(o.quality.oldVsNew) ? readUpgradeReview(o.quality.oldVsNew) : EMPTY_UPGRADE,
    standard: isObj(o.quality) && isObj(o.quality.standard) ? readStandardReport(o.quality.standard) : EMPTY_STANDARD,
    siteGate: isObj(o.quality) ? readSiteGateReport(o.quality.siteGate) : EMPTY_SITE_GATE,
    siteGatePreview: isObj(o.quality) ? readSiteGateReport(o.quality.siteGatePreview) : EMPTY_SITE_GATE,
  };
  const rawVerdict = isObj(o.quality) && isObj(o.quality.oldVsNew) ? clean(o.quality.oldVsNew.verdict, 30) : '';
  if (rawVerdict && !(UPGRADE_VERDICTS as readonly string[]).includes(rawVerdict)) dropped.push('quality.oldVsNew.verdict "' + rawVerdict + '" is not upgrade / not_upgrade');
  if (result.build.unsupportedFields.length) result.warnings = [...result.warnings, 'Template cannot hold yet: ' + result.build.unsupportedFields.join(', ')].slice(0, 100);
  return { ok: true, result, summary: { dropped, ignoredKeys: Object.keys(o).filter((k) => !KNOWN.has(k)), notes } };
}

/* ── merge the result ─────────────────────────────────────────────────────────────────────────── */

export interface ProjectConflict { field: string; label: string; current: string; imported: string }
const sameVal = (a: string, b: string) => a.trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '') === b.trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');

/** The project fields a result can fill, and where each comes from in the result. */
function projectPairs(r: BuildResult): Array<{ field: keyof WebsiteBuildState; label: string; value: string }> {
  return [
    { field: 'repo_url', label: 'Repository URL', value: r.repository.url },
    { field: 'repo_name', label: 'Repository name', value: r.repository.name },
    { field: 'local_repo_path', label: 'Local folder', value: r.local.path },
    { field: 'dev_command', label: 'Dev command', value: r.local.devCommand },
    { field: 'build_command', label: 'Build command', value: r.local.buildCommand },
    { field: 'build_output_dir', label: 'Build output directory', value: r.local.outputDirectory },
    { field: 'cloudflare_project', label: 'Cloudflare project', value: r.cloudflare.projectName },
    { field: 'preview_url', label: 'Preview URL', value: r.cloudflare.previewUrl },
  ];
}

/** Project values the result would change that Paul had already set differently. */
export function projectConflicts(s: WebsiteBuildState, r: BuildResult): ProjectConflict[] {
  return projectPairs(r).filter((p) => p.value && String(s[p.field] ?? '') && !sameVal(String(s[p.field]), p.value))
    .map((p) => ({ field: String(p.field), label: p.label, current: String(s[p.field]), imported: p.value }));
}

/**
 * The site quality gate's verdict, applied to an imported result: its problems become ERRORS (so the
 * existing gate — previewGateProblems — refuses Preview Ready), a failed gate check turns the matching
 * self-reported qa value false, and its warnings are carried. Stored in the existing errors / warnings /
 * qa keys, so the saved shape (paid-client-hub's allowlist) does not change.
 * ⛔ A result claiming preview_ready / needs_attention with NO gate report is an error: not run ≠ passed.
 */
export function siteGateResult(s: WebsiteBuildState, r: BuildResult): { errors: string[]; warnings: string[]; qa: BuildResult['qa'] } {
  const qa = { ...r.qa };
  if (r.status === 'failed') return { errors: [], warnings: [], qa };
  const deployed = r.status === 'preview_ready' || r.status === 'needs_attention';
  const errors = [
    ...(deployed || r.siteGate.reported ? siteGateProblems(r.siteGate, s.canonical_domain) : []),
    ...(r.status === 'preview_ready' || r.siteGatePreview.reported ? siteGateProblems(r.siteGatePreview, s.canonical_domain, { preview: true }) : []),
  ];
  for (const rep of [r.siteGate, r.siteGatePreview]) for (const c of rep.checks) if (c.level === 'fail' && GATE_QA_OVERRIDES[c.id]) qa[GATE_QA_OVERRIDES[c.id]] = false;
  const warned = [...r.siteGate.checks, ...r.siteGatePreview.checks].filter((c) => c.level === 'warn');
  const warnings = warned.length ? ['Site gate warnings to read: ' + [...new Set(warned.map((c) => c.label))].join('; ')] : [];
  return { errors, warnings, qa };
}

/**
 * Merge a parsed build result. Pure. Facts, mapping, route, page plan, redirects and QA ticks are
 * untouched. Empty project fields are filled; a CONFLICTING value is kept unless acceptConflicts.
 * A failed result records its errors and keeps the previous preview / commit as they were.
 */
export function applyBuildResult(s: WebsiteBuildState, r: BuildResult, opts: { now: string; acceptConflicts?: boolean }): { state: WebsiteBuildState; conflicts: ProjectConflict[] } {
  const conflicts = projectConflicts(s, r);
  const failed = r.status === 'failed';
  const next: WebsiteBuildState = { ...s };
  for (const p of projectPairs(r)) {
    if (!p.value) continue;
    if (failed && p.field === 'preview_url') continue;
    const cur = String(s[p.field] ?? '');
    if (!cur || sameVal(cur, p.value) || opts.acceptConflicts) (next as unknown as Record<string, unknown>)[p.field] = p.field === 'cloudflare_project' ? p.value.toLowerCase() : p.value;
  }
  const kept = conflicts.filter((c) => !opts.acceptConflicts).map((c) => 'Kept your ' + c.label + ' "' + c.current + '" — the build reported "' + c.imported + '".');
  if (!failed) {
    if (r.repository.commitHash) next.latest_commit = r.repository.commitHash;
    if (r.cloudflare.previewUrl && (r.status === 'preview_ready' || r.status === 'needs_attention')) next.preview_status = 'deployed';
    if (r.cloudflare.noindexConfirmed === true) next.preview_noindex_confirmed = true;
  }
  const prev = s.build_execution;
  const previous = prev.result_imported_at && prev.result_status !== 'failed'
    ? { commit_hash: prev.commit_hash, repository_url: prev.repository_url, preview_url: prev.preview_url, result_status: prev.result_status, imported_at: prev.result_imported_at }
    : prev.previous;
  const keepPrev = (a: string, b: string) => (failed ? (a || b) : (a || b));
  const gate = siteGateResult(s, r);
  const be: BuildExecution = {
    ...EMPTY_BUILD_EXECUTION,
    started_at: prev.started_at || opts.now, completed_at: opts.now,
    template_id: prev.template_id || s.template_id, config_version: prev.config_version,
    repository_url: keepPrev(r.repository.url, prev.repository_url), repository_name: r.repository.name || prev.repository_name,
    branch: r.repository.branch || prev.branch, local_path: r.local.path || prev.local_path,
    cloudflare_project: r.cloudflare.projectName || prev.cloudflare_project,
    preview_url: failed ? prev.preview_url : (r.cloudflare.previewUrl || prev.preview_url),
    deployment_id: r.cloudflare.deploymentId || (failed ? prev.deployment_id : ''),
    deployment_status: r.cloudflare.status, noindex_confirmed: r.cloudflare.noindexConfirmed,
    output_dir: r.local.outputDirectory || prev.output_dir,
    commit_hash: r.repository.commitHash || (failed ? prev.commit_hash : ''),
    result_imported_at: opts.now, result_status: r.status,
    warnings: [...r.warnings, ...kept, ...gate.warnings].slice(0, 100), errors: [...gate.errors, ...r.errors].slice(0, 100), qa: gate.qa,
    pages: r.build.pages, services: r.build.services, locations: r.build.locations, assets: r.build.assets,
    redirects: r.redirects, seed_hits: r.seedHits, upgrade: r.upgrade ?? EMPTY_UPGRADE, standard: r.standard ?? EMPTY_STANDARD, previous,
  };
  next.build_execution = be;
  return { state: next, conflicts };
}

/* ── old URL coverage on the REAL build ───────────────────────────────────────────────────────── */

export type CoverageDecision = 'kept' | 'redirected' | 'retired' | 'unresolved';
export interface CoverageRow { path: string; family: string; decision: CoverageDecision; target: string; flags: string[] }

/** Every source URL (the recon manifest) against the routes the build REPORTED and the redirect map. */
export function builtCoverage(s: WebsiteBuildState): { rows: CoverageRow[]; counts: Record<CoverageDecision, number>; assessed: boolean } {
  const built = new Set(s.build_execution.pages.map((p) => pathKey(p)));
  const counts = { kept: 0, redirected: 0, retired: 0, unresolved: 0 } as Record<CoverageDecision, number>;
  if (!built.size) return { rows: [], counts, assessed: false };
  const red = new Map(s.redirects.map((r) => [pathKey(r.from), r]));
  const coveredBy = redirectMatcher(s.redirects);
  const removed = new Set(s.pages.filter((p) => p.action === 'remove' && p.old_url).map((p) => pathKey(p.old_url)));
  const rows: CoverageRow[] = [];
  const seen = new Set<string>();
  for (const p of s.manifest.pages) {
    const key = pathKey(p.url);
    if (seen.has(key)) continue;
    seen.add(key);
    const flags: string[] = [];
    let decision: CoverageDecision = 'unresolved', target = '';
    const r = coveredBy(key);
    if (built.has(key)) { decision = 'kept'; if (r) flags.push('also redirected — the redirect would hide the built page'); }
    else if (r) {
      decision = 'redirected'; target = r.to;
      const tk = pathKey(r.to);
      if (!/^https?:\/\//i.test(r.to) && !built.has(tk)) flags.push('redirect target does not exist in the build');
      if (red.has(tk)) flags.push(pathKey(red.get(tk)!.to) === key ? 'redirect loop' : 'redirect chain');
      if (tk === '/' && p.type !== 'homepage') flags.push('redirects to the homepage');
    } else if (removed.has(key)) { decision = 'retired'; flags.push('retired with no redirect — returns "not found"'); }
    else flags.push('no decision — not built and not redirected');
    counts[decision]++;
    rows.push({ path: toPath(p.url), family: PAGE_FAMILY_LABELS[p.type], decision, target, flags });
  }
  const order: Record<CoverageDecision, number> = { unresolved: 0, retired: 1, redirected: 2, kept: 3 };
  rows.sort((a, b) => order[a.decision] - order[b.decision] || b.flags.length - a.flags.length);
  return { rows, counts, assessed: true };
}

/* ── retry (delta only) and review prompts ────────────────────────────────────────────────────── */

export function retryPrompt(i: BuildPackInput): { text: string; blockedBy: string[] } {
  const s = i.state, b = s.build_execution;
  const gate = previewReadyProblems(s, !!i.existingSiteUrl);
  if (!b.result_imported_at || (b.result_status !== 'failed' && b.result_status !== 'needs_attention' && !gate.length))
    return { text: 'No failed or incomplete build to retry.', blockedBy: ['A failed / needs-attention build result'] };
  const m = computeMapping(s, i.template, i.facts, i.businessName);
  const failedQa = BUILD_QA_KEYS.filter((k) => b.qa[k] === false);
  const L = [
    '# BUILD RETRY — ' + (i.businessName || 'this client'),
    '',
    'Build route: ' + (s.route ? BUILD_ROUTE_LABELS[s.route] : '—') + '. Work in: ' + (s.local_repo_path ? winPath(s.local_repo_path) : MARK.path) + ' (repository ' + (b.repository_url || s.repo_url || expectedRemote(s)) + ').',
    'The site already exists. Do NOT rebuild it from scratch and do not re-download assets that are already there. Fix ONLY what is listed, then re-run the affected checks, redeploy the PREVIEW and report.',
    '',
    'Last result: ' + b.result_status.toUpperCase() + (b.commit_hash ? ' at commit ' + b.commit_hash : '') + (b.preview_url ? ' · preview ' + b.preview_url : '') + '.',
    ...(b.errors.length ? ['', 'ERRORS:', ...b.errors.map((e) => '- ' + e)] : []),
    ...(failedQa.length ? ['', 'FAILED CHECKS: ' + failedQa.join(', ')] : []),
    ...(b.seed_hits.length ? ['', 'SEED-CLIENT VALUES STILL PRESENT (remove each, unless it is in the config below): ' + b.seed_hits.join(' · ')] : []),
    ...(gate.length ? ['', 'WHY IT IS NOT PREVIEW READY: ' + gate.join('; ')] : []),
    ...(b.upgrade.still_stronger.length ? ['', 'WHERE THE OLD SITE STILL LOOKS STRONGER (fix each, then compare old and new again):', ...b.upgrade.still_stronger.map((x) => '- ' + x)] : []),
    ...(b.upgrade.verdict === 'not_upgrade' || gate.some((g) => /upgrade|old site|strength|Content completeness/i.test(g)) ? ['', 'THE QUALITY STANDARD (unchanged):', ...QUALITY_STANDARD_LINES.map((l) => '- ' + l), ...UPGRADE_QA_LINES] : []),
    ...(standardProblems(b.standard, standardEvidence(s)).length ? ['', 'THE BUILD STANDARD (unchanged — fix what the gate names, then report quality.standard again):', ...BUILD_STANDARD_LINES.map((l) => '- ' + l)] : []),
    ...(b.errors.some((e) => /site gate|site quality gate/i.test(e)) ? ['', 'THE SITE QUALITY GATE (fix the SITE until it passes — never the gate):', ...siteGateLines(b.output_dir || codeConfig(s, i.template).outputDir, s.canonical_domain, stablePreviewUrl(s))] : []),
    ...(b.redirects.unresolved.length ? ['', 'UNRESOLVED OLD URLs (ask Paul — do not invent a target): ' + b.redirects.unresolved.slice(0, 50).join('  ')] : []),
    ...(b.warnings.length ? ['', 'Warnings from last time (fix only if they are part of the above): ' + b.warnings.slice(0, 15).join(' | ')] : []),
    ...(isTemplateRoute(s) ? ['', 'CURRENT CLIENT CONFIG (unchanged rules: only this data, nothing invented):', '```json', JSON.stringify(m.config, null, 2), '```'] : []),
    '',
    'Safe git only (no force push / reset / rebase / amend / clean). Redeploy the PREVIEW only — ' + modeLabel(s) + ':',
    ...previewDeploySteps({ ...deployInputFor(s, i.template), project: b.cloudflare_project || s.cloudflare_project || MARK.project }),
    'Confirm noindex on ' + stablePreviewUrl(s, b.cloudflare_project || s.cloudflare_project || MARK.project) + '.',
    '',
    'End with the same JSON result as before:', ...BUILD_RESULT_SCHEMA_LINES, '', ...BUILD_RESULT_RULES,
  ];
  return { text: L.join('\n'), blockedBy: [] };
}

export function reviewPrompt(i: BuildPackInput): { text: string; blockedBy: string[]; kind: 'template' | 'design' } {
  const s = i.state, b = s.build_execution;
  const preview = b.preview_url || s.preview_url;
  const m = computeMapping(s, i.template, i.facts, i.businessName);
  const kind = isTemplateRoute(s) ? 'template' : 'design';
  const t = isTemplateRoute(s) ? i.template : null;
  const L = [
    '# ' + (kind === 'template' ? 'TEMPLATE REVIEW' : 'DESIGN REVIEW') + ' — ' + (i.businessName || 'this client'),
    '',
    'Inspect the deployed preview ' + (preview || MARK.preview) + ' (and the repository ' + (b.repository_url || s.repo_url || '—') + '). Fix genuine problems in the client project, redeploy the PREVIEW, report.',
    kind === 'template'
      ? '⛔ Do NOT redesign the ' + (t?.name ?? 'template') + ' because of taste. Fix only real defects and client-specific adaptation problems.'
      : 'Judge the design against: ' + (s.design_references || 'the Findable standard (clean, bold, mobile-first)') + '. Fix real defects; do not start a redesign.',
    '',
    'Verify, page by page:',
    '- Client identity: name "' + String((m.config.business as Record<string, unknown>).name ?? i.businessName) + '", phone, email and domain correct and identical everywhere.',
    ...(kind === 'template' ? [
      '- Services: exactly ' + (m.config.services.map((x) => x.name).join(', ') || '(none)') + '. Location pages: exactly ' + ((m.config.locations.pages as string[]).join(', ') || '(none)') + '.',
      '- Proof: only what the config holds — nothing else claimed. Images: only the approved ones.',
      '- No template contamination: ' + (t ? t.leftoverNeedles.join(' · ') : ''),
    ] : ['- Pages: the approved architecture only; facts: approved only.']),
    '- Visual quality and mobile quality (1440, 1024, 768, 390, iPhone SE): no overflow, clean spacing, readable, working CTAs and menus.',
    '- Page completeness (no placeholder text), internal linking, canonical / sitemap / robots / schema basics, preview noindex.',
    '- Re-run the site quality gate on the build output and on the preview (X9b of the build prompt) and include both reports:',
    ...siteGateLines(b.output_dir || codeConfig(s, i.template).outputDir, s.canonical_domain, preview || stablePreviewUrl(s)),
    '',
    'End with the build-result JSON (status preview_ready only if everything passes):', ...BUILD_RESULT_SCHEMA_LINES, '', ...BUILD_RESULT_RULES,
  ];
  return { text: L.join('\n'), blockedBy: preview ? [] : ['Preview URL'], kind };
}
