/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALESPERSON'S EXPLAINER — ONE SOURCE OF WORDS (sales workspace v2, Paul, 2026-10-05).
   The Call tab, the voice-note coaching and the "how does it actually work?" follow-up voice note all
   read these lines; nothing re-words them elsewhere.

   ⛔ EVERY CLAIM IS TRUE OF THE PRODUCT AS BUILT (traced 2026-10-05; docs/pre-sales-certification/
      sales-workspace-v2.md):
      · Discovery: perTownCounts (supabase/functions/_shared/baseline-discovery.ts) asks the generator for
        40 home-town questions when there are no extra areas, 24 + 8 per area for up to three areas
        (40–48), more for many towns, capped at DISCOVERY_MAX_QUESTIONS (80); DISCOVERY_RUNS = 3 on
        ChatGPT and Gemini. Hence "around 40 … more if you cover several towns".
      · The 20 are chosen for BALANCE first (services, towns, ways of asking — baselineMix.ts); questions
        already won every time and ones with no local race are left out; opportunity breaks ties
        (baselineRecommendation.ts). Hence the wording below — NOT "we only target what's winnable".
      · Baseline = BASELINE_QUESTIONS × BASELINE_RUNS × the two scored engines; the four-week re-measure
        replays the SAME asked set (REMEASURE_OFFSET_DAYS = 28).
      · The monthly (memory monthly-offer-wording): a new page each month, a monthly AI visibility CHECK,
        adjustments as we learn (+ hosting on Build). "check", never "audit", to a client.
   ⛔ NEVER: "AI has replaced Google", "Google is dead", "AI cannot recommend you without a website", a
      ranking / recommendation promise, or a "secret AI trick". The guarantee is the measured number.
   Pure: constants only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { BASELINE_QUESTIONS, BASELINE_RUNS } from './auditQuestionCounts.ts';
import { QUICK_CLOSE_PROMISE } from './quickClose.ts';

export const SCORED_ENGINE_NAMES = ['ChatGPT', 'Gemini'] as const;
/** 20 × 3 × 2 = 120 — derived, never typed. */
export const BASELINE_ANSWERS = BASELINE_QUESTIONS * BASELINE_RUNS * SCORED_ENGINE_NAMES.length;
/** "around 40" — perTownCounts(0).primary. Asserted against the engine by scripts/sales-workspace-v2.test.ts. */
export const DISCOVERY_ABOUT = 40;
export const REMEASURE_WEEKS = 4;
/** Said, not written as a numeral, at the start of a sentence. */
export const REMEASURE_WEEKS_WORD = 'Four';

/* ── C. WHY THIS MATTERS ─────────────────────────────────────────────────────────────────────── */
export interface SourcedPoint { text: string; source: string; url: string }
export const YEXT_SOURCE = 'Yext — 2026 UK Consumer Search Behaviours, n=600 UK consumers';
export const YEXT_URL = 'https://www.yext.com/blog/how-uk-consumers-navigate-local-search-in-age-of-ai';
export const WHY_IT_MATTERS: readonly SourcedPoint[] = [
  { text: 'AI is already becoming a real way people find local businesses. A 2026 Yext study found 36.7% of UK consumers had used AI for local search in the previous month.', source: YEXT_SOURCE, url: YEXT_URL },
  { text: 'The same study found 24% had tried a new local business because of an AI recommendation.', source: YEXT_SOURCE, url: YEXT_URL },
];
/** The same two Yext figures as STAT CARDS for the Call screen (sales-team-today, 2026-10-06). ⛔ The source
 *  stays HERE, in code (YEXT_SOURCE / YEXT_URL) — the Call screen shows the figure and its line, never a link,
 *  a URL or a citation (Paul: no research bibliography in the sales call UI). 36.7% is shown rounded. */
export const WHY_IT_MATTERS_STATS: readonly { figure: string; label: string; source: string; url: string }[] = [
  { figure: '37%', label: 'of UK consumers surveyed used AI for local search in the previous month', source: YEXT_SOURCE, url: YEXT_URL },
  { figure: '24%', label: 'had tried a new local business after an AI recommendation', source: YEXT_SOURCE, url: YEXT_URL },
];
/** The one line under the stat cards on the Call screen. */
export const GOOGLE_STILL_MATTERS_SHORT = 'Google still matters. AI is becoming another way customers discover local businesses.';
/** The framing line — said when Google comes up. */
export const GOOGLE_STILL_MATTERS = 'Google still matters. AI is becoming another important way customers discover businesses.';

