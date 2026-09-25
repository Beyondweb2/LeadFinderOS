/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STAGE PROMPTS — one Claude Code prompt per stage, instead of one giant handover.

     Recon · Capture · Architecture · Build · Preview Deployment · Visual Comparison · QA ·
     Production Deployment

   Each is generated at click time from the saved Website Build state + the fact ledger, carries
   ONLY the context its stage needs (credit efficiency: a QA prompt does not repeat the build brief),
   and changes with the Build Route.

   ⛔ ONLY VERIFIED FACTS ARE PRESENTED AS FACTS. A prompt that writes or checks content lists the
   verified facts, and names everything else — needs approval, missing, rejected — as NOT to be
   published. A NEEDS APPROVAL value never appears as a confirmed one.
   ⛔ NOTHING IS INVENTED. A value Paul has not recorded prints as a [.. REQUIRED] marker and the
   prompt lists it under blockedBy. Production Deployment is refused outright until the Cloudflare
   project, the preview URL and the domain are recorded.
   ⚠️ Plain string arrays joined with newlines. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { Stage, WebsiteBuildState } from './websiteBuildState.ts';
import { BUILD_ROUTE_LABELS, compareFamilies, PAGE_FAMILY_LABELS, REBUILD_STYLE_LABELS } from './websiteBuildState.ts';
import type { FactRow } from './buildFacts.ts';
import { reconPrompt } from './recon.ts';
import { manifestArchitectureLines, oneLine } from './manifestSummary.ts';
import { computeMapping } from './templateMapping.ts';
import type { ManifestAsset } from './websiteBuildState.ts';
import { isPublishable } from './buildFacts.ts';
import {
  capturePrompt, cloudflareProblem, codeConfig, finalQaPrompt, isBespokeRoute, isFaithfulRoute,
  isTemplateRoute, MARK, masterPrompt, pageLines, seoQaPrompt, winPath, type BuildPackInput,
} from './buildPack.ts';

export const STAGE_PROMPT_IDS = ['recon', 'capture', 'architecture', 'asset_download', 'build', 'preview_deploy', 'visual_compare', 'qa', 'production_deploy'] as const;
export type StagePromptId = (typeof STAGE_PROMPT_IDS)[number];

export interface StagePrompt {
  id: StagePromptId;
  /** The button: "Copy Recon Prompt". */
  label: string;
  /** Short name for the compact strip. */
  short: string;
  /** The stage this prompt belongs to. */
  stage: Stage;
  help: string;
  blockedBy: string[];
  text: string;
}

const routeLine = (s: WebsiteBuildState) => 'Build route: ' + (s.route ? BUILD_ROUTE_LABELS[s.route] : 'NOT CHOSEN — ask Paul before doing anything');
const header = (title: string, i: BuildPackInput) => ['# ' + title + ' — ' + (i.businessName || 'this client'), '', routeLine(i.state)];
const factVal = (facts: FactRow[], key: string) => { const r = facts.find((f) => f.key === key); return r && isPublishable(r) ? r.value : ''; };
const folder = (s: WebsiteBuildState) => (s.local_repo_path ? winPath(s.local_repo_path) : MARK.path);
const tplLine = (i: BuildPackInput) => (isTemplateRoute(i.state) && i.template ? ['Template: ' + i.template.name + ' v' + i.template.version + ' (' + i.template.trade + ')'] : []);

/* ── RECON — Claude Code crawls the source site and returns ONE structured result (recon.ts). ─── */
function recon(i: BuildPackInput): StagePrompt {
  const p = reconPrompt(i);
  return { id: 'recon', label: 'Copy Recon Prompt', short: 'Recon', stage: 'capture', blockedBy: p.blockedBy,
    help: 'Claude Code crawls the site for this route and ends with one JSON result — paste it back with Import Recon Result.', text: p.text };
}

/* ── CAPTURE — the V1 capture prompt, route-aware, plus the manifest ─────────────────────────── */
function capture(i: BuildPackInput): StagePrompt {
  const p = capturePrompt(i);
  return { id: 'capture', label: 'Copy Capture Prompt', short: 'Capture', stage: 'capture', blockedBy: p.blockedBy,
    help: p.help, text: [routeLine(i.state), '', p.text].join('\n') };
}

