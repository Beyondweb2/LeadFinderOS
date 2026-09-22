/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SECTION 5 — WEBSITE BUILD. The workflow state, and the Claude Code rebuild prompt generated from
   everything Findable already knows about this client.

   ⛔ THE PROMPT IS GENERATED AT CLICK TIME AND NEVER STORED. Onboarding answers arrive late, a
   baseline finishes overnight, Paul edits the repo path — a prompt saved to the database is a prompt
   that is wrong by the time it is used, and nothing on screen would say so. The only things
   persisted are the seven workflow fields the operator types (outreach_leads.website_build).

   ⛔ NOTHING IS INVENTED. Every value comes from a resolved fact (clientFacts.ts) or a saved field.
   An unknown local repo path prints [LOCAL REPO PATH REQUIRED] — a literal instruction to supply it,
   never a plausible-looking guess that Claude would then act on.
   ⛔ A DISAGREEMENT BETWEEN SOURCES IS A QUESTION, NOT A CHOICE. Conflicts arrive already detected
   and land under CLIENT CONFIRMATION REQUIRED with both values and both sources named.
   ⛔ CITATION IS NOT CAUSATION. The do-not-break section says these URLs were CITED while an engine
   answered, and tells Claude to investigate before redirecting or removing one. It never says a page
   caused anything.

   ⚠️ BUILT FROM ARRAYS OF PLAIN STRINGS, joined — not one enormous template literal. A backtick
   inside a template literal has broken this repo's build three times (CLAUDE.md §3), and this text
   contains shell commands that want backticks around them in prose. Arrays remove the hazard.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ClientFacts, ConfirmationItem, ResolvedFact, ResolvedListFact } from './clientFacts.ts';
import { FACT_SOURCE_LABELS } from './clientFacts.ts';
import type { BaselineSummary, VisibilitySignal } from './baselineSummary.ts';

/* ── workflow state ──────────────────────────────────────────────────────────────────────────── */

/** The build statuses, in order. Stored as these tokens; displayed through the labels below. */
export const WEBSITE_BUILD_STATUSES = ['not_started', 'inventory', 'building', 'qa', 'ready_to_deploy', 'live'] as const;
export type WebsiteBuildStatus = (typeof WEBSITE_BUILD_STATUSES)[number];

export const WEBSITE_BUILD_STATUS_LABELS: Record<WebsiteBuildStatus, string> = {
  not_started: 'Not started',
  inventory: 'Inventory',
  building: 'Building',
  qa: 'QA',
  ready_to_deploy: 'Ready to deploy',
  live: 'Live',
};

export interface WebsiteBuildState {
  repo_url: string;
  local_repo_path: string;
  preview_url: string;
  production_url: string;
  canonical_domain: string;
  status: WebsiteBuildStatus;
  notes: string;
}

export const EMPTY_WEBSITE_BUILD: WebsiteBuildState = {
  repo_url: '', local_repo_path: '', preview_url: '', production_url: '',
  canonical_domain: '', status: 'not_started', notes: '',
};

/**
 * Read `outreach_leads.website_build` into a complete state.
 *
 * ⛔ AN UNRECOGNISED STATUS FALLS TO 'not_started', NOT TO "whatever was stored". A status is read by
 * the UI to say how far along a build is; an unknown token rendering as itself would put an
 * unexplained word on screen. Absent means not started — which on a build pipeline is the direction
 * that never overstates progress.
 */
export function parseWebsiteBuild(raw: unknown): WebsiteBuildState {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
  const str = (k: string) => String(o[k] ?? '').trim();
  const status = String(o.status ?? '').trim() as WebsiteBuildStatus;
  return {
    repo_url: str('repo_url'),
    local_repo_path: str('local_repo_path'),
    preview_url: str('preview_url'),
    production_url: str('production_url'),
    canonical_domain: str('canonical_domain'),
    status: (WEBSITE_BUILD_STATUSES as readonly string[]).includes(status) ? status : 'not_started',
    notes: str('notes'),
  };
}

