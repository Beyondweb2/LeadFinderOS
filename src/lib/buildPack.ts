/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE BUILD PACK — every command and prompt Paul needs to take ONE client's website from nothing to
   production, generated deterministically from the saved Website Build state, the approved facts
   and Findable's stored evidence. No model is called and nothing is fetched to produce it.

     1 Project / repo setup commands      6 Visual QA prompt
     2 Existing-site capture prompt       7 SEO / GEO QA prompt
     3 Master build prompt                8 Production deployment commands
     4 Local dev commands                 9 Final production QA prompt
     5 Cloudflare preview commands

   ⛔ NOTHING IS INVENTED. A value Paul has not supplied prints as a [.. REQUIRED] marker and the
   item lists it under `blockedBy`. Production is REFUSED outright (no command at all) until the
   Cloudflare project, the preview URL and the domain are recorded.
   ⛔ ONLY VERIFIED FACTS ARE PUBLISHABLE. Every prompt that writes content carries the verified list
   under "VERIFIED FACTS MAY BE USED" and everything else under "UNVERIFIED FACTS MUST NOT BE
   PUBLISHED". A template's source-client claims are mapped fact by fact; a claim with no verified
   fact is REMOVED, never adapted by swapping the name.
   ⛔ SAFE GIT ONLY. No generated command force-pushes, resets, rebases, amends or cleans.
   ⚠️ Plain string arrays joined with newlines. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { WebsiteBuildState } from './websiteBuildState.ts';
import {
  captureApplies, COPY_OWNERSHIP_LABELS, mayPreserveCopy, PAGE_ACTION_LABELS, PAGE_FAMILY_LABELS,
  QA_ITEMS, REBUILD_STYLE_LABELS,
} from './websiteBuildState.ts';
import type { WebsiteTemplate } from './websiteTemplates.ts';
import type { FactRow } from './buildFacts.ts';
import { CLAIM_VERDICT_LABELS, isPublishable, mapTemplateClaims } from './buildFacts.ts';
import type { RebuildPromptInput } from './websiteBuildPrompt.ts';
import { AI_VISIBILITY, baselineProtection, confirmationsSection, crawlSection, doNotBreak } from './websiteBuildPrompt.ts';

export const PACK_ITEM_IDS = ['setup', 'capture', 'master', 'local', 'preview', 'visual_qa', 'seo_qa', 'production', 'final_qa'] as const;
export type PackItemId = (typeof PACK_ITEM_IDS)[number];

export interface PackItem {
  id: PackItemId;
  title: string;
  kind: 'commands' | 'prompt';
  /** False when this step does not apply to the chosen route (e.g. capture with no old site). */
  applicable: boolean;
  /** Values that must be filled in before this item is safe to use. Empty = ready. */
  blockedBy: string[];
  /** What Paul does with it, in one or two plain sentences. */
  help: string;
  /** Where the output lands / what to paste back into LeadFinderOS. */
  expect: string;
  text: string;
}

export interface BuildPackInput {
  state: WebsiteBuildState;
  template: WebsiteTemplate | null;
  facts: FactRow[];
  evidence: RebuildPromptInput;
  businessName: string;
  existingSiteUrl: string;
  mustNotSay: string;
  generatedAt?: string;
}

/* ── required values and their markers ───────────────────────────────────────────────────────── */

export const MARK = {
  repo: '[REPO NAME REQUIRED]',
  owner: '[GITHUB ACCOUNT REQUIRED]',
  path: '[LOCAL FOLDER REQUIRED]',
  project: '[CLOUDFLARE PROJECT NAME REQUIRED]',
  domain: '[DOMAIN REQUIRED]',
} as const;