/* ── ARCHITECTURE — propose the page plan; route decides how ──────────────────────────────────── */
function architecture(i: BuildPackInput): StagePrompt {
  const s = i.state, t = i.template;
  const L = [
    ...header('ARCHITECTURE', i), ...tplLine(i),
    'Work in: ' + folder(s) + '. Propose the page architecture. Do NOT write site code.',
    'Read capture/manifest.json, capture/urls.csv and capture/SUMMARY.md first if they exist.',
    '',
    'Verified services: ' + (factVal(i.facts, 'services') || '(none verified)'),
    'Verified service areas: ' + (factVal(i.facts, 'service_areas') || '(none verified)'),
    'Verified home town: ' + (factVal(i.facts, 'primary_town') || '(not verified)'),
    'Plan in LeadFinderOS now: ' + s.pages.length + ' page(s), ' + s.redirects.length + ' redirect(s).',
    '',
  ];
  if (isFaithfulRoute(s)) L.push('FAITHFUL REBUILD — PRESERVE the existing information architecture:',
    '- The same pages, the same URL paths, the same navigation order.',
    '- Change a page or URL ONLY with a documented reason (thin duplicate, broken URL, merged intent) —',
    '  and put that reason in the note column. An old URL that moves gets a redirect.');
  else if (isTemplateRoute(s)) L.push('TEMPLATE REBUILD — map the verified facts onto the template\'s page families' + (t ? ' (' + t.defaultPageFamilies.map((f) => f.path).join(' ') + ')' : '') + ':',
    '- One service page per VERIFIED service. Location pages only for verified areas with genuinely local content.',
    '- DROP template pages the client cannot support (pricing without verified prices, gallery without their own photos).',
    '- Every old URL on the current site is kept or redirected to its closest new match.');
  else if (isBespokeRoute(s)) L.push('BESPOKE / NEW TRADE — design a NEW architecture:',
    '- From customer / search intent: what people ask for, one primary page per intent.',
    '- Service structure (index + one page per genuine service), and a location strategy (no cloned town pages).',
    '- For each page, the proof / evidence it needs (put it in the note column; say what is missing).',
    ...(s.design_references ? ['- Design references: ' + s.design_references] : []));
  else L.push('(No build route chosen — STOP and ask Paul.)');
  L.push(...manifestArchitectureLines(s));
  if (s.pages.length) L.push('', 'The current plan (improve it; keep the decisions Paul has made):', ...pageLines(s).slice(0, 60));
  L.push('', 'Reply with two blocks Paul pastes straight into LeadFinderOS:',
    '1. One line per page:  action | family | /new-path/ | Title | old url | redirect target | note',
    '   action: keep, create, consolidate, redirect, remove. family: homepage, services_index, service,',
    '   locations_index, location, commercial, pricing, about, faq, gallery, contact, legal, other.',
    '2. One line per old URL that will not exist at the same path:  /old-path -> /new-path/ | reason',
    '   One hop each, no chains, never everything to the homepage.',
    'THEN STOP.');
  return { id: 'architecture', label: 'Copy Architecture Prompt', short: 'Architecture', stage: 'architecture',
    blockedBy: s.route ? [] : ['Build route'], help: 'Claude proposes the page plan and redirects in the exact format this screen pastes in.', text: L.join('\n') };
}

/* ── BUILD — the lean build brief (no deploy, no QA: those are their own prompts) ─────────────── */
function build(i: BuildPackInput): StagePrompt {
  const p = masterPrompt(i, { lean: true });
  return { id: 'build', label: 'Copy Build Prompt', short: 'Build', stage: 'build_pack', blockedBy: p.blockedBy,
    help: 'The build brief: route, verified facts, architecture, redirects and rules. No deployment.', text: [routeLine(i.state), '', p.text].join('\n') };
}