/* ── D. WHAT FINDABLE ACTUALLY DOES ──────────────────────────────────────────────────────────── */
export const WHAT_WE_DO: readonly string[] = [
  `We start with a discovery check: around ${DISCOVERY_ABOUT} customer-style questions (more if you cover several towns), each asked three times on ${SCORED_ENGINE_NAMES.join(' and ')}, to see how AI answers them today and where the openings are.`,
  `From that we choose the strongest ${BASELINE_QUESTIONS}: a balanced mix across your main services, your towns and the different ways customers ask — leaving out questions you already win every time and ones with no real local race.`,
  `Then we run the formal baseline: ${BASELINE_QUESTIONS} questions × ${BASELINE_RUNS} runs × ${SCORED_ENGINE_NAMES.join(' + ')} = ${BASELINE_ANSWERS} answers.`,
  `${REMEASURE_WEEKS_WORD} weeks later we ask the same ${BASELINE_QUESTIONS} questions again, the same way, so the before and after compare like for like.`,
  'After that we keep working on the website each month — a new page, a monthly AI visibility check and adjustments as we learn — so search engines and AI tools can understand the business more clearly.',
];
/** One line to memorise. (2026-10-07: plain words, Paul.) */
export const WHAT_WE_DO_SHORT = `We check how often AI names you on ${BASELINE_QUESTIONS} real customer questions, optimise your website so search engines and AI can properly understand what you do and where, and run the same check again after ${REMEASURE_WEEKS_WORD.toLowerCase()} weeks.`;

/* ── HOW DO YOU KNOW WHAT IS WINNABLE? ───────────────────────────────────────────────────────── */
export const HOW_WE_KNOW: readonly string[] = [
  'One thing we look for is fragmented results.',
  "If the same question gives different businesses across repeated AI answers, there isn't a clear winner. That can mean the question is more open.",
  'If the same established businesses appear consistently every time, that is usually a harder question.',
];
export const HOW_WE_KNOW_EXAMPLES: readonly { label: 'Harder' | 'More open'; text: string }[] = [
  { label: 'Harder', text: '"best locksmith in Canterbury" — if the same established companies come up every time.' },
  { label: 'More open', text: '"who replaces uPVC door locks in Canterbury?" — if the businesses named change between runs.' },
];
export const WINNABILITY_ALSO_DEPENDS_ON: readonly string[] = [
  'whether the service genuinely matches the business',
  'local relevance',
  'how settled the AI answers are',
  'whether competitors have much stronger public evidence',
];
export const HOW_WE_KNOW_CAVEAT = "It shows where there's room. It doesn't guarantee we'll win any one question — the guarantee is on the overall measured number.";

/* ── E. HOW WE BUILD FOR AI VISIBILITY ───────────────────────────────────────────────────────── */
export const AI_FRIENDLY_SITE: readonly string[] = [
  'Clear, crawlable public pages',
  'Correct sitemap, robots and canonical tags',
  'One clear main page for each genuine service or customer need that warrants its own page',
  'Clear service, location and evidence on the important pages',
  "Strong internal linking, so no page is orphaned",
  'Consistent business details everywhere',
  'Appropriate Organization / LocalBusiness / Breadcrumb schema',
  'Genuine credentials, services and evidence — never invented claims',
  'Local pages only where there is real local information',
  'No cloned town pages where only the town name changes',
  'No keyword stuffing or mass AI filler',
  "Check legitimate AI and search crawlers aren't accidentally blocked",
];
/* ── F. WHY THE WEBSITE MATTERS ──────────────────────────────────────────────────────────────── */
export const WEBSITE_MATTERS = 'AI still has to get its information from somewhere. Your website is one of the clearest places to explain exactly what you do, where you work and why the business is credible.';

/* ── VOICE NOTE: the optional "how does it actually work?" follow-up (~20–30 seconds spoken) ──── */
export const FOLLOW_UP_VOICE_NOTE = [
  'Hi, it\'s {rep} from Findable — you asked how it actually works, so here\'s the short version.',
  `We ask ChatGPT and Gemini ${BASELINE_QUESTIONS} questions your customers really ask, three times each, and count how often they name you.`,
  'Then we optimise your website so AI understands what you do and where.',
  `After ${REMEASURE_WEEKS_WORD.toLowerCase()} weeks we ask the same questions again and compare. ${QUICK_CLOSE_PROMISE}`,
].join(' ');
/** Spoken length at ~150 words a minute, in seconds (the coaching shows it). */
export const spokenSeconds = (text: string) => Math.round((text.trim().split(/\s+/).length / 150) * 60);