/* ── the prompt ──────────────────────────────────────────────────────────────────────────────── */

export interface RebuildPromptInput {
  facts: ClientFacts;
  confirmations: ConfirmationItem[];
  build: WebsiteBuildState;
  /** The completed paid baseline, folded. Null when there is none yet. */
  baseline: BaselineSummary | null;
  /** The EXACT approved question set, in its frozen order. */
  frozenQuestions: string[];
  baselineAuditId: string | null;
  /** The client's own URLs engines cited while answering baseline questions. */
  signals: VisibilitySignal[];
  /** Stored crawl findings, already turned into sentences. Empty when nothing is stored. */
  crawlFindings: string[];
  crawlUrl: string | null;
  crawlCheckedAt: string | null;
  /** Page-plan rows already queued for this client. */
  plannedPages: Array<{ service?: string | null; town?: string | null; status?: string | null }>;
}

/** "value  (source: client onboarding)" — or the explicit not-recorded marker. */
function withSource(f: ResolvedFact, missing = 'NOT RECORDED — ask the client'): string {
  if (!f.value) return missing;
  return `${f.value}${f.source ? `   (source: ${FACT_SOURCE_LABELS[f.source]})` : ''}`;
}

function listWithSource(f: ResolvedListFact, missing = 'NOT RECORDED — ask the client'): string {
  if (!f.values.length) return missing;
  return `${f.values.join(', ')}   (source: ${f.source ? FACT_SOURCE_LABELS[f.source] : 'unknown'})`;
}

/** The literal marker Part 10 requires when the local repo path is unknown. Never a guess. */
export const LOCAL_REPO_PATH_REQUIRED = '[LOCAL REPO PATH REQUIRED]';

function projectContext(i: RebuildPromptInput): string[] {
  const f = i.facts;
  const out = [
    '## PROJECT CONTEXT',
    '',
    'Every line below came from Findable’s own records. Nothing here is guessed. Where a value',
    'says NOT RECORDED, it genuinely is not recorded — do not fill it in from the live site without',
    'saying so, and never invent one.',
    '',
    `- Business name:        ${withSource(f.businessName)}`,
    `- Live website:         ${withSource(f.website)}`,
    `- Canonical domain:     ${withSource(f.canonicalDomain)}`,
    `- Primary location:     ${withSource(f.primaryLocation)}`,
    `- Business category:    ${withSource(f.category)}`,
    `- Services:             ${listWithSource(f.services)}`,
    `- Service areas:        ${listWithSource(f.areas)}`,
    `- Contact name:         ${withSource(f.contactName, 'NOT RECORDED')}`,
    `- Contact email:        ${withSource(f.email, 'NOT RECORDED')}`,
    `- Contact phone:        ${withSource(f.phone, 'NOT RECORDED')}`,
    '',
    '### What the client told us at onboarding',
    `- What makes them different: ${withSource(f.standout, 'NOT RECORDED')}`,
    `- Accreditations:            ${withSource(f.accreditations, 'NOT RECORDED')}`,
    `- MUST NOT SAY:              ${withSource(f.mustNotSay, 'nothing recorded')}`,
    `- Website platform:          ${withSource(f.websitePlatform, 'NOT RECORDED')}`,
    `- Willing to migrate host:   ${withSource(f.willingToMigrate, 'NOT RECORDED')}`,
    `- Website route:             ${withSource(f.websiteRoute, 'NOT RECORDED')}`,
    `- Domain status:             ${withSource(f.domainStatus, 'NOT RECORDED')}`,
    `- Website access:            ${withSource(f.accessStatus, 'NOT RECORDED')}`,
    `- Google Business Profile:   ${withSource(f.gbp, 'NOT RECORDED')}`,
    `- Competitor they named:     ${withSource(f.competitorNamedByClient, 'NOT RECORDED')}`,
  ];
  if (f.onboardingIncomplete) {
    out.push('', '⚠ The onboarding questionnaire is marked INCOMPLETE. Use what is above; treat every',
      'NOT RECORDED as a real gap to raise, not as licence to assume.');
  }
  if (f.mustNotSay.value) {
    out.push('', `⛔ HARD CONSTRAINT — the client has said we must NOT say: ${f.mustNotSay.value}`,
      'This applies to every page, every heading and every meta description you write.');
  }
  out.push('', '### Repository and environment',
    `- Repository:        ${i.build.repo_url || 'NOT RECORDED'}`,
    `- Local repo path:   ${i.build.local_repo_path || LOCAL_REPO_PATH_REQUIRED}`,
    `- Preview URL:       ${i.build.preview_url || 'not created yet'}`,
    `- Production URL:    ${i.build.production_url || 'not decided yet'}`,
    `- Build status:      ${WEBSITE_BUILD_STATUS_LABELS[i.build.status]}`,
  );
  if (i.build.notes) out.push('', `### Operator notes`, i.build.notes);
  if (i.plannedPages.length) {
    out.push('', '### Pages already planned in Findable',
      ...i.plannedPages.map((p) => `- ${[p.service, p.town].filter(Boolean).join(' · ') || 'page'} — ${p.status || 'planned'}`),
      'These are the page plan Findable has queued. Reconcile your proposed architecture with them;',
      'do not silently drop or duplicate one.');
  }
  return out;
}