/* ── PREVIEW DEPLOYMENT — Cloudflare Pages preview, never production ──────────────────────────── */
function previewDeploy(i: BuildPackInput): StagePrompt {
  const s = i.state;
  const cfg = codeConfig(s, i.template);
  const problem = cloudflareProblem(s);
  const project = problem ? MARK.project : s.cloudflare_project;
  const L = [
    ...header('PREVIEW DEPLOYMENT', i),
    'Work in: ' + folder(s),
    '',
    'Localhost (' + cfg.devUrl + ') is for development. The Cloudflare Pages preview is the stable review',
    'version used for full-site comparison before the client domain is connected. Deploy the PREVIEW only.',
    '',
    '1. "git status" is clean (commit first if not) and "' + cfg.buildCommand + '" passes.',
    '2. npx wrangler whoami — say which Cloudflare account it is.',
    '3. If the Pages project "' + project + '" does not exist yet: npx wrangler pages project create ' + project + ' --production-branch main',
    '4. npx wrangler pages deploy ' + cfg.outputDir + ' --project-name ' + project + ' --branch preview',
    '5. Fetch https://preview.' + project + '.pages.dev/ and confirm: it returns 200, it is THIS build (a',
    '   string only this site has), and the response carries "X-Robots-Tag: noindex" (Cloudflare adds it',
    '   to preview addresses). Say plainly whether noindex is present.',
    '',
    '⛔ Never deploy with --branch main. Never touch DNS or custom domains. Production is a separate prompt.',
    '',
    'Reply with exactly:',
    'Preview URL: https://preview.' + project + '.pages.dev',
    'Deployment: deployed / failed (and the error)',
    'Noindex: confirmed / missing',
  ];
  return { id: 'preview_deploy', label: 'Copy Preview Deployment Prompt', short: 'Preview deploy', stage: 'preview',
    blockedBy: [...(problem ? [problem] : []), ...(s.local_repo_path ? [] : ['Local folder'])],
    help: 'Claude deploys the Cloudflare Pages preview and confirms it is noindexed.', text: L.join('\n') };
}

/* ── VISUAL COMPARISON — source vs preview, page family by page family ────────────────────────── */
function visualCompare(i: BuildPackInput): StagePrompt {
  const s = i.state, t = i.template;
  const preview = s.visual.preview_url || s.preview_url;
  const source = isFaithfulRoute(s) ? (s.visual.source_url || i.existingSiteUrl)
    : isTemplateRoute(s) ? (t?.previewUrl || '') : '';
  const fams = compareFamilies(s);
  const example = (f: string) => s.pages.find((p) => p.family === f && (p.action === 'keep' || p.action === 'create'));
  const L = [
    ...header('VISUAL COMPARISON', i),
    'Work in: ' + folder(s) + '. Widths: ' + s.visual.widths.join(', ') + ' px.',
    'PREVIEW: ' + (preview || MARK.preview),
  ];
  if (isFaithfulRoute(s)) L.push('SOURCE: ' + (source || MARK.site) + '  — FAITHFUL REBUILD (' + (s.rebuild_style ? REBUILD_STYLE_LABELS[s.rebuild_style] : 'fidelity not chosen') + ')',
    '', 'For every page family below, at every width: screenshot SOURCE and PREVIEW with Playwright into',
    'qa/compare/<family>/<width>-source.png and -preview.png, then compare: section order, typography,',
    'colours, spacing, layout / container width, imagery and crops, navigation and mobile menu, sticky',
    'elements, forms, footer. Fix material differences in code and re-screenshot. A difference the',
    'architecture notes record as deliberate is not a defect.');
  else if (isTemplateRoute(s)) L.push(source ? 'TEMPLATE REFERENCE: ' + source : 'TEMPLATE REFERENCE: run the template itself from its _templates folder on port 4322.',
    '', 'For every page family below, at every width, compare the preview with the template design system',
    '(components, spacing, type scale, mobile patterns) and confirm NO seed-client content is visible:',
    ...(t ? ['    ' + t.leftoverNeedles.join(' · ')] : []));
  else L.push(s.design_references ? 'DESIGN REFERENCES: ' + s.design_references : 'DESIGN REFERENCES: none recorded — judge against the Findable standard.',
    '', 'For every page family below, at every width, check the design is consistent, clean and mobile-first.');
  L.push('', 'Page families:');
  L.push(...(fams.length ? fams.map((f) => { const p = example(f); return '- ' + f + ' (' + PAGE_FAMILY_LABELS[f] + ')' + (p ? ': ' + (p.path || '') + (p.old_url ? '  ← ' + p.old_url : '') : ''); })
    : ['(No page architecture yet — compare the homepage and one page of each type you find.)']));
  L.push('', 'Reply with one line per family (Paul records them in LeadFinderOS):',
    '<family>: approved', '<family>: differences — <short list>');
  return { id: 'visual_compare', label: 'Copy Visual Comparison Prompt', short: 'Visual compare', stage: 'preview',
    blockedBy: [...(preview ? [] : ['Preview URL']), ...(isFaithfulRoute(s) && !source ? ['Source website URL'] : [])],
    help: isFaithfulRoute(s) ? 'Source vs preview, page family by page family, at every target width.' : 'Checks the preview against the template / design references at every width.',
    text: L.join('\n') };
}