const WIN_PATH = /^[A-Za-z]:\\[^<>:"|?*]+$/;
export const CF_PROJECT = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export interface SetupCheck { field: string; label: string; problem: string }

/** What is missing or malformed for SETUP to be generated safely. */
export function setupProblems(s: WebsiteBuildState): SetupCheck[] {
  const out: SetupCheck[] = [];
  if (!s.repo_name) out.push({ field: 'repo_name', label: 'Repository name', problem: 'not set' });
  else if (!REPO_NAME.test(s.repo_name)) out.push({ field: 'repo_name', label: 'Repository name', problem: 'use letters, numbers, dots, dashes or underscores only' });
  if (!s.github_owner) out.push({ field: 'github_owner', label: 'GitHub account', problem: 'not set' });
  if (!s.local_repo_path) out.push({ field: 'local_repo_path', label: 'Local folder', problem: 'not set' });
  else if (!WIN_PATH.test(s.local_repo_path.replace(/\//g, '\\'))) out.push({ field: 'local_repo_path', label: 'Local folder', problem: 'must be a full Windows path like C:\\Users\\paulj\\ClientName' });
  return out;
}

export function cloudflareProblem(s: WebsiteBuildState): string {
  if (!s.cloudflare_project) return 'Cloudflare project name not set';
  if (!CF_PROJECT.test(s.cloudflare_project)) return 'Cloudflare project name must be lowercase letters, numbers and dashes';
  return '';
}

/** Suggestions Paul can accept with a click — never applied silently. */
export function suggestRepoName(businessName: string): string {
  const words = businessName.replace(/&/g, ' ').replace(/\b(ltd|limited|llp|plc)\b\.?/gi, ' ')
    .split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w) => (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('').slice(0, 60);
}
export function suggestCloudflareProject(repoName: string): string {
  return repoName.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 58);
}

const winPath = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '');
function splitPath(p: string): { parent: string; folder: string } {
  const w = winPath(p);
  const i = w.lastIndexOf('\\');
  return i > 2 ? { parent: w.slice(0, i), folder: w.slice(i + 1) } : { parent: w, folder: '' };
}
const q = (p: string) => '"' + p + '"';

/* ── fact blocks shared by every content prompt ───────────────────────────────────────────────── */

export function verifiedFactLines(facts: FactRow[]): string[] {
  const v = facts.filter(isPublishable);
  if (!v.length) return ['(No fact is verified yet. Do not write business content until Paul verifies facts in LeadFinderOS.)'];
  return v.map((f) => '- ' + f.label + ': ' + f.value);
}

export function forbiddenFactLines(facts: FactRow[]): string[] {
  const out: string[] = [];
  const det = facts.filter((f) => f.status === 'detected' && f.value);
  const missing = facts.filter((f) => f.status === 'missing' || (f.status === 'verified' && !f.value));
  const rej = facts.filter((f) => f.status === 'rejected' || f.status === 'not_applicable');
  if (det.length) {
    out.push('Detected but NOT approved (do not publish, do not paraphrase, do not hint at):');
    for (const f of det) out.push('- ' + f.label + ': "' + f.value + '"' + (f.source ? ' (from ' + f.source + ')' : '') + (f.note ? ' — ' + f.note : ''));
  }
  if (missing.length) {
    out.push('Missing (no verified value exists — REMOVE any section or claim that needs it; never fill it in):');
    for (const f of missing) out.push('- ' + f.label);
  }
  if (rej.length) {
    out.push('Rejected / not applicable to this client (must NOT appear anywhere):');
    for (const f of rej) out.push('- ' + f.label + (f.value ? ': "' + f.value + '"' : ''));
  }
  return out.length ? out : ['(Every fact on record is verified.)'];
}

function claimMappingLines(template: WebsiteTemplate, facts: FactRow[]): string[] {
  const out = [
    'The template is ' + template.sourceClient + "'s finished site. EVERY one of these claims in it belongs to",
    'that business. For each, the verdict for THIS client:',
    '',
  ];
  for (const m of mapTemplateClaims(template, facts)) {
    out.push('- ' + m.label + ' (template says ' + m.sourceExample + ')');
    out.push('    → ' + CLAIM_VERDICT_LABELS[m.verdict] + (m.verdict === 'verified' ? ': ' + m.clientValue : ''));
  }
  out.push('',
    '⛔ NEVER swap the client name into a template claim. "15-30 minutes" with no verified response time',
    'is deleted, not rewritten. "£5m liability" with no verified insurance is deleted. A 22-service list',
    'becomes ONLY the verified services. If a section has nothing verified left to say, remove the section.');
  return out;
}

/* ── 1. SETUP ─────────────────────────────────────────────────────────────────────────────────── */

function setupCommands(i: BuildPackInput): PackItem {
  const s = i.state;
  const path = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const repo = s.repo_name || MARK.repo;
  const owner = s.github_owner || MARK.owner;
  const { parent, folder } = s.local_repo_path ? splitPath(s.local_repo_path) : { parent: MARK.path, folder: MARK.path };
  const blockedBy = setupProblems(s).map((p) => p.label + ' ' + p.problem);
  const t = i.template;
  const lines: string[] = [
    '# ============================================================',
    '# PROJECT SETUP — ' + (i.businessName || 'this client'),
    '# Paste into PowerShell ONE BLOCK AT A TIME and read the output before the next.',
    '# Nothing here deletes anything, force-pushes or rewrites history.',
    '# ============================================================',
    '',
    '# -- 1. Check the tools (each prints a version; Node must be 22.12 or newer) --',
    'node --version',
    'git --version',
    '',
  ];
  if (s.build_mode === 'template' && t) {
    const cache = parent + '\\_templates\\' + t.id;
    lines.push(
      '# -- 2. Get the latest copy of the ' + t.name + ' (kept in one folder, reused per client) --',
      'New-Item -ItemType Directory -Force -Path ' + q(parent + '\\_templates') + ' | Out-Null',
      'if (Test-Path ' + q(cache) + ') { git -C ' + q(cache) + ' pull --ff-only } else { git clone --branch ' + t.sourceBranch + ' ' + t.sourceRepoUrl + ' ' + q(cache) + ' }',
      '',
      '# -- 3. Copy it into the new client folder WITHOUT the template\'s git history --',
      '#    (stops and says so if the folder already exists, so nothing is overwritten)',
      'if (Test-Path ' + q(path) + ') { Write-Host "STOP: ' + path + ' already exists. Choose a new folder in LeadFinderOS." } else { robocopy ' + q(cache) + ' ' + q(path) + ' /E /XD .git node_modules dist .astro /NFL /NDL /NJH /NJS; Write-Host "Copied." }',
      '',
      '# -- 4. Start this project\'s own history --',
      'Set-Location ' + q(path),
      'git init -b main',
      'git add .',
      'git commit -m "Start ' + (i.businessName || repo).replace(/"/g, '') + ' from the ' + t.name + '"',
      '',
    );
  } else {
    lines.push(
      '# -- 2. Create a fresh Astro project (same stack as the Findable template) --',
      'Set-Location ' + q(parent),
      'if (Test-Path ' + q(path) + ') { Write-Host "STOP: ' + path + ' already exists. Choose a new folder in LeadFinderOS." } else { npm create astro@latest -- ' + q(folder) + ' --template minimal --install --no-git --skip-houston --yes }',
      '',
      '# -- 3. Add Tailwind and the sitemap --',
      'Set-Location ' + q(path),
      'npx astro add tailwind sitemap --yes',
      '',
      '# -- 4. Start this project\'s history --',
      'git init -b main',
      'git add .',
      'git commit -m "Start the ' + (i.businessName || repo).replace(/"/g, '') + ' rebuild"',
      '',
    );
  }
  lines.push(
    '# -- 5. Create the EMPTY GitHub repository — in the browser --',
    '#    (this computer has no GitHub command-line tool, so this one step is clicks)',
    '#    a. Open https://github.com/new',
    '#    b. Owner: ' + owner + '     Repository name: ' + repo,
    '#    c. Choose Private.',
    '#    d. Leave "Add a README", ".gitignore" and "license" UNTICKED — it must start empty.',
    '#    e. Press "Create repository". Then run step 6.',
    '',
    '# -- 6. Connect this folder to that repository and upload --',
    'Set-Location ' + q(path),
    'git remote add origin https://github.com/' + owner + '/' + repo + '.git',
    'git push -u origin main',
    '',
    '# -- 7. Install the packages (a minute or two) --',
    t && s.build_mode === 'template' ? t.installCommand : 'npm install',
    '',
    '# -- Done. In LeadFinderOS, fill in:',
    '#    Repository URL = https://github.com/' + owner + '/' + repo,
  );
  return {
    id: 'setup', title: '1. Project / repo setup commands', kind: 'commands', applicable: true, blockedBy,
    help: 'Creates the client folder, starts its git history, and connects it to a new private GitHub repository. Run it once per client.',
    expect: 'Finishes with the code on GitHub. Paste the Repository URL into the Setup fields.',
    text: lines.join('\n'),
  };
}

/* ── 2. CAPTURE ───────────────────────────────────────────────────────────────────────────────── */

function capturePrompt(i: BuildPackInput): PackItem {
  const s = i.state;
  const applicable = captureApplies(s, !!i.existingSiteUrl);
  const visual = s.build_mode === 'rebuild';
  const path = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const site = i.existingSiteUrl || '[CURRENT WEBSITE URL REQUIRED]';
  const preserve = mayPreserveCopy(s.copy_ownership);
  const blockedBy = [
    ...(!i.existingSiteUrl ? ['Current website URL (verify the Current website fact)'] : []),
    ...(!s.local_repo_path ? ['Local folder'] : []),
    ...(s.build_mode === 'rebuild' && !s.copy_ownership ? ['Copy ownership'] : []),
  ];
  const L: string[] = [
    '# EXISTING SITE CAPTURE — ' + (i.businessName || 'this client'),
    '',
    'You are capturing the current website of ' + (i.businessName || 'this business') + ' BEFORE any new code is',
    'written. Capture only. Do not start building. Work in: ' + path,
    '',
    'Site to capture: ' + site,
    visual ? 'Purpose: ' + (s.rebuild_style ? REBUILD_STYLE_LABELS[s.rebuild_style as keyof typeof REBUILD_STYLE_LABELS] : 'a rebuild') + ' — the capture is the visual and factual source of truth.'
      : 'Purpose: a fresh build from a Findable template. Capture URLs, SEO metadata, facts and the client\'s own assets. The old DESIGN is not being kept, so no design capture is needed.',
    '',
    '## RULES',
    '- Crawl politely: one request at a time, a short pause between pages. Stay on the client\'s own domain.',
    '- ⛔ NEVER submit a form, request a callback or send a message — every enquiry reaches the real business.',
    '- Download genuine assets LOCALLY now. Never hotlink anything from the old site in the new build.',
    '- Screenshots support the DOM, they do not replace it: read the real HTML, CSS and assets.',
    '- Do not change anything on the live site.',
    preserve
      ? '- Copy ownership: ' + COPY_OWNERSHIP_LABELS[s.copy_ownership as keyof typeof COPY_OWNERSHIP_LABELS] + '. The page text may be kept, so capture it in full.'
      : '- Copy ownership: ' + (s.copy_ownership ? COPY_OWNERSHIP_LABELS[s.copy_ownership as keyof typeof COPY_OWNERSHIP_LABELS] : 'not recorded') + '. Capture page text as REFERENCE ONLY for facts — it will not be reproduced.',
    '',
    '## WHAT TO CAPTURE — everything goes in a capture folder inside the project',
    '',
    'capture/urls.csv — EVERY public URL (from the sitemap, robots.txt, the navigation, the footer and',
    '  internal links), one row each: url, http status, final url after redirects, canonical, title,',
    '  meta description, H1, page family guess, word count, noindex yes/no.',
    'capture/robots.txt and capture/sitemaps/ — verbatim copies.',
    'capture/seo/ — one JSON file per page with its JSON-LD / schema blocks verbatim and its internal links.',
    'capture/redirects-observed.txt — any redirect you saw: old -> final.',
    'capture/copy/ — the visible text of each page' + (preserve ? '.' : ' (REFERENCE ONLY — do not reuse the wording).'),
    'capture/facts.md — every business fact the site STATES, with the URL it is on: services, areas and',
    '  towns, owner name, phone, email, address, hours, credentials, insurance, years trading, prices,',
    '  guarantees, response times, brands, review and directory profiles, social links.',
    'capture/assets/ and capture/assets/manifest.csv — logo (SVG if one exists), favicon, hero images,',
    '  gallery photos, accreditation badges, manufacturer logos, review-platform logos and any other',
    '  genuine client-owned or client-earned asset. Manifest columns: file, source url, what it is,',
    '  ownership (client-owned / third-party mark the client is entitled to show / unknown).',
  ];
  if (visual) {
    L.push(
      'capture/screenshots/desktop-1440/ and capture/screenshots/mobile-375/ — full-page screenshots of the',
      '  homepage and at least one page of EVERY page family. Use Playwright:',
      '      npm install --save-dev playwright',
      '      npx playwright install chromium',
      '  and a small script in capture/tools/. Also capture the mobile menu open, and any sticky bar or',
      '  floating button.',
      'capture/design.md — the design system as it really is: fonts (families, weights, sizes per heading',
      '  level), colours as hex, gradients, container widths and gutters, spacing rhythm, card styles and',
      '  sizes, buttons (all states), sticky bars, floating actions, mobile menu behaviour, forms, CTAs,',
      '  icons and SVGs, the navigation, the footer, and the SECTION ORDER of each page family.',
    );
  }
  L.push(
    '',
    '## FINISH WITH capture/SUMMARY.md, and paste three blocks from it back to Paul',
    '',
    '1. Counts — "URLs: N · Assets: N" (Paul records these in LeadFinderOS).',
    '2. PROPOSED PAGE ARCHITECTURE, one line per page, exactly this format (Paul pastes it in):',
    '       action | family | /new-path/ | Title | old url | redirect target | note',
    '   action is one of keep, create, consolidate, redirect, remove.',
    '   family is one of homepage, services_index, service, locations_index, location, commercial,',
    '   pricing, about, faq, gallery, contact, legal, other.',
    '   ONE primary page per intent. Thin or duplicate pages are consolidated, not kept.',
    '   Do NOT propose cloned town pages — a location page only where there is genuinely local content.',
    '3. PROPOSED REDIRECT MAP, one line per old URL that will not exist at the same path:',
    '       /old-path -> /new-path/ | reason',
    '   One hop each. No chains. Never send everything to the homepage — each old page goes to its',
    '   closest real match. Do not forget a relevant legacy page.',
    '4. FACTS FOR APPROVAL, one line each:  Label: value',
    '',
    'THEN STOP. Paul approves the facts, architecture and redirects in LeadFinderOS before the build begins.',
  );
  return {
    id: 'capture', title: '2. Existing site capture prompt', kind: 'prompt', applicable, blockedBy,
    help: 'Paste into Claude Code (opened in the client folder) after setup. It saves the old site locally and proposes the page plan and redirects.',
    expect: 'Claude replies with counts, a page list, a redirect list and facts. Paste each into the Capture, Architecture and Facts steps.',
    text: L.join('\n'),
  };
}

/* ── 3. MASTER BUILD PROMPT ───────────────────────────────────────────────────────────────────── */

function pageLines(s: WebsiteBuildState): string[] {
  if (!s.pages.length) return ['(No page architecture approved yet. Do not build until Paul approves one.)'];
  const build = s.pages.filter((p) => p.action === 'keep' || p.action === 'create');
  const fold = s.pages.filter((p) => p.action === 'consolidate' || p.action === 'redirect');
  const drop = s.pages.filter((p) => p.action === 'remove');
  const und = s.pages.filter((p) => p.action === 'undecided');
  const out: string[] = ['PAGES TO BUILD (' + build.length + ') — each owns ONE intent:'];
  for (const p of build) {
    out.push('- ' + p.path + '  [' + PAGE_FAMILY_LABELS[p.family] + ', ' + PAGE_ACTION_LABELS[p.action].toLowerCase() + ']  ' + (p.title || '') +
      (p.old_url ? '  (replaces ' + p.old_url + ')' : '') + (p.notes ? '  — ' + p.notes : ''));
  }
  if (fold.length) {
    out.push('', 'OLD PAGES FOLDED INTO ANOTHER (' + fold.length + ') — their useful, true content moves to the target:');
    for (const p of fold) out.push('- ' + (p.old_url || p.path) + ' → ' + p.target + '  [' + PAGE_ACTION_LABELS[p.action].toLowerCase() + ']' + (p.notes ? '  — ' + p.notes : ''));
  }
  if (drop.length) {
    out.push('', 'REMOVED (' + drop.length + ') — do not build these:');
    for (const p of drop) out.push('- ' + (p.old_url || p.path || p.title) + (p.notes ? '  — ' + p.notes : ''));
  }
  if (und.length) out.push('', '⚠ ' + und.length + ' page(s) are still undecided in LeadFinderOS. Do not build them; ask Paul.');
  out.push('', 'Do not add pages that are not on this list. If you find a genuine gap, propose it to Paul — do not create it.');
  return out;
}

function redirectLines(s: WebsiteBuildState, hasOldSite: boolean): string[] {
  if (!s.redirects.length) {
    return hasOldSite
      ? ['(No redirect map approved yet. The old site exists, so every old URL that will not exist at the same path needs one — ask Paul before launch.)']
      : ['(No old site — no redirects needed.)'];
  }
  return [
    'Write these to public/_redirects as "from to 301", exactly one hop each:',
    '',
    ...s.redirects.map((r) => '    ' + r.from + '  ' + r.to + '  301' + (r.reason ? '    # ' + r.reason : '')),
    '',
    'Rules: no chains, no loops, no source that is also a live page, destinations with a trailing slash.',
  ];
}

function sourceOfTruth(i: BuildPackInput): string[] {
  const s = i.state, t = i.template;
  if (s.build_mode === 'template' && t) {
    return [
      'THE TEMPLATE IS THE DESIGN SOURCE OF TRUTH: ' + t.name + '.',
      t.description,
      '',
      '- Framework: ' + t.framework + ' (Node ' + t.nodeVersion + ')',
      '- Commands: install "' + t.installCommand + '", dev "' + t.devCommand + '" (' + t.devUrl + '), build "' + t.buildCommand + '" → ' + t.buildOutputDir + ', tests "' + t.testCommand + '"',
      '- Hosting: ' + t.cloudflare,
      ...t.serverFunctions.map((f) => '- Server function: ' + f.path + ' — ' + f.purpose + '. Needs secrets ' + f.secrets.join(', ') + ' set in Cloudflare (Paul does that).'),
      '',
      'REUSE (structure, design, technical architecture): ' + t.reusableComponents.join('; ') + '.',
      'Visual style to inherit: ' + t.visualStyle.join('; ') + '.',
      '',
      '⛔ STRIP EVERY TRACE OF ' + t.sourceClient.toUpperCase() + '. These files carry its content and must be',
      'rewritten from the verified facts below, or emptied:',
      ...t.clientContentFiles.map((f) => '- ' + f),
      'These asset folders hold its photos, logos and badges. Delete their contents and add only the new',
      "client's own genuine assets:",
      ...t.clientAssetDirs.map((f) => '- ' + f),
    ];
  }
  const style = s.rebuild_style ? REBUILD_STYLE_LABELS[s.rebuild_style as keyof typeof REBUILD_STYLE_LABELS] : '(rebuild style not chosen)';
  const out = [
    'THE CAPTURED EXISTING SITE IS THE SOURCE OF TRUTH (' + style + ').',
    'Read the capture folder first: capture/SUMMARY.md, capture/urls.csv, capture/design.md, capture/screenshots/,',
    'capture/assets/manifest.csv, capture/facts.md. If it does not exist, STOP and ask Paul to run the capture prompt.',
    '',
  ];
  if (s.rebuild_style === 'replica') out.push('Rebuild the code independently, but match the old site visually: same section order, layout,',
    'typography, colours, spacing, card and button styles, sticky and floating elements, and mobile behaviour.');
  if (s.rebuild_style === 'modernised') out.push('Keep the brand — logo, colours, fonts, tone and imagery — and the content structure, but modernise',
    'layout, spacing, typography scale and mobile experience. It must still be recognisably the same business.');
  if (s.rebuild_style === 'new_design') out.push('Design fresh. Keep the business content (facts, services, genuine assets and the architecture),',
    'not the old look. Logo and brand colours stay unless Paul says otherwise.');
  return out;
}

function contentRules(i: BuildPackInput): string[] {
  const s = i.state;
  const preserve = s.build_mode === 'rebuild' && mayPreserveCopy(s.copy_ownership);
  return [
    'Every page answers real customer questions in this shape:',
    '    CUSTOMER QUESTION → DIRECT ANSWER → SUPPORTING DETAIL → EVIDENCE',
    'Every service page is built as:',
    '    BUSINESS → SERVICE → LOCATION → EVIDENCE',
    'Plain, specific, useful. Say exactly what the business does, where, and for whom.',
    '',
    s.build_mode === 'rebuild'
      ? (preserve
        ? 'Copy: ' + COPY_OWNERSHIP_LABELS[s.copy_ownership as keyof typeof COPY_OWNERSHIP_LABELS] + ' — the existing wording MAY be preserved where it is accurate and useful.'
        : 'Copy: ' + (s.copy_ownership ? COPY_OWNERSHIP_LABELS[s.copy_ownership as keyof typeof COPY_OWNERSHIP_LABELS] : 'ownership not recorded') + '. ⛔ Do NOT reproduce the old site\'s marketing passages verbatim. Keep the FACTS and the visual requirements; write the marketing expression freshly. Keep only genuine client-owned assets.')
      : 'Copy: write it fresh from the verified facts. Nothing from the template\'s wording carries over.',
    '',
    '⛔ NEVER, in any draft, placeholder or "to be replaced" text:',
    '  fake reviews · fake projects or jobs · fake credentials · fake locations · fake awards · invented',
    '  prices, response times, years trading, guarantees or team members · keyword stuffing · mass',
    '  doorway or cloned town pages · hundreds of thin FAQs · hidden text · schema stuffing · fake',
    '  citations · an automatic llms.txt',
    'If a fact is not in VERIFIED FACTS, it does not go on the site — it goes on your list for Paul.',
    ...(i.mustNotSay ? ['', '⛔ THE CLIENT HAS SAID WE MUST NOT SAY: ' + i.mustNotSay, 'This applies to every page, heading, meta description and schema field.'] : []),
  ];
}

const FINDABLE_STANDARD: string[] = [
  'The finished site must be: CRAWLABLE · CLEAR · SPECIFIC · CONSISTENT · USEFUL · VERIFIABLE · SOURCEABLE · MEASURABLE.',
  '',
  'Entity clarity: the exact business name, what it does, its genuine services, genuine locations and',
  'service areas, who it serves, its contact details, its VERIFIED credentials and its genuine',
  'differentiators — identical everywhere (pages, footer, schema, meta).',
  '',
  'Technical: HTTPS · public crawlable HTML (content present without JavaScript) · a valid robots.txt ·',
  'an XML sitemap listing every kept/created page and nothing redirected · a self-referencing canonical',
  'on the production domain · no accidental noindex · no broken important links · no orphan important',
  'pages · clear internal linking (services ↔ locations ↔ contact) · mobile friendly · fast.',
  'robots.txt must ALLOW OAI-SearchBot, ChatGPT-User, Claude-User and PerplexityBot unless Paul decides otherwise.',
  'Schema: one LocalBusiness entity (stable @id) per site, only verified facts, matching what is visible.',
];

function masterPrompt(i: BuildPackInput): PackItem {
  const s = i.state, t = i.template;
  const path = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const domain = s.canonical_domain || MARK.domain;
  const hasOld = !!i.existingSiteUrl;
  const e = i.evidence;
  const blockedBy = [
    ...(!s.build_mode ? ['Build mode'] : []),
    ...(s.build_mode === 'template' && !t ? ['Template'] : []),
    ...(s.build_mode === 'rebuild' && !s.rebuild_style ? ['Rebuild style'] : []),
    ...(s.build_mode === 'rebuild' && !s.copy_ownership ? ['Copy ownership'] : []),
    ...(!s.local_repo_path ? ['Local folder'] : []),
    ...(!s.canonical_domain ? ['Domain (canonical)'] : []),
    ...(!s.pages.length ? ['Page architecture'] : []),
    ...(s.pages.some((p) => p.action === 'undecided') ? ['Undecided pages'] : []),
    ...(i.facts.some((f) => f.status === 'detected') ? ['Facts awaiting approval'] : []),
  ];
  const H = (x: string) => ['', '## ' + x, ''];
  const L: string[] = [
    '# MASTER BUILD — ' + (i.businessName || 'this client'),
    '',
    'Generated by LeadFinderOS at ' + (i.generatedAt ?? new Date().toISOString()) + ' from the approved build decisions.',
    'Read the whole brief before you start.',
    '',
    '⛔ VERIFIED FACTS MAY BE USED. UNVERIFIED FACTS MUST NOT BE PUBLISHED.',
    ...H('A. PROJECT MISSION'),
    'Build the new website for ' + (i.businessName || 'this business') + ' for Findable, in ' + path + '.',
    'Production domain: ' + domain + '. The site will be MEASURED: AI engines are re-asked the client\'s frozen',
    'baseline questions after launch. The job is a site that makes this business easy to discover, crawl,',
    'understand, verify and cite — honestly.',
    '',
    'Work autonomously. Continue through implementation, testing, visual QA, technical QA and the preview',
    'deployment without stopping after each file. Stop only where a genuinely missing fact or decision',
    'cannot safely be inferred — then ask Paul one clear question and carry on with everything else.',
    ...H('B. BUILD MODE'),
    s.build_mode === 'template' ? 'FRESH BUILD FROM A FINDABLE TEMPLATE: ' + (t?.name ?? '(no template chosen)') + '.'
      : s.build_mode === 'rebuild' ? 'REBUILD OF THE EXISTING WEBSITE — ' + (s.rebuild_style ? REBUILD_STYLE_LABELS[s.rebuild_style as keyof typeof REBUILD_STYLE_LABELS] : '(style not chosen)') + '.'
      : '(Build mode not chosen — STOP and ask Paul.)',
    ...(s.build_mode === 'rebuild' ? ['Copy ownership: ' + (s.copy_ownership ? COPY_OWNERSHIP_LABELS[s.copy_ownership as keyof typeof COPY_OWNERSHIP_LABELS] : 'not recorded') + '.'] : []),
    ...H('C. SOURCE OF TRUTH'),
    ...sourceOfTruth(i),
    ...H('D. VERIFIED BUSINESS FACTS — the ONLY facts that may appear on the site'),
    ...verifiedFactLines(i.facts),
    ...H('E. UNVERIFIED / FORBIDDEN CLAIMS'),
    'UNVERIFIED FACTS MUST NOT BE PUBLISHED.',
    '',
    ...forbiddenFactLines(i.facts),
    ...(t && s.build_mode === 'template' ? ['', ...claimMappingLines(t, i.facts)] : []),
    '',
    ...confirmationsSection(e),
    ...H('F. EXISTING SITE INVENTORY'),
    hasOld ? 'Current website: ' + i.existingSiteUrl : 'The client has no current website.',
    ...(hasOld ? ['Capture: ' + s.capture.status.replace('_', ' ') + (s.capture.url_count != null ? ' · ' + s.capture.url_count + ' URLs' : '') + (s.capture.asset_count != null ? ' · ' + s.capture.asset_count + ' assets' : '') + (s.capture.status === 'captured' ? ' — in capture/.' : '')] : []),
    ...(s.capture.notes ? ['Capture notes: ' + s.capture.notes] : []),
    '',
    ...(hasOld ? doNotBreak(e) : []),
    ...(e.crawlFindings.length ? ['', ...crawlSection(e)] : []),
    ...H('G. VISUAL REQUIREMENTS'),
    ...(s.build_mode === 'template'
      ? ['Inherit the template\'s design system exactly (tokens, type scale, components, spacing, mobile patterns).',
         'Replace or remove all business content. Colours may change only to the client\'s VERIFIED brand colours.']
      : s.rebuild_style === 'replica'
        ? ['The captured site is the visual reference. Compare rendered pages at 1440x900 and 375x812 against',
           'capture/screenshots/ and fix material differences. HTML/CSS similarity is NOT proof of parity.']
        : ['Use capture/design.md for the brand (logo, colours, fonts, imagery). Mobile-first, accessible contrast.']),
    ...H('H. APPROVED PAGE ARCHITECTURE'),
    ...pageLines(s),
    ...H('I. REDIRECT MAP'),
    ...redirectLines(s, hasOld),
    ...H('J. CONTENT REQUIREMENTS'),
    ...contentRules(i),
    ...H('K. SEO / GEO REQUIREMENTS — the Findable standard'),
    ...FINDABLE_STANDARD,
    '',
    ...AI_VISIBILITY.slice(1),
    '',
    ...baselineProtection(e),
    ...H('L. ASSET RULES'),
    '- Only genuine assets: the client\'s own photos, logo, favicon, and third-party marks they are entitled to show.',
    '- All assets are local files in the repo. No hotlinking — not to the old site, not anywhere.',
    ...(s.build_mode === 'template' ? ['- Every template image, badge, brand logo, favicon and share image is DELETED unless it is the new client\'s own.'] : ['- Use capture/assets/ (check manifest.csv ownership; skip anything marked unknown until Paul confirms).']),
    '- A missing photo is left out or shown as a plain designed block — never a stock photo passed off as their work.',
    '- Every image has width, height and meaningful alt text; compress to WebP/AVIF where sensible.',
    ...H('M. TECHNICAL REQUIREMENTS'),
    '- Astro static build, Cloudflare Pages. astro.config "site" = https://' + domain + '.',
    '- Directory-style URLs with trailing slashes; canonical and sitemap use https://' + domain + '.',
    '- public/robots.txt allows the search crawlers named in K and points to the sitemap on ' + domain + '.',
    '- vite.server.allowedHosts includes ".trycloudflare.com" so a local tunnel works for review.',
    '- tel: links in E.164-safe form, WhatsApp links only to a VERIFIED WhatsApp number, mailto: links.',
    '- Forms: wire to the real handler. ⛔ Never submit a test lead to the client\'s real inbox without Paul\'s say-so.',
    '- Keep "npm run build" (and "npm test" if present) passing at every commit.',
    ...(s.build_mode === 'template' && t ? ['- Rewrite the template\'s tests for this client; a test that asserts ' + t.sourceClient + ' content must go.'] : []),
    ...H('N. GIT RULES'),
    '- Work on main in ' + path + '. Logical commits, one coherent change each, clear messages.',
    '- Check "git remote -v": origin must be ' + (s.repo_url || 'the client\'s own repository') + '. NEVER push to the template repository.',
    '- ⛔ NEVER force push, reset, rebase, squash, amend or run git clean. Never commit secrets or .env files.',
    '- Push to origin after each finished page family so the work is never only on this computer.',
    ...H('O. PREVIEW / DEPLOYMENT PROCESS'),
    '- Local: "npm run dev" → http://localhost:4321.',
    ...(s.cloudflare_project && CF_PROJECT.test(s.cloudflare_project)
      ? ['- Preview: you MAY deploy a preview when the build is ready for review:',
         '      npm run build',
         '      npx wrangler pages deploy dist --project-name ' + s.cloudflare_project + ' --branch preview',
         '  It prints the preview address (https://preview.' + s.cloudflare_project + '.pages.dev). Give it to Paul.']
      : ['- Preview: the Cloudflare project name is not recorded yet. Do NOT create a Cloudflare project; ask Paul.']),
    '- ⛔ PRODUCTION: never. Paul deploys production himself from LeadFinderOS after he approves the preview.',
    ...H('P. QA — do this yourself before you report'),
    '- Render every page at 1440x900 and 375x812 and look at it. Fix what is wrong.',
    '- Crawl the built site (dist/): every link resolves, every page has one H1, a unique title and meta',
    '  description, a canonical on ' + domain + ', valid JSON-LD; the sitemap matches section H.',
    '- Check every fact on every page against section D. Anything not in D comes out.',
    ...(t && s.build_mode === 'template' ? [
      '- LEFTOVER CHECK — search the whole repo (src, public, functions, astro.config, tests, docs) for each of:',
      '    ' + t.leftoverNeedles.join(' · '),
      '  Every hit is either REMOVED or backed by a VERIFIED fact in section D. Report the final count.',
    ] : []),
    ...H('Q. DEFINITION OF DONE'),
    'Not done because it builds. Done when ALL of these are true:',
    ...QA_ITEMS.filter((x) => x.group === 'preview').map((x) => '- ' + x.label),
    '',
    'Then report to Paul in plain English: what you built (page count per family), anything you removed or',
    'left out and why, every question you still need answered, the preview URL, and the QA results as a',
    'list he can tick in LeadFinderOS.',
  ];
  return {
    id: 'master', title: '3. Master build prompt', kind: 'prompt', applicable: true, blockedBy,
    help: 'The whole build in one brief. Open Claude Code (Opus) in the client folder and paste it. It works through to a preview on its own.',
    expect: 'Claude reports the pages built, open questions and the preview URL. Paste the preview URL into the Preview step.',
    text: L.join('\n'),
  };
}

/* ── 4. LOCAL DEV ─────────────────────────────────────────────────────────────────────────────── */

function localCommands(i: BuildPackInput): PackItem {
  const s = i.state;
  const path = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const dev = i.template && s.build_mode === 'template' ? i.template.devUrl : 'http://localhost:4321';
  const L = [
    '# ============================================================',
    '# LOCAL PREVIEW — see the site on this computer',
    '# ============================================================',
    'Set-Location ' + q(path),
    'npm install      # only needed the first time, or after Claude adds a package',
    'npm run dev',
    '',
    '# It prints a line like:  Local  ' + dev + '/',
    '# Open ' + dev + ' in your browser. Leave this window open; press Ctrl+C to stop.',
    '',
    '# -- Optional: show it to someone else for a few minutes (development only) --',
    '# In a SECOND PowerShell window, while the first is still running:',
    'cloudflared tunnel --url ' + dev,
    '# It prints https://something.trycloudflare.com — new every time, dies when you close the window.',
    '# Never send this link to the client as "the site"; use the Cloudflare preview for that.',
  ];
  return {
    id: 'local', title: '4. Local dev commands', kind: 'commands', applicable: true,
    blockedBy: s.local_repo_path ? [] : ['Local folder'],
    help: 'Runs the site on your own computer so you can look at it while Claude works.',
    expect: 'The site opens at ' + dev + '. Record it as the Dev URL.',
    text: L.join('\n'),
  };
}

/* ── 5. CLOUDFLARE PREVIEW ────────────────────────────────────────────────────────────────────── */

function previewCommands(i: BuildPackInput): PackItem {
  const s = i.state;
  const path = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const problem = cloudflareProblem(s);
  const project = problem ? MARK.project : s.cloudflare_project;
  const t = i.template && s.build_mode === 'template' ? i.template : null;
  const L = [
    '# ============================================================',
    '# CLOUDFLARE PREVIEW — a private-ish link to review before going live',
    '# Run from the client folder. Uses YOUR Cloudflare account (wrangler is already logged in here).',
    '# ============================================================',
    'Set-Location ' + q(path),
    '',
    '# -- 1. Confirm which Cloudflare account wrangler will use (it prints the account name) --',
    'npx wrangler whoami',
    '',
    '# -- 2. FIRST TIME ONLY: create the Pages project in that account --',
    '#    If it says the project already exists, that is fine — go to step 3.',
    'npx wrangler pages project create ' + project + ' --production-branch main',
    '',
    '# -- 3. Build and upload as a PREVIEW (not production) --',
    'npm run build',
    'npx wrangler pages deploy ' + (t ? t.buildOutputDir : 'dist') + ' --project-name ' + project + ' --branch preview',
    '',
    '# It ends with "Deployment complete! Take a peek over at https://xxxxxxxx.' + project + '.pages.dev".',
    '# The address that stays the same between previews is:',
    '#     https://preview.' + project + '.pages.dev',
    '# Paste that into the Preview URL field in LeadFinderOS.',
    '# Cloudflare marks preview addresses "noindex" itself, so Google will not list them. That is expected.',
  ];
  if (t?.serverFunctions.length) {
    L.push('',
      '# -- The contact / callback form --',
      '# The ' + t.serverFunctions.map((f) => f.path).join(', ') + ' handler deploys with the site, but it will not send',
      '# email until these are set in the Cloudflare dashboard: Workers & Pages → ' + project + ' → Settings →',
      '# Variables and Secrets (for Preview and for Production): ' + t.serverFunctions.flatMap((f) => f.secrets).join(', ') + '.');
  }
  return {
    id: 'preview', title: '5. Cloudflare preview commands', kind: 'commands', applicable: true,
    blockedBy: [...(problem ? [problem] : []), ...(s.local_repo_path ? [] : ['Local folder'])],
    help: 'Publishes a preview copy to Cloudflare so you (and the client, if you want) can review it on a phone.',
    expect: 'Prints the preview address. Paste https://preview.' + project + '.pages.dev into Preview URL.',
    text: L.join('\n'),
  };
}

/* ── 6. VISUAL QA ─────────────────────────────────────────────────────────────────────────────── */

function visualQaPrompt(i: BuildPackInput): PackItem {
  const s = i.state, t = i.template;
  const target = s.preview_url || 'http://localhost:4321 (run "npm run dev")';
  const L: string[] = [
    '# VISUAL QA — ' + (i.businessName || 'this client'),
    '',
    'Check the new site visually and FIX material problems. Do not add features. Target: ' + target,
    'Widths: desktop 1440x900, tablet 768x1024, mobile 375x812. Render and LOOK — HTML/CSS similarity is not parity.',
    'Use Playwright screenshots (npm install --save-dev playwright; npx playwright install chromium) saved under qa/visual/.',
    '',
  ];
  if (s.build_mode === 'rebuild' && s.rebuild_style === 'replica') {
    L.push('REPLICA CHECK — old vs new, side by side, page by page, section by section:',
      'Compare against capture/screenshots/ (or the live old site ' + (i.existingSiteUrl || '') + ') at the SAME widths.',
      'For every page family check: section order · typography (family, size, weight, line height) · spacing ·',
      'layout and container width · card dimensions · buttons (size, colour, radius, states) · imagery and',
      'crops · navigation and mobile menu · footer · sticky bars and floating buttons · responsiveness between widths.',
      'List each material difference, fix it, re-screenshot, and show before/after for anything you changed.');
  } else if (s.build_mode === 'rebuild') {
    L.push('BRAND CHECK — the new design keeps the brand (logo, colours, fonts, imagery) from capture/design.md,',
      'every captured page family has its new equivalent, and nothing looks broken at any width.');
  } else if (t) {
    L.push('TEMPLATE CHECK — the site should look like the ' + t.name + ' design system, with this client\'s content:',
      '- Components, spacing, type scale and mobile patterns match the template (run the template itself with',
      '  "npm run dev -- --port 4322" in its _templates folder if you need to compare).',
      '- Every piece of template content has been replaced by VERIFIED client content or removed; no empty',
      '  gaps where a section was removed — the layout closes up cleanly.',
      '- ⛔ NO ' + t.sourceClient.toUpperCase() + ' CONTENT SURVIVED: search the repo AND the rendered pages for:',
      '    ' + t.leftoverNeedles.join(' · '),
      '  Every hit is removed or backed by a verified fact (below). Report the count before and after.');
  }
  L.push('', 'Also check on mobile: tap targets, the call and WhatsApp buttons, the menu, forms (fill, do NOT submit),',
    'no horizontal scrolling, images load, nothing overlaps.',
    '', 'VERIFIED FACTS (the only business facts that should be visible):', ...verifiedFactLines(i.facts),
    '', 'Finish with a pass/fail list using these exact lines so Paul can tick them in LeadFinderOS:',
    '- Visual QA complete (desktop)', '- Mobile QA complete', '- All assets load (nothing hotlinked from the old site)',
    ...(t && s.build_mode === 'template' ? ['- No template / previous-client content left'] : []),
    '', 'Commit fixes with clear messages. Never force push, reset, rebase, amend or clean.');
  return {
    id: 'visual_qa', title: '6. Visual QA prompt', kind: 'prompt', applicable: true, blockedBy: [],
    help: 'Paste into Claude Code in the client folder once the build is done. It compares, screenshots and fixes.',
    expect: 'A pass/fail list. Tick the matching boxes in the QA step.',
    text: L.join('\n'),
  };
}

/* ── 7. SEO / GEO QA ──────────────────────────────────────────────────────────────────────────── */

function seoQaPrompt(i: BuildPackInput): PackItem {
  const s = i.state;
  const domain = s.canonical_domain || MARK.domain;
  const target = s.preview_url || 'the built site in dist/ served with "npm run preview"';
  const L: string[] = [
    '# SEO / GEO QA — ' + (i.businessName || 'this client'),
    '',
    'Audit the new site against the Findable standard and FIX what fails. Target: ' + target,
    'Production domain: ' + domain + '. Report every check as PASS / FAIL with the evidence (URL + what you saw).',
    '',
    'Check, page by page:',
    '- Titles: unique, specific (business · service · place), not stuffed.',
    '- One H1 per page, matching the page\'s single intent. Meta descriptions present and unique.',
    '- Canonicals: self-referencing, absolute, https://' + domain + ', trailing slash consistent.',
    '- No noindex on any page that should rank (Cloudflare preview addresses add noindex themselves — ignore that header on *.pages.dev previews only).',
    '- sitemap: every kept/created page from the approved architecture, nothing redirected, nothing removed, all on ' + domain + '.',
    '- robots.txt: valid, points at the sitemap, ALLOWS OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot. Fetch a page with the',
    '  OAI-SearchBot user agent and confirm a 200 with real content.',
    '- Crawlable HTML: the page\'s main content and H1 are in the raw HTML (fetch without JavaScript).',
    '- Schema: valid JSON-LD, one LocalBusiness entity with a stable @id, every field a VERIFIED fact, matching the visible page. No review or rating markup unless reviews are verified and shown.',
    '- Internal links: no broken links, no orphan important pages, services ↔ locations ↔ contact linked sensibly.',
    '- Redirects: every line of the approved map returns ONE 301 straight to a 200. No chains, no loops, no mass redirect to the homepage.',
    '- Page ownership: one primary page per intent; no two pages competing for the same service/town.',
    '- Duplicate content: no near-identical pages (town pages especially).',
    '- Service and location clarity: each service page says what, where and for whom, with evidence.',
    '- Factual consistency: name, phone, email, address, hours, services and areas are identical on every page, the footer and the schema — and match VERIFIED FACTS below exactly.',
    '- Credentials and third-party profiles: only verified ones appear, links go to the real profiles.',
    '- Mobile: viewport set, readable, tap targets, no horizontal scroll.',
    '',
    'VERIFIED FACTS MAY BE USED:', ...verifiedFactLines(i.facts),
    '', 'UNVERIFIED FACTS MUST NOT BE PUBLISHED — if any of these appear, remove them:', ...forbiddenFactLines(i.facts),
    '', 'Approved redirect map to test:', ...(s.redirects.length ? s.redirects.map((r) => '    ' + r.from + ' -> ' + r.to) : ['    (none recorded)']),
    '', 'Finish with a pass/fail list using these exact lines so Paul can tick them in LeadFinderOS:',
    '- SEO / GEO QA complete', '- Schema valid and matches the visible page', '- Sitemap and robots.txt correct (OAI-SearchBot allowed)',
    '- Canonicals correct, the right domain everywhere', '- No broken important links', '- No unverified claim published', '- No placeholder content left',
    '', 'Commit fixes with clear messages. Never force push, reset, rebase, amend or clean.',
  ];
  return {
    id: 'seo_qa', title: '7. SEO / GEO QA prompt', kind: 'prompt', applicable: true, blockedBy: s.canonical_domain ? [] : ['Domain (canonical)'],
    help: 'Paste into Claude Code after the visual QA. It checks crawlability, schema, canonicals, redirects and facts, and fixes failures.',
    expect: 'A pass/fail list. Tick the matching boxes in the QA step.',
    text: L.join('\n'),
  };
}

/* ── 8. PRODUCTION ────────────────────────────────────────────────────────────────────────────── */

function productionCommands(i: BuildPackInput): PackItem {
  const s = i.state;
  const problem = cloudflareProblem(s);
  const blockedBy = [
    ...(problem ? [problem] : []),
    ...(!s.preview_url ? ['Preview URL (deploy and review a preview first)'] : []),
    ...(!s.canonical_domain ? ['Domain (canonical)'] : []),
    ...(!s.local_repo_path ? ['Local folder'] : []),
  ];
  if (blockedBy.length) {
    return {
      id: 'production', title: '8. Production deployment commands', kind: 'commands', applicable: true, blockedBy,
      help: 'Production commands are not generated until the items below are recorded. Nothing here guesses a project or a domain.',
      expect: '',
      text: ['PRODUCTION IS NOT READY — no command has been generated.', '', 'Record these first:', ...blockedBy.map((b) => '- ' + b)].join('\n'),
    };
  }
  const path = winPath(s.local_repo_path);
  const t = i.template && s.build_mode === 'template' ? i.template : null;
  const L = [
    '# ============================================================',
    '# PRODUCTION — only after you have reviewed the preview and the QA boxes are ticked',
    '# ============================================================',
    'Set-Location ' + q(path),
    '',
    '# -- 1. Make sure GitHub has exactly what you are about to publish --',
    'git status        # must say "nothing to commit, working tree clean" — if not, ask Claude to commit first',
    'git push',
    '',
    '# -- 2. Build and publish to PRODUCTION --',
    'npm run build',
    'npx wrangler pages deploy ' + (t ? t.buildOutputDir : 'dist') + ' --project-name ' + s.cloudflare_project + ' --branch main',
    '#    Live at https://' + s.cloudflare_project + '.pages.dev when it finishes.',
    '',
    '# -- 3. Record the commit that went live (paste into "Latest commit") --',
    'git log -1 --format="%h %s"',
    '',
    '# -- 4. Connect the real domain — in the browser, ONCE --',
    '#    Cloudflare dashboard → Workers & Pages → ' + s.cloudflare_project + ' → Custom domains → Set up a custom domain',
    '#    Enter: ' + s.canonical_domain + '   (and add www.' + s.canonical_domain.replace(/^www\./, '') + ' too, so both work)',
    '#    ⚠ This only works cleanly if ' + s.canonical_domain + '\'s DNS is in YOUR Cloudflare account. If the domain is',
    '#    managed by someone else (as MC Locksmiths\' was), STOP — do not change DNS you do not control; ask first.',
    '',
    '# -- 5. Then paste the Final Production QA prompt into Claude Code. --',
  ];
  return {
    id: 'production', title: '8. Production deployment commands', kind: 'commands', applicable: true, blockedBy: [],
    help: 'Publishes the approved site to production and connects the domain. Run only after the preview is approved.',
    expect: 'Record Production URL = https://' + s.canonical_domain + ', Latest commit, and Deployment status = Production deployed.',
    text: L.join('\n'),
  };
}

/* ── 9. FINAL PRODUCTION QA ───────────────────────────────────────────────────────────────────── */

function finalQaPrompt(i: BuildPackInput): PackItem {
  const s = i.state;
  const prod = s.production_url || (s.canonical_domain ? 'https://' + s.canonical_domain : MARK.domain);
  const L = [
    '# FINAL PRODUCTION QA — ' + (i.businessName || 'this client'),
    '',
    'The site is live at ' + prod + '. Verify PRODUCTION (not the preview, not localhost). Fix anything in the',
    'repo, then tell Paul what needs redeploying — do not deploy production yourself.',
    '',
    '- HTTPS works; http:// and www / non-www all end on ONE canonical address in one hop.',
    '- Every page from the approved architecture returns 200 on the real domain.',
    '- Every line of the redirect map returns one 301 straight to a 200 on the real domain (curl -I each).',
    '- No page carries noindex (header or meta). robots.txt and the sitemap are served from ' + prod + '.',
    '- Canonicals and schema @id / url use ' + prod + ' — no preview or pages.dev address anywhere.',
    '- Phone links dial the verified number; WhatsApp links open the verified WhatsApp number; email links work.',
    '- Forms: ⛔ do NOT send a test enquiry to the client. Ask Paul whether to run ONE clearly-labelled test to',
    '  an address he names; otherwise confirm the handler answers correctly without submitting.',
    '- All assets load from the new domain; nothing is hotlinked from the old site.',
    '- No placeholder text, no template leftovers, no unverified claim anywhere (compare with VERIFIED FACTS).',
    '- Mobile check on the live site at 375x812.',
    '',
    'VERIFIED FACTS:', ...verifiedFactLines(i.facts),
    '', 'Redirects to test:', ...(s.redirects.length ? s.redirects.map((r) => '    ' + r.from + ' -> ' + r.to) : ['    (none recorded)']),
    '', 'Finish with a pass/fail list using these exact lines so Paul can tick them in LeadFinderOS:',
    '- Redirects tested on production (one hop each)', '- Production deployed', '- Production checked end to end',
    '- Forms work (tested without sending a fake lead to the client)', '- Phone links work', '- WhatsApp links work',
  ];
  return {
    id: 'final_qa', title: '9. Final production QA prompt', kind: 'prompt', applicable: true,
    blockedBy: s.production_url || s.canonical_domain ? [] : ['Production URL or domain'],
    help: 'Paste into Claude Code after the production deploy. It checks the real domain end to end.',
    expect: 'A pass/fail list. Tick the Live boxes in the QA step.',
    text: L.join('\n'),
  };
}

/** The complete pack, in order. Items that do not apply are returned with applicable=false. */
export function buildPack(i: BuildPackInput): PackItem[] {
  return [
    setupCommands(i), capturePrompt(i), masterPrompt(i), localCommands(i), previewCommands(i),
    visualQaPrompt(i), seoQaPrompt(i), productionCommands(i), finalQaPrompt(i),
  ];
}

/** Every generated command line, for the safety test: nothing destructive may ever be emitted. */
export const FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
  /git\s+push\s+[^\n#]*(--force|-f\b|--force-with-lease)/i,
  /git\s+reset\b/i, /git\s+rebase\b/i, /git\s+clean\b/i, /--amend\b/i, /git\s+checkout\s+--\s/i,
  /Remove-Item\b/i, /\brm\s+-rf?\b/i, /\brmdir\b/i, /\bdel\s+\/[sq]/i,
];