function baselineProtection(i: RebuildPromptInput): string[] {
  if (!i.baseline) {
    return [
      '## BASELINE PROTECTION',
      '',
      '⛔ This client has no completed paid baseline recorded yet. Do not create, run, or simulate',
      'one — measurement is Findable’s job and happens outside this repository. Ask Paul before',
      'assuming anything about their current AI visibility.',
    ];
  }
  const b = i.baseline;
  const out = [
    '## BASELINE PROTECTION — READ THIS BEFORE YOU TOUCH ANYTHING',
    '',
    'This client’s AI-visibility baseline is ALREADY COMPLETE and it is FROZEN.',
    '',
    `- Baseline completed:  ${b.completedLabel || 'recorded in Findable'}`,
    `- Baseline audit id:   ${i.baselineAuditId ?? 'not recorded'}`,
    `- Questions:           ${b.questionCount}, each asked ${b.runs || 3} times per engine`,
    `- Scored engines:      ${b.engineLabels.join(', ') || 'recorded in Findable'}`,
    `- Overall result:      named in ${b.named} of ${b.total} answers (${b.pct}%)`,
    ...b.perEngine.map((e) => `- ${e.label}: named in ${e.named} of ${e.total} answers (${e.pct}%)`),
    '',
    'RULES:',
    '- DO NOT change, re-run, regenerate or "improve" the baseline. It is not in this repository and',
    '  nothing you do here should try to reach it.',
    '- DO NOT rewrite the frozen questions. They are replayed verbatim at the four-week remeasure.',
    '- The website work you are about to do is what gets MEASURED against this baseline. That is the',
    '  point of the exercise: the before number already exists, and it must stay exactly as it is.',
    '',
    '### The exact frozen baseline questions',
    '',
    'These are the questions, in their approved order. They are here so you understand what this site',
    'is being judged on — NOT so you can stuff them into the pages. Writing a page that parrots a',
    'question back is the gimmick this whole approach rejects.',
    '',
    ...(i.frozenQuestions.length
      ? i.frozenQuestions.map((q, n) => `${n + 1}. ${q}`)
      : ['(The approved set is not available to this prompt. Ask Paul before assuming any wording.)']),
  ];

  const gaps = [
    b.absent.length ? `${b.absent.length} question(s) where the business was never named on any engine` : '',
    b.fragile.length ? `${b.fragile.length} question(s) where it was named on some asks but not others` : '',
    b.oneEngine.length ? `${b.oneEngine.length} question(s) where only one scored engine named it` : '',
    b.strong.length ? `${b.strong.length} question(s) where every ask named it` : '',
  ].filter(Boolean);
  if (gaps.length) out.push('', '### What the baseline found', ...gaps.map((g) => `- ${g}`));
  if (b.absent.length) {
    out.push('', 'Never named on these questions (the openings):',
      ...b.absent.slice(0, 12).map((q) => `- ${q.question}`));
  }
  if (b.fragile.length) {
    out.push('', 'Named only some of the time on these (on the edge of the answer):',
      ...b.fragile.slice(0, 12).map((q) => `- ${q.question} — ${q.namedCount} of ${q.answers} answers`));
  }
  if (b.oneEngine.length) {
    out.push('', 'Named by one engine only on these:',
      ...b.oneEngine.slice(0, 12).map((q) => `- ${q.question} — ${q.engines.join(', ')}`));
  }
  if (b.competitors.length && !b.namesWithheld) {
    out.push('', '### Competitors that actually appeared in the baseline answers',
      ...b.competitors.slice(0, 12).map((c) => `- ${c.name} (${c.count} mention${c.count === 1 ? '' : 's'})`),
      '',
      'These are for your understanding of the market only. ⛔ Do NOT name a competitor anywhere on',
      'the client’s website, and do not copy their content.');
  }
  if (b.namesWithheld) {
    out.push('', '⚠ Rival names from this baseline were withheld because the extracted list could not be',
      'trusted. Do not go looking for them; they are not needed for this work.');
  }
  if (b.nameNotJudgeable) {
    out.push('', '⚠ This business’s name is close to its trade plus its town, so an automated check cannot',
      'reliably tell a mention of the business from a mention of the trade. Treat the per-question',
      'detail as indicative, not as a score.');
  }
  return out;
}