/* ── QA — SEO / GEO, facts and seed values; not the build brief again ─────────────────────────── */
function qa(i: BuildPackInput): StagePrompt {
  const s = i.state, t = i.template;
  const base = seoQaPrompt(i);
  const L = [routeLine(s), '', base.text];
  if (isTemplateRoute(s) && t) L.push('', 'SEED-CLIENT CHECK (' + t.sourceClient + '): search src, public, functions, astro.config and the rendered pages for',
    '    ' + t.leftoverNeedles.join(' · '),
    'Every hit is removed or backed by a VERIFIED fact above. Report the count. Line to tick:', '- No template / previous-client content left');
  if (isFaithfulRoute(s)) L.push('', 'FAITHFUL CHECK: every old URL in capture/urls.csv is either live at the same path or in the redirect map.');
  return { id: 'qa', label: 'Copy QA Prompt', short: 'QA', stage: 'qa', blockedBy: base.blockedBy, help: base.help, text: L.join('\n') };
}

/* ── PRODUCTION DEPLOYMENT — refused until the preview is recorded ────────────────────────────── */
function productionDeploy(i: BuildPackInput): StagePrompt {
  const s = i.state;
  const cfg = codeConfig(s, i.template);
  const problem = cloudflareProblem(s);
  const blockedBy = [
    ...(problem ? [problem] : []),
    ...(!s.preview_url ? ['Preview URL (deploy and review a preview first)'] : []),
    ...(!s.canonical_domain ? ['Domain (canonical)'] : []),
    ...(!s.local_repo_path ? ['Local folder'] : []),
  ];
  if (blockedBy.length) {
    return { id: 'production_deploy', label: 'Copy Production Deployment Prompt', short: 'Production', stage: 'live', blockedBy,
      help: 'Not generated until the Cloudflare project, the preview and the domain are recorded.',
      text: [routeLine(s), '', 'PRODUCTION IS NOT READY — no prompt has been generated.', '', 'Record these first:', ...blockedBy.map((b) => '- ' + b)].join('\n') };
  }
  const d = s.canonical_domain.replace(/^www\./, '');
  const fq = finalQaPrompt(i).text.split('\n');
  const L = [
    ...header('PRODUCTION DEPLOYMENT', i),
    'Work in: ' + winPath(s.local_repo_path) + '. Project: ' + s.cloudflare_project + '. Domain: ' + s.canonical_domain + '.',
    'Preview that was reviewed: ' + s.preview_url,
    '',
    '⛔ Before step 3, ask Paul in chat: "Deploy ' + s.canonical_domain + ' to production now?" and wait for a clear yes.',
    '',
    '1. "git status" clean, "git push" done — GitHub has exactly what goes live.',
    '2. "' + cfg.buildCommand + '" passes.',
    '3. npx wrangler pages deploy ' + cfg.outputDir + ' --project-name ' + s.cloudflare_project + ' --branch main',
    '4. Custom domain: Cloudflare → Workers & Pages → ' + s.cloudflare_project + ' → Custom domains. ' + d + ' and www.' + d + '.',
    '   ⚠ Only if the DNS is in Paul\'s Cloudflare account. If someone else manages it, STOP and tell Paul.',
    '5. www / non-www and http:// all end on https://' + s.canonical_domain + ' in ONE hop.',
    '',
    'Then verify production:',
    ...fq.slice(fq.findIndex((l) => l.startsWith('- HTTPS'))),
    '',
    'Also reply with:', 'Commit live: <git log -1 --format="%h %s">', 'Custom domain: active / dns pending', 'www redirect: working / broken',
  ];
  return { id: 'production_deploy', label: 'Copy Production Deployment Prompt', short: 'Production', stage: 'live', blockedBy: [],
    help: 'Claude deploys production (after asking you), connects the domain and checks the live site.', text: L.join('\n') };
}