function doNotBreak(i: RebuildPromptInput): string[] {
  const out = [
    '## DO-NOT-BREAK / EXISTING VISIBILITY SIGNALS',
    '',
    '⛔ WORDING MATTERS HERE. The URLs below were CITED by an AI engine while it answered a baseline',
    'question. That is a correlation and a citation — it is NOT proof that the page caused the',
    'business to be named, and you must not describe it that way to Paul or in a commit message.',
    '',
    'What it does mean: an engine has fetched and used these exact URLs. Changing, merging,',
    'redirecting or removing one is a real risk that has to be taken deliberately.',
    '',
    'RULE: investigate before you touch any URL in this list. If a rebuild would change its address,',
    'say so explicitly, explain why, and propose a 301 — do not do it silently.',
    '',
  ];
  if (!i.signals.length) {
    out.push('No citations of the client’s own site appear in the baseline evidence. That is itself a',
      'finding: nothing on their current site is being read back by the engines we score. It does NOT',
      'mean the existing URLs are safe to churn.');
  } else {
    for (const s of i.signals) {
      out.push(`- ${s.url}`);
      out.push(`    cited while answering: ${s.questions.slice(0, 3).map((q) => `"${q}"`).join('; ')}`);
      out.push(`    business was named on ${s.namedOnAny ? 'at least one' : 'none'} of those questions`);
    }
  }
  /* ⛔ THE FLOOR APPLIES EITHER WAY. An empty evidence list is not permission to churn URLs — it
     used to be, because this line only existed on the branch that had citations. */
  out.push('', 'Plus, until your inventory proves otherwise, treat as do-not-break: the homepage, every',
    'service page, every location page, and the contact page of the live site.');
  return out;
}

function crawlSection(i: RebuildPromptInput): string[] {
  if (!i.crawlFindings.length) return [];
  return [
    '## STORED TECHNICAL FINDINGS (from Findable’s own crawl — do not re-run it)',
    '',
    `Crawled: ${i.crawlUrl ?? 'the live site'}${i.crawlCheckedAt ? ` on ${i.crawlCheckedAt}` : ''}`,
    '',
    ...i.crawlFindings.map((f) => `- ${f}`),
    '',
    'Verify each of these yourself during the inventory — they are a starting point, and a stored',
    'finding can be out of date. ⛔ Do not carry a defect forward into the rebuild because the old',
    'site had it.',
  ];
}

function confirmations(i: RebuildPromptInput): string[] {
  if (!i.confirmations.length) {
    return ['## CLIENT CONFIRMATION REQUIRED', '', 'Nothing is in conflict and no required fact is missing at the time this prompt was generated.'];
  }
  return [
    '## CLIENT CONFIRMATION REQUIRED',
    '',
    'Findable’s sources disagree, or have nothing recorded, for the following. ⛔ A winner has NOT',
    'been chosen. Do not pick one, do not average them, and do not take the live site’s version as',
    'settled. Raise each of these with Paul and wait for the client’s answer before writing anything',
    'that depends on it.',
    '',
    ...i.confirmations.map((c) => `- ${c.label} (${c.kind}): ${c.detail}`),
  ];
}

/* The reusable half — identical for every client, so it is one constant rather than string-built. */
const WORKFLOW: string[] = [
  '## THE REBUILD WORKFLOW',
  '',
  'Work in these phases, in this order. Do not run ahead.',
  '',
  ' 1. FORENSIC CRAWL / INVENTORY of the entire live site. Every URL, not a sample.',
  ' 2. CLASSIFY every current URL: homepage, service, location, service+location, blog/article,',
  '    legal, utility, orphan, duplicate, thin, redirect, dead.',
  ' 3. CAPTURE GENUINE ASSETS LOCALLY — logo, favicon, real photographs of their work, trade badges,',
  '    manufacturer logos, review-platform marks. No hotlinking, ever.',
  ' 4. ESTABLISH THE SHARED DESIGN SYSTEM FIRST — tokens, type scale, spacing, components. Before any',
  '    page family is built, not alongside.',
  ' 5. REBUILD BY PAGE FAMILY, one family at a time, each reviewed before the next starts.',
  ' 6. PRESERVE GENUINE CONTENT AND BUSINESS FACTS. The live site and the verified Findable data are',
  '    the evidence base. Rewriting for clarity is fine; changing a fact is not.',
  ' 7. REMOVE OR MERGE ONLY GENUINELY THIN OR DUPLICATE ARCHITECTURE, and say what you are doing and',
  '    why before you do it.',
  ' 8. ONE PRIMARY PAGE PER IMPORTANT INTENT. If two pages compete for the same intent, one owns it.',
  ' 9. NO CLONED TOWN PAGES and no service × location matrix. A location page exists only where there',
  '    is genuinely different, true content to put on it.',
  '10. IMPROVE ENTITY CLARITY — the same business name, address, phone and description everywhere, and',
  '    an unambiguous statement of who this business is, what it does and where.',
  '11. TECHNICAL SEO, CRAWLABILITY AND SCHEMA — see the AI VISIBILITY STANDARDS section below.',
  '12. PREVIEW SETUP — see PREVIEW below.',
  '13. LIVE-VS-REBUILD VISUAL COMPARISON at matching viewport sizes (see PREVIEW).',
  '14. FUNCTIONAL PARITY — see FUNCTIONAL PARITY below.',
  '15. ANALYTICS AND SOCIAL METADATA — carried across deliberately, verified, nothing dropped silently.',
  '16. FINAL TECHNICAL QA.',
  '17. SAFE GIT WORKFLOW throughout (see WORKING STYLE).',
  '18. PRODUCTION DEPLOYMENT ONLY AFTER PAUL APPROVES, and only once the production hosting path is',
  '    actually known.',
  '19. POST-DEPLOYMENT VERIFICATION — redirects, forms, analytics, crawlability, all re-checked live.',
];