/** All eight, in stage order. */
/* ── ASSET DOWNLOAD — Claude Code fetches ONLY the approved assets; LeadFinderOS downloads nothing. ─
   Faithful: every asset marked USE (the authorised site's own assets). Template: only USE assets that
   are ASSIGNED to a template slot. Bespoke: assigned USE assets, else every USE asset. */
export function assetsToDownload(i: BuildPackInput): { list: Array<{ asset: ManifestAsset; slot: string }>; held: number } {
  const s = i.state;
  const use = s.manifest.assets.filter((a) => a.approval === 'approved');
  const held = s.manifest.assets.filter((a) => a.approval === 'pending').length;
  const m = computeMapping(s, i.template, i.facts, i.businessName);
  const slotOf = new Map<string, string>();
  for (const st of m.slots) for (const a of st.publishable) if (!slotOf.has(a.source_url)) slotOf.set(a.source_url, st.slot.label);
  const assignedOnly = isTemplateRoute(s) || (isBespokeRoute(s) && slotOf.size > 0);
  const chosen = assignedOnly ? use.filter((a) => slotOf.has(a.source_url)) : use;
  return { list: chosen.map((asset) => ({ asset, slot: slotOf.get(asset.source_url) ?? '' })), held };
}

function assetDownload(i: BuildPackInput): StagePrompt {
  const s = i.state;
  const { list, held } = assetsToDownload(i);
  const safeName = (a: ManifestAsset, n: number) => (a.suggested_filename || (a.source_url.split('/').pop() || 'asset-' + (n + 1))).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
  const L = [
    ...header('ASSET DOWNLOAD', i),
    'Work in: ' + folder(s) + '. Download ONLY the ' + list.length + ' asset(s) below — ' + (isTemplateRoute(s) ? 'approved (USE) in LeadFinderOS AND assigned to a template slot.' : isFaithfulRoute(s) ? 'every asset of the authorised site that Paul marked USE.' : 'approved (USE) in LeadFinderOS.'),
    '',
    'Rules:',
    '- Originals: capture/assets/original/<filename>, byte-for-byte as served. Never edit an original.',
    '- Web copies: public/images/<filename> — WebP (or AVIF) for photos, longest edge 2400px max, sensible quality; SVG logos copied as-is; keep the originals.',
    '- Safe local filenames only: lowercase, a-z 0-9 . - _ , no spaces. Keep the original extension on the original.',
    '- Each source URL is downloaded ONCE; if two URLs return identical bytes, keep one file and note it.',
    '- Never hotlink: the built site must reference the local web copy only.',
    '- Do NOT download anything that is not on this list (REVIEW / IGNORE assets, stock images, anything else you see).',
    '- If a download fails (404, blocked, not an image), record it and carry on — never substitute another image.',
    '- Record every one in capture/assets/downloads.csv: source_url, original_file, web_file, bytes, status (ok / failed: reason).',
    '',
    'Assets:',
    ...(list.length ? list.map(({ asset, slot }, n) => '- ' + (slot ? '[' + slot + '] ' : '') + oneLine(asset.source_url, 300) + ' → ' + safeName(asset, n) + (asset.purpose ? '  (' + oneLine(asset.purpose, 80) + ')' : ''))
      : ['(nothing to download yet — mark assets USE' + (isTemplateRoute(s) ? ' and assign them to template slots' : '') + ' in LeadFinderOS)']),
    ...(held ? ['', held + ' asset(s) are still REVIEW in LeadFinderOS and are NOT on this list — do not download them.'] : []),
    '',
    'Reply with one line per asset:  <source_url> -> <web_file>   and a FAILED list.',
  ];
  return { id: 'asset_download', label: 'Copy Asset Download Prompt', short: 'Assets', stage: 'build_pack', blockedBy: [...(list.length ? [] : ['Approved assets']), ...(s.local_repo_path ? [] : ['Local folder'])],
    help: 'Claude Code downloads only the approved assets, keeps originals, makes web copies and records source → file.', text: L.join('\n') };
}

export function stagePrompts(i: BuildPackInput): StagePrompt[] {
  return [recon(i), capture(i), architecture(i), assetDownload(i), build(i), previewDeploy(i), visualCompare(i), qa(i), productionDeploy(i)];
}