const PREVIEW: string[] = [
  '## PREVIEW',
  '',
  'Terminal 1:',
  '',
  '    cd <LOCAL_REPO_PATH>',
  '    npm run dev -- --host 0.0.0.0',
  '',
  'Then the site is at:',
  '',
  '    http://localhost:4321',
  '',
  'Terminal 2:',
  '',
  '    cloudflared tunnel --url http://localhost:4321',
  '',
  'Cloudflare prints a URL of the form https://xxxxx.trycloudflare.com — ASK PAUL for it. It is',
  'generated fresh each time and you cannot know it in advance; do not guess one.',
  '',
  '⛔ The Quick Tunnel is for development and QA ONLY.',
  '⛔ Do NOT create a Cloudflare Pages project just to get a preview.',
  '',
  'VISUAL COMPARISON IS REQUIRED, and it is a RENDERED comparison:',
  '- desktop 1440×900',
  '- mobile  375×812',
  'Compare the original and the rebuild at matching viewport sizes and look at both.',
  '⛔ HTML/CSS similarity is NOT proof of parity. Two pages can share a stylesheet and look nothing',
  'alike. If you cannot render and look, say so rather than claiming parity.',
];

const FUNCTIONAL_PARITY: string[] = [
  '## FUNCTIONAL PARITY',
  '',
  'Investigate every one of these on the live site and account for it in the rebuild:',
  '- forms of every kind, and where they submit',
  '- callback / call-back request forms',
  '- multi-step lead wizards',
  '- partial lead capture (anything that records a half-finished enquiry)',
  '- analytics of any kind',
  '- Google Ads conversion events',
  '- GA4 events',
  '- tel: links',
  '- WhatsApp links',
  '- mailto: links',
  '- galleries and lightboxes',
  '- embedded maps',
  '- booking or scheduling widgets',
  '- any existing backend endpoint the front end calls',
  '',
  '⛔ DO NOT SUBMIT FAKE LEADS into the client’s live website while investigating. A test enquiry is',
  'a real enquiry to the business owner and to whatever CRM or inbox it reaches. Read the markup, the',
  'network calls and the code — do not press send.',
  '',
  'If a piece of functionality needs a backend, DOCUMENT IT and wait: it cannot be finished until the',
  'production hosting path is known.',
];

const ASSET_AND_CONTENT_RULES: string[] = [
  '## ASSET AND CONTENT RULES',
  '',
  '⛔ NEVER INVENT ANY OF THE FOLLOWING. Not as filler, not as a placeholder, not "to be replaced',
  'later", not in a draft you intend to fix:',
  '  reviews · jobs or case studies · prices · services · service areas · awards · accreditations ·',
  '  licences · staff or team members · years trading · response times · guarantees · locations',
  '',
  'The evidence base is: the live site, and the verified Findable data in this prompt. If a fact is',
  'in neither, it does not go on the website — it goes on the list of things to ask Paul.',
  '',
  'Capture genuine assets locally: logo, favicon, the client’s own photographs, trade badges,',
  'manufacturer logos, review-platform assets. No hotlinking to the old site or anywhere else.',
];

const AI_VISIBILITY: string[] = [
  '## AI VISIBILITY STANDARDS (Findable’s, and they are not what people assume)',
  '',
  'The objective is NOT to trick an AI. It is to make the business easy to:',
  '  discover · crawl · understand · verify · cite · describe — and, possibly, recommend.',
  '',
  '⛔ DO NOT PROMISE, IMPLY OR DESIGN FOR:',
  '  - AI recommendations',
  '  - AI citations',
  '  - "#1 in AI"',
  '  - guaranteed inclusion in Google’s AI answers',
  'Nobody controls those. Anything on the site or in your reporting that suggests otherwise is wrong.',
  '',
  'What we actually check and fix:',
  '- content is in crawlable HTML, present without JavaScript',
  '- correct, self-referencing canonicals',
  '- a real sitemap that matches the site',
  '- robots.txt that does not block the search crawlers (OAI-SearchBot, ChatGPT-User, Claude-User,',
  '  PerplexityBot). A block on these is the fault that stops a business being named.',
  '- sensible internal linking, no orphans',
  '- honest structured data that matches what is visible on the page',
  '- entity consistency: identical name, address, phone and description everywhere',
  '',
  'GPTBot and other TRAINING crawlers are a separate question and a legitimate client choice. Do not',
  'change training-crawler access without asking Paul; it is not the same thing as search access.',
  '',
  '⛔ No AI gimmicks: no hidden text, no keyword stuffing, no question-parroting pages, no "AI-',
  'optimised" markup that says something the page does not.',
];

const WORKING_STYLE: string[] = [
  '## HOW TO WORK WITH PAUL',
  '',
  'Paul is non-technical. Explain everything in plain English. No jargon, and lead with the answer.',
  '',
  'At each meaningful phase, tell him:',
  '  1. what you found',
  '  2. what you changed',
  '  3. why',
  '  4. anything he needs to decide',
  '  5. what happens next',
  '',
  'BE CREDIT-EFFICIENT. Do NOT:',
  '- repeatedly re-scan things you have already scanned',
  '- perform broad unrelated refactors',
  '- revisit sections that have already been approved',
  '- produce huge speculative reports',
  '- make changes nobody asked for',
  '',
  'GIT SAFETY:',
  '- use logical commits, one coherent change each',
  '- NEVER reset, rebase, squash, amend, or force push unless Paul explicitly tells you to',
  '',
  'FREEZE APPROVED PAGE FAMILIES. Once Paul has approved a family, it does not change again without',
  'him asking for it.',
];

const FIRST_RUN_STOP: string[] = [
  '## YOUR FIRST TASK — AND THE ONLY ONE FOR NOW',
  '',
  '⛔ DO NOT REBUILD ANYTHING YET. Do not create pages, do not set up a design system, do not write',
  'a single component.',
  '',
  'Your first and only task is a FORENSIC INVENTORY of the existing live site. When it is done,',
  'report back with:',
  '',
  ' 1. the complete live URL inventory',
  ' 2. the page families you found',
  ' 3. the verified business facts the site actually states',
  ' 4. the genuine assets available (logo, favicon, photographs, badges)',
  ' 5. the current URL architecture',
  ' 6. duplication and thin-page issues',
  ' 7. functionality and forms',
  ' 8. analytics',
  ' 9. schema / structured data',
  '10. the potential do-not-break URLs',
  '11. your proposed rebuild phases',
  '12. the client confirmations required',
  '',
  'THEN STOP. Paul reviews all of that before the build begins.',
];

/**
 * The complete, reusable Claude Code rebuild prompt for ONE client, with that client's verified
 * context already filled in.
 */
export function buildRebuildPrompt(i: RebuildPromptInput): string {
  const name = i.facts.businessName.value || 'this client';
  const repo = i.build.local_repo_path || LOCAL_REPO_PATH_REQUIRED;
  const header = [
    `# WEBSITE REBUILD — ${name}`,
    '',
    'You are rebuilding this business’s website for Findable. Read this whole brief before you start.',
    'It contains the client’s verified details, their completed AI-visibility baseline, the rules that',
    'apply to every Findable rebuild, and a hard stop after the first phase.',
    '',
    `Generated from Findable’s live records at ${new Date().toISOString()}.`,
    '',
  ];
  const sections = [
    header,
    projectContext(i),
    [''],
    baselineProtection(i),
    [''],
    doNotBreak(i),
    [''],
    crawlSection(i),
    i.crawlFindings.length ? [''] : [],
    confirmations(i),
    [''],
    WORKFLOW,
    [''],
    PREVIEW.map((line) => line.replace('<LOCAL_REPO_PATH>', repo)),
    [''],
    FUNCTIONAL_PARITY,
    [''],
    ASSET_AND_CONTENT_RULES,
    [''],
    AI_VISIBILITY,
    [''],
    WORKING_STYLE,
    [''],
    FIRST_RUN_STOP,
    [''],
  ];
  return sections.flat().join('\n');
}
