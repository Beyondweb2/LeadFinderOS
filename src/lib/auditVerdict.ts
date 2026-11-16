/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT VERDICT RULES v2 (Paul, 2026-11-15) and v3 (2026-11-16, decideVerdictV3 below — the rule for new audits).
   The full rule, in words: docs/AUDIT_RULES.md.

   One search, its answers (3 asks x ChatGPT + Gemini = 6), one verdict. First rule that fits wins:
     0. not scored  — a failed answer -> re-run, never a verdict; a genuinely odd question (a doubled word, a run-on)
                      -> flagged, not scored. A missing "in" is how people search: never flagged (fix 2).
     1. VISIBLE     — the business is named (strict name match, strictName.ts) in ANY answer -> Winnable,
                      "Already visible: X of N". Beats everything below.
     -  left out    — a service they don't offer / not on their site yet (unchanged from before).
     2. CROWDED     — most answers name firms of the right trade and the top 3 firms take at least CROWDED_AT of every
                      mention -> Not winnable, those firms stored (Paul, 2026-11-15, replaces the closed-list rule:
                      answers always shuffle a little, so "the same firms in every spot" almost never fired).
     3. OPEN        — any spot rotates -> Winnable; repeat firms stored as "ones to beat" ("Names change" / "A few repeat"),
                      a firm in 5+ of 6 answers marked "always there".
     4. NO LEADER   — nobody named in most answers on BOTH engines -> Winnable "No clear leader" + why
                      (general advice / doesn't know anyone / refused).
     5. DIRECTORY   — only directories named -> Winnable "Directory gap" (listed).
     6. CATEGORY / LOCAL GAP — only firms of another trade -> "Category gap"; Gemini answered for another place
                      -> "Local gap" (Gemini only). Both Winnable.
   No big-city cap and no "engines disagree" logic. ChatGPT and Gemini are counted separately (perEngine).
   Every verdict carries an internal label and reason; the client sees only Winnable / Not winnable.

   ⛔ NOT A SCORE (docs/architecture-rules.md): fixed written rules over counts; same answers -> same verdict.
   Pure; no I/O; relative imports carry .ts (reached by the render-audit-report edge function).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The newest verdict rules. v2 (2026-11-15) and v3 (2026-11-16 morning) stay for the audits made on them; v4 (2026-11-16)
 *  is the evidence rule below with "locked spots" in place of the 70% line. */
export const AUDIT_RULES_VERSION = 4 as const;
export type AuditRules = 1 | 2 | 3 | 4;

/* WHICH RULES A REPORT USES. An audit made before v2 shipped keeps the old rule, so a link already sent keeps the page it
   showed; an audit made after, or a re-scored copy (a run carrying results.report_rules = 2), uses v2. The same for v3. */
export const AUDIT_RULES_V2_FROM = '2026-11-15T06:00:00Z';
/** Rules v3 (Paul, 2026-11-16, docs/AUDIT_RULES.md): set to just after extract-competitors began marking each answer it read
 *  (`firms_read`), so every v3 audit's answers can carry that mark. */
export const AUDIT_RULES_V3_FROM = '2026-11-16T10:30:00Z';
/** Rules v4 (Paul, 2026-11-16, docs/AUDIT_RULES.md): "locked spots" (B′) + one firm's spellings merged. Set to after its deploy. */
export const AUDIT_RULES_V4_FROM = '2026-11-16T14:00:00Z';
/** THE GUARANTEE'S NAME RULER (Paul, 2026-11-15): a baseline created on rules v2 (or later) counts "named" by the strict
 *  match, on both sides of its day-28 comparison and in its frozen day-0 snapshot. Name + website only (the same identity
 *  everywhere, so the two sides can never differ). Older and paid baselines: undefined = the ruler they were sold on. */
export function guaranteeIdentityFor(baselineCreatedAt: string | null | undefined, name: string | null | undefined, website: string | null | undefined): { name: string; domains: string[] } | undefined {
  const n = String(name ?? '').trim();
  if (!n || auditRulesFor({ createdAt: baselineCreatedAt }) < 2) return undefined;
  const w = String(website ?? '').trim();
  return { name: n, domains: w ? [w] : [] };
}
export function auditRulesFor(o: { createdAt: string | null | undefined; runRules?: unknown[] }): AuditRules {
  const stamped = (o.runRules ?? []).map((r) => Number(r));
  if (stamped.includes(4)) return 4;
  if (stamped.includes(3)) return 3;
  if (stamped.includes(2)) return 2;
  const t = o.createdAt ? Date.parse(o.createdAt) : NaN;
  if (!Number.isFinite(t)) return 1;
  return t >= Date.parse(AUDIT_RULES_V4_FROM) ? 4 : t >= Date.parse(AUDIT_RULES_V3_FROM) ? 3 : t >= Date.parse(AUDIT_RULES_V2_FROM) ? 2 : 1;
}

/** RULE 2's line: the top 3 firms' share of every firm mention at which a search is crowded (Not winnable). Chosen from
 *  the stored Moments (ukuarx) and LDM (f7n6d2) answers; the table is in docs/AUDIT_RULES.md. */
export const CROWDED_AT = 0.7;
/** How many firms count as "the top". */
export const CROWD_TOP = 3;

/** 'closed' is the retired rule 2 (kept so an old verdicts_v2 snapshot still reads); new verdicts say 'crowded'. */
export type VerdictRule =
  | 'rerun' | 'unnatural' | 'left_out'
  | 'visible' | 'crowded' | 'closed' | 'open' | 'no_leader' | 'directory_gap' | 'category_gap' | 'local_gap'
  /* rules v3: an answer we could not read ("Couldn't measure"), and neither AI naming firms ("AI doesn't name businesses here"). */
  | 'unmeasured' | 'no_names';
export type EmptyWhy = 'general advice' | "doesn't know anyone" | 'refused';

/** One answer, already read: who it named, which directories, whether it failed or answered for another place. */
export interface AnswerFacts {
  engine: 'chatgpt' | 'gemini';
  failed: boolean;
  /** Strict name match: counted / near-name (flagged, not counted) / not named. */
  you: 'named' | 'near' | 'no';
  near: string[];
  /** Real businesses named (never the business itself, never a directory). Near-names are included: another business. */
  firms: string[];
  dirs: string[];
  /** Rules v3: registers and regulators the answer sends people to check (Gas Safe Register, NICEIC…). Never a firm,
   *  never a directory. */
  registers?: string[];
  /** Gemini only: the answer is about another place with the same name. */
  wrongPlace: boolean;
  text: string;
}

export interface SearchFacts {
  question: string;
  answers: AnswerFacts[];
  /** The search's own trade words (headOf), for the category check. */
  head: string | null;
  /** 'not_offered' (they said no) / 'not_on_site' (not on their site yet) / null. */
  leftOut: 'not_offered' | 'not_on_site' | null;
  /** The place the search names, for the internal reason. */
  area: string | null;
  /** Grouping key for firm names (reportOpportunity.firmKey). */
  key: (name: string) => string;
}

export interface FirmCount { name: string; count: number }
/** Rule 2's evidence, kept on every verdict: right-trade firms over the answers about the right place. */
export interface Crowding {
  /** Answers (of `answers`) that named at least one right-trade firm. */
  answersWithFirms: number;
  /** Different firms named. */
  distinct: number;
  /** Every firm mention (a firm counted once per answer). */
  mentions: number;
  /** The top 3 firms, most first. */
  top: FirmCount[];
  /** Their share of every mention, 0..1 (0 when no mentions). */
  topShare: number;
}
export interface EngineCount { answers: number; named: number; near: number; top: FirmCount | null }

export interface AuditVerdict {
  rules: 2 | 3 | 4;
  /** What the client sees. null = not shown (re-run, couldn't measure, unnatural, left out). 'no_names' (rules v3) = AI
   *  doesn't name businesses here: its own group, never Winnable. */
  verdict: 'winnable' | 'not_winnable' | 'no_names' | null;
  /** Answers that failed or could not be read (no verdict comes from them). */
  unmeasured?: number;
  /** Rules v3: registers / regulators the answers send people to check (never firms, never directories). */
  registers?: string[];
  rule: VerdictRule;
  /** Internal label: "Already visible: 6 of 6", "Closed list", "Directory gap"… */
  label: string;
  /** Internal reason, one sentence with its evidence (may name competitors: operator only). */
  reason: string;
  namedYou: number;
  answers: number;
  nearNames: string[];
  perEngine: { chatgpt: EngineCount; gemini: EngineCount };
  /** Rule 2's counts, on every scored verdict (null when not scored). */
  crowding: Crowding | null;
  /** Rule 2: the top firms that crowd the list. Empty otherwise. */
  lockedBy: FirmCount[];
  /** Rule 3: firms that repeat (2+ answers), most first; "always there" = in 5+ of 6. */
  toBeat: FirmCount[];
  /** Rule 5: the directories named. */
  directories: string[];
  /** Rule 4: why most answers named nobody. */
  emptyWhy: EmptyWhy | null;
}

/* ── Unnatural questions: flagged, never scored ───────────────────────────────────────────── */
/** A search a real customer would not type: a doubled word or a run-on. A place with no "in" ("wedding content creator
 *  Ireland") is how people search and is never flagged (Paul, 2026-11-15). */
export function unnaturalReason(question: string): string | null {
  const q = question.trim().replace(/\s+/g, ' ');
  const words = q.split(' ');
  for (let i = 1; i < words.length; i++) if (words[i].toLowerCase() === words[i - 1].toLowerCase() && /^[a-z]+$/i.test(words[i])) return `the word "${words[i]}" twice`;
  if (words.length > 14) return 'too long for a real search';
  return null;
}

/* ── Why an answer named nobody ───────────────────────────────────────────────────────────── */
const REFUSED = /\b(i\s+(?:can(?:'|’|no)?t|cannot|am unable to|'m unable to|’m unable to|won(?:'|’)t)\s+(?:recommend|endorse|provide (?:specific )?recommendations|name specific|suggest specific))|\bunable to (?:recommend|endorse)\b/i;
const NO_KNOWLEDGE = /\b(i\s+(?:don(?:'|’)t|do not)\s+have\s+(?:specific|a list|information|details|access|up-to-date|real-time|current)|(?:couldn(?:'|’)t|could not|wasn(?:'|’)t able to|was unable to)\s+find|no (?:specific|verified|confirmed) (?:businesses|firms|companies|providers|creators|listings)|not aware of (?:any|specific)|i(?:'|’)m not (?:sure|certain) (?:of|which|about))/i;
export function emptyWhyOf(text: string): EmptyWhy {
  if (REFUSED.test(text)) return 'refused';
  if (NO_KNOWLEDGE.test(text)) return "doesn't know anyone";
  return 'general advice';
}

/* ── Other trades, for the category gap. A firm with no trade word counts as the right trade. ── */
const TRADE_GROUPS: { g: string; re: RegExp }[] = [
  { g: 'photo', re: /\bphotograph(y|er|ers|ic)?\b|\bphotos?\b/i },
  { g: 'video', re: /\b(films?|video(s|graphy|grapher|graphers)?|cinema(tography)?|motion)\b/i },
  { g: 'content', re: /\b(content|creators?|reels?|social|socials|tiktoks?|stories)\b/i },
  { g: 'plumbing', re: /\b(plumb(ing|er|ers)?|heating|boilers?|gas)\b/i },
  { g: 'electrical', re: /\belectric(al|ian|ians)?\b|\beicr\b/i },
  { g: 'building', re: /\b(build(ing|ers?)?|construction|roof(ing|ers?)?|joinery|carpent(ry|ers?))\b/i },
  { g: 'maintenance', re: /\b(maintenance|handyman|repairs?)\b/i },
  { g: 'events', re: /\b(florist|flowers|dj|band|catering|caterers?|venue|hotel|castle|makeup|hair|bridal)\b/i },
  { g: 'accounting', re: /\b(accountan(cy|ts?)|bookkeep(ing|ers?)|tax)\b/i },
];
const groupsOf = (s: string): Set<string> => new Set(TRADE_GROUPS.filter((t) => t.re.test(s)).map((t) => t.g));
/** Does this firm name say it is a different trade from the search? Unknown trade = no. */
export function otherTrade(firm: string, head: string | null): boolean {
  if (!head) return false;
  const mine = groupsOf(head);
  if (!mine.size) return false;
  const theirs = groupsOf(firm);
  if (!theirs.size) return false;
  for (const g of theirs) if (mine.has(g)) return false;
  return true;
}

function countFirms(answers: AnswerFacts[], key: (s: string) => string, pick: (a: AnswerFacts) => string[]): FirmCount[] {
  const counts = new Map<string, number>(); const names = new Map<string, Map<string, number>>();
  for (const a of answers) {
    const seen = new Set<string>();
    for (const f of pick(a)) {
      const k = key(f); if (!k || seen.has(k)) continue; seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      const m = names.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); names.set(k, m);
    }
  }
  const display = (k: string) => [...(names.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? k;
  return [...counts.entries()].map(([k, count]) => ({ name: display(k), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const list = (xs: string[], n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? ` +${xs.length - n} more` : '');

export function decideVerdict(s: SearchFacts): AuditVerdict {
  const total = s.answers.length;
  const ok = s.answers.filter((a) => !a.failed);
  const failed = total - ok.length;
  const eng = (e: 'chatgpt' | 'gemini'): EngineCount => {
    const xs = ok.filter((a) => a.engine === e);
    const top = countFirms(xs.filter((a) => !a.wrongPlace), s.key, (a) => a.firms)[0] ?? null;
    return { answers: xs.length, named: xs.filter((a) => a.you === 'named').length, near: xs.filter((a) => a.you === 'near').length, top };
  };
  const perEngine = { chatgpt: eng('chatgpt'), gemini: eng('gemini') };
  const namedYou = ok.filter((a) => a.you === 'named').length;
  const nearNames = [...new Set(ok.flatMap((a) => a.near))];
  const base = { rules: 2 as const, namedYou, answers: ok.length, nearNames, perEngine, crowding: null as Crowding | null, lockedBy: [], toBeat: [], directories: [], emptyWhy: null, unmeasured: failed };
  const out = (verdict: AuditVerdict['verdict'], rule: VerdictRule, label: string, reason: string, extra: Partial<AuditVerdict> = {}): AuditVerdict =>
    ({ ...base, lockedBy: [], toBeat: [], directories: [], verdict, rule, label, reason, ...extra });
  const nearNote = nearNames.length ? ` Near-name flagged, not counted: ${list(nearNames)}.` : '';

  // 0. Not scored.
  if (total === 0 || failed > 0 || perEngine.chatgpt.answers === 0 || perEngine.gemini.answers === 0) {
    return out(null, 'rerun', 'Re-run needed', total === 0 ? 'No answers stored yet.' : `${failed || 'Some'} of ${total} answers failed or are missing; re-run, never a verdict.`);
  }
  const odd = unnaturalReason(s.question);
  if (odd) return out(null, 'unnatural', 'Unnatural question: not scored', `Flagged: ${odd}.${nearNote}`);

  /* Rule 2's counts, worked out once and kept on every verdict from here (so the report and the operator can show them). */
  const local = ok.filter((a) => !a.wrongPlace);
  const rightOf = (a: AnswerFacts) => a.firms.filter((f) => !otherTrade(f, s.head));
  const right = countFirms(local, s.key, rightOf);
  const mentions = right.reduce((n, f) => n + f.count, 0);
  const topFirms = right.slice(0, CROWD_TOP);
  const crowding: Crowding = {
    answersWithFirms: local.filter((a) => rightOf(a).length > 0).length,
    distinct: right.length, mentions, top: topFirms,
    topShare: mentions ? topFirms.reduce((n, f) => n + f.count, 0) / mentions : 0,
  };
  base.crowding = crowding;

  // 1. Already named anywhere -> winnable. Beats every rule below.
  if (namedYou > 0) {
    return out('winnable', 'visible', `Already visible: ${namedYou} of ${ok.length}`,
      `Named in ${namedYou} of ${ok.length} answers (ChatGPT ${perEngine.chatgpt.named}/${perEngine.chatgpt.answers}, Gemini ${perEngine.gemini.named}/${perEngine.gemini.answers}).${nearNote}`);
  }
  if (s.leftOut) return out(null, 'left_out', s.leftOut === 'not_offered' ? 'Not their service' : 'Not on their site yet',
    s.leftOut === 'not_offered' ? 'They told us they do not offer this.' : 'Not on their site yet: add a page if they offer it.');

  // 2. CROWDED -> Not winnable: most answers name firms of the right trade, and the top 3 take CROWDED_AT or more of
  //    every mention. A search where most answers name nobody is never crowded (that is rule 4).
  if (crowding.answersWithFirms * 2 > ok.length && crowding.topShare >= CROWDED_AT) {
    const pct = Math.round(crowding.topShare * 100);
    return out('not_winnable', 'crowded', 'Crowded',
      `${crowding.answersWithFirms} of ${ok.length} answers named ${crowding.distinct} different firm${crowding.distinct === 1 ? '' : 's'}; the top ${Math.min(CROWD_TOP, crowding.distinct)} (${topFirms.map((f) => `${f.name} ${f.count}`).join(', ')}) take ${pct}% of the ${mentions} mentions.${nearNote}`, { lockedBy: topFirms });
  }
  const always = right.filter((f) => f.count * 6 >= ok.length * 5);

  // 3. The right firms are named, nobody at 5/6 -> winnable; repeat firms are the ones to beat. "Named" means firms
  //    come up in most answers on at least one engine; when most answers on BOTH engines name nobody, that is rule 4.
  const nobody = (a: AnswerFacts) => !a.firms.length && !a.dirs.length;
  const mostEmpty = (e: 'chatgpt' | 'gemini') => { const xs = ok.filter((a) => a.engine === e); return xs.filter(nobody).length * 2 > xs.length; };
  const bothEmpty = mostEmpty('chatgpt') && mostEmpty('gemini');
  if (right.length && !bothEmpty) {
    const toBeat = [...always, ...right.filter((f) => f.count >= 2 && !always.some((x) => s.key(x.name) === s.key(f.name)))].slice(0, 5);
    const few = always.length > 0 || right.some((f) => f.count * 2 >= ok.length);
    const named = local.filter((a) => a.firms.length).length;
    return out('winnable', 'open', few ? 'A few repeat' : 'Names change',
      `${named} of ${ok.length} answers named ${right.length} different firms; the list rotates.${always.length ? ` Always there: ${always.map((f) => `${f.name} (${f.count} of ${ok.length})`).join(', ')}.` : ''}${toBeat.length ? ` Ones to beat: ${toBeat.map((f) => `${f.name} (${f.count})`).join(', ')}.` : ''}${nearNote}`, { toBeat });
  }

  // 4. Nobody named in most answers on BOTH engines -> no clear leader.
  const whyOf = (): EmptyWhy => {
    const c = new Map<EmptyWhy, number>();
    for (const a of ok.filter(nobody)) { const w = emptyWhyOf(a.text); c.set(w, (c.get(w) ?? 0) + 1); }
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general advice';
  };
  if (bothEmpty) {
    const why = whyOf();
    return out('winnable', 'no_leader', `No clear leader (${why})`, `${ok.filter(nobody).length} of ${ok.length} answers named nobody: ${why}.${nearNote}`, { emptyWhy: why });
  }

  // 5. Only directories named -> directory gap.
  const dirs = countFirms(ok, (x) => x.toLowerCase(), (a) => a.dirs).map((d) => d.name);
  if (dirs.length) return out('winnable', 'directory_gap', 'Directory gap', `AI names only directories: ${list(dirs, 5)}.${nearNote}`, { directories: dirs });

  // 6. Only other trades / another place -> category or local gap.
  const others = countFirms(local, s.key, (a) => a.firms.filter((f) => otherTrade(f, s.head)));
  if (others.length) return out('winnable', 'category_gap', 'Category gap', `AI names other trades instead: ${list(others.map((f) => f.name))}.${nearNote}`);
  const wrong = ok.filter((a) => a.wrongPlace).length;
  if (wrong) return out('winnable', 'local_gap', 'Local gap', `${wrong} Gemini answer${wrong === 1 ? '' : 's'} answered for another ${s.area ?? 'place'}.${nearNote}`);

  const why = whyOf();
  return out('winnable', 'no_leader', `No clear leader (${why})`, `No firm named in most answers: ${why}.${nearNote}`, { emptyWhy: why });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT VERDICT RULES v3 — THE EVIDENCE RULE (Paul, 2026-11-16, docs/AUDIT_RULES.md).

   Why: the 16 Nov London Discovery said "Winnable 39" when OpenAI had no credit and not one answer's firms were read, and
   on the real answers v2 still said Winnable 39 (ChatGPT named firms in 3 of 3 asks, Gemini in 0 of 3, so "most of the 6
   answers" never held and nothing could be Crowded). v3 judges EACH AI on its own asks. First rule that fits wins:
     0. Couldn't measure — any answer that failed OR whose firms were not read (no `firms_read` mark): no verdict, never
                          counted. Too many of them in an audit = "Audit incomplete" (auditCompleteness).
     1. Already named   — the business is named (strict match) in any answer. Beats everything below.
     -  left out        — a service they don't offer / not on their site yet (unchanged).
     2. An AI "names firms" when it names a right-trade firm in NAMES_IN_ASKS (2) or more of its asks.
        No AI names firms        -> "AI doesn't name businesses here" (its own group, never Winnable), with where AI points
                                    people instead (directories, and the registers it tells them to check).
        At least one naming AI whose top 3 firms take under CROWDED_AT (70%) of ITS mentions -> Winnable.
        Every naming AI crowded  -> Not winnable (Crowded), the top firms stored.
   Registers and regulators (Gas Safe Register, NICEIC, NAPIT, gov.uk, HSE…) are never a firm and never a directory gap.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** An AI names firms on a search when a right-trade firm is in at least this many of its asks (of 3). */
export const NAMES_IN_ASKS = 2;
/** An audit is "Audit incomplete" when more than this share of its answers could not be measured. */
export const AUDIT_INCOMPLETE_AT = 0.1;

/** Registers and regulators: where AI tells people to CHECK a trade, never a firm and never a listing site. */
const REGISTERS: { name: string; text: RegExp; host?: RegExp; whole: RegExp }[] = [
  { name: 'Gas Safe Register', text: /\bgas\s*safe\s*register(ed)?\b/i, host: /(^|\.)gassaferegister\.co\.uk$/, whole: /^(the\s+)?gas\s*safe(\s+register)?$/i },
  { name: 'NICEIC', text: /\bniceic\b/i, host: /(^|\.)niceic\.com$/, whole: /^(the\s+)?niceic(\s+register)?$/i },
  { name: 'NAPIT', text: /\bnapit\b/i, host: /(^|\.)napit\.org\.uk$/, whole: /^(the\s+)?napit(\s+register)?$/i },
  { name: 'gov.uk', text: /\bgov\.uk\b/i, host: /(^|\.)gov\.uk$/, whole: /^(www\.)?gov\.uk$/i },
  { name: 'HSE', text: /\bHSE\b|\bhealth and safety executive\b/i, host: /(^|\.)hse\.gov\.uk$/, whole: /^(hse|health and safety executive)$/i },
  { name: 'TrustMark', text: /\btrustmark\b/i, host: /(^|\.)trustmark\.org\.uk$/, whole: /^trustmark$/i },
  { name: 'ICAEW', text: /\bicaew\b/i, host: /(^|\.)icaew\.com$/, whole: /^icaew$/i },
  { name: 'ACCA', text: /\bACCA\b/, host: /(^|\.)accaglobal\.com$/, whole: /^acca$/i },
  { name: 'AAT', text: /\bAAT\b/, host: /(^|\.)aat\.org\.uk$/, whole: /^aat$/i },
];
/** Is this name a register or regulator (never a firm)? */
export function isRegisterName(name: string): boolean {
  const n = String(name ?? '').trim();
  return REGISTERS.some((r) => r.whole.test(n));
}
/** Is this host a register's or regulator's site? */
export function isRegisterHost(host: string): boolean {
  const h = String(host ?? '').toLowerCase().replace(/^www\./, '');
  return REGISTERS.some((r) => !!r.host && r.host.test(h));
}
/** The registers one answer names (in its text) or cites (by host). Each once. */
export function registersInAnswer(text: string, hosts: string[]): string[] {
  return REGISTERS.filter((r) => r.text.test(text) || hosts.some((h) => !!r.host && r.host.test(h.toLowerCase().replace(/^www\./, '')))).map((r) => r.name);
}

export interface EngineCrowding { answers: number; withFirms: number; distinct: number; mentions: number; top: FirmCount[]; topShare: number; names: boolean;
  /** Rules v4: firms in EVERY ask that named firms, and firms named in only one of those asks. */
  inEvery: FirmCount[]; once: number; locked: boolean }

/* RULES v4 — LOCKED SPOTS (Paul, 2026-11-16, "B′"). Over the asks in which an AI named firms (3 of 3, or 2 of 3): it is
   LOCKED when at least LOCKED_MIN_EVERY firms are in every one of those asks AND fewer than LOCKED_MAX_ONCE firms are named in
   only one of them. Winnable = at least one naming AI is not locked; Not winnable = every naming AI is locked. Chosen over
   the 70% line on the stored LDM / Moments answers: a share of mentions punished small rotating lists (4–6 firms) and the
   80% line opened lists where the same 4 firms came back every time. */
export const LOCKED_MIN_EVERY = 2;
export const LOCKED_MAX_ONCE = 2;

export function decideVerdictV3(s: SearchFacts, opts: { lockedSpots?: boolean } = {}): AuditVerdict {
  const v4 = opts.lockedSpots === true;
  const total = s.answers.length;
  const ok = s.answers.filter((a) => !a.failed);
  const failed = total - ok.length;
  const eng = (e: 'chatgpt' | 'gemini'): EngineCount => {
    const xs = ok.filter((a) => a.engine === e);
    const top = countFirms(xs.filter((a) => !a.wrongPlace), s.key, (a) => a.firms)[0] ?? null;
    return { answers: xs.length, named: xs.filter((a) => a.you === 'named').length, near: xs.filter((a) => a.you === 'near').length, top };
  };
  const perEngine = { chatgpt: eng('chatgpt'), gemini: eng('gemini') };
  const namedYou = ok.filter((a) => a.you === 'named').length;
  const nearNames = [...new Set(ok.flatMap((a) => a.near))];
  const registers = countFirms(ok, (x) => x.toLowerCase(), (a) => a.registers ?? []).map((d) => d.name);
  const directories = countFirms(ok, (x) => x.toLowerCase(), (a) => a.dirs.filter((d) => !isRegisterName(d))).map((d) => d.name);
  const base = { rules: (v4 ? 4 : 3) as 3 | 4, namedYou, answers: ok.length, nearNames, perEngine, crowding: null as Crowding | null, lockedBy: [] as FirmCount[], toBeat: [] as FirmCount[], directories: [] as string[], emptyWhy: null, unmeasured: failed, registers };
  const out = (verdict: AuditVerdict['verdict'], rule: VerdictRule, label: string, reason: string, extra: Partial<AuditVerdict> = {}): AuditVerdict =>
    ({ ...base, verdict, rule, label, reason, ...extra });
  const nearNote = nearNames.length ? ` Near-name flagged, not counted: ${list(nearNames)}.` : '';

  // 0. Couldn't measure: a failed answer, or one whose firms were never read.
  if (total === 0 || failed > 0 || perEngine.chatgpt.answers === 0 || perEngine.gemini.answers === 0) {
    return out(null, 'unmeasured', "Couldn't measure", total === 0 ? 'No answers stored yet.' : `${failed || 'Some'} of ${total} answers failed or were not read; re-run, never a verdict.`);
  }
  const odd = unnaturalReason(s.question);
  if (odd) return out(null, 'unnatural', 'Unnatural question: not scored', `Flagged: ${odd}.${nearNote}`);

  // Each AI's own evidence: right-trade firms (never a register) in answers about the right place.
  const local = ok.filter((a) => !a.wrongPlace);
  const rightOf = (a: AnswerFacts) => a.firms.filter((f) => !otherTrade(f, s.head) && !isRegisterName(f));
  const crowdOf = (xs: AnswerFacts[], answers: number): EngineCrowding => {
    const right = countFirms(xs, s.key, rightOf);
    const mentions = right.reduce((n, f) => n + f.count, 0);
    const top = right.slice(0, CROWD_TOP);
    const withFirms = xs.filter((a) => rightOf(a).length > 0).length;
    /* Locked spots: over the asks that named firms, counted with the match key (one firm, one count per ask). */
    const inEvery = withFirms ? right.filter((f) => f.count === withFirms) : [];
    const once = withFirms ? right.filter((f) => f.count === 1).length : 0;
    const names = withFirms >= NAMES_IN_ASKS;
    return { answers, withFirms, distinct: right.length, mentions, top, topShare: mentions ? top.reduce((n, f) => n + f.count, 0) / mentions : 0, names,
      inEvery, once, locked: names && inEvery.length >= LOCKED_MIN_EVERY && once < LOCKED_MAX_ONCE };
  };
  const by = {
    chatgpt: crowdOf(local.filter((a) => a.engine === 'chatgpt'), perEngine.chatgpt.answers),
    gemini: crowdOf(local.filter((a) => a.engine === 'gemini'), perEngine.gemini.answers),
  };
  const all = countFirms(local, s.key, rightOf);
  const allMentions = all.reduce((n, f) => n + f.count, 0);
  base.crowding = {
    answersWithFirms: local.filter((a) => rightOf(a).length > 0).length, distinct: all.length, mentions: allMentions,
    top: all.slice(0, CROWD_TOP), topShare: allMentions ? all.slice(0, CROWD_TOP).reduce((n, f) => n + f.count, 0) / allMentions : 0,
  };
  const evidence = `ChatGPT named firms in ${by.chatgpt.withFirms} of ${by.chatgpt.answers} answers, Gemini in ${by.gemini.withFirms} of ${by.gemini.answers}.`;

  // 1. Already named anywhere -> beats every rule below.
  if (namedYou > 0) {
    return out('winnable', 'visible', `Already named: ${namedYou} of ${ok.length}`,
      `Named in ${namedYou} of ${ok.length} answers (ChatGPT ${perEngine.chatgpt.named}/${perEngine.chatgpt.answers}, Gemini ${perEngine.gemini.named}/${perEngine.gemini.answers}).${nearNote}`, { directories });
  }
  if (s.leftOut) return out(null, 'left_out', s.leftOut === 'not_offered' ? 'Not their service' : 'Not on their site yet',
    s.leftOut === 'not_offered' ? 'They told us they do not offer this.' : 'Not on their site yet: add a page if they offer it.');

  const naming = (['chatgpt', 'gemini'] as const).filter((e) => by[e].names);
  const label = (e: 'chatgpt' | 'gemini') => (e === 'chatgpt' ? 'ChatGPT' : 'Gemini');
  // 2a. Neither AI names firms in 2+ of its asks -> AI doesn't name businesses here (never Winnable).
  if (!naming.length) {
    const where = [directories.length ? `AI points people to ${list(directories, 5)}` : '', registers.length ? `tells them to check ${list(registers, 5)}` : ''].filter(Boolean).join('; ');
    return out('no_names', 'no_names', "AI doesn't name businesses here",
      `${evidence}${where ? ` ${where.charAt(0).toUpperCase()}${where.slice(1)}.` : ' No listing sites either.'}${nearNote}`, { directories });
  }
  const shareText = (e: 'chatgpt' | 'gemini') => v4
    ? `${label(e)}: ${by[e].withFirms} of ${by[e].answers} answers named ${by[e].distinct} firm${by[e].distinct === 1 ? '' : 's'}; ${by[e].inEvery.length} in every one${by[e].inEvery.length ? ` (${list(by[e].inEvery.map((f) => f.name), 4)})` : ''}, ${by[e].once} named only once`
    : `${label(e)}: ${by[e].withFirms} of ${by[e].answers} answers named ${by[e].distinct} firm${by[e].distinct === 1 ? '' : 's'}, top 3 take ${Math.round(by[e].topShare * 100)}%`;
  const open = naming.filter((e) => (v4 ? !by[e].locked : by[e].topShare < CROWDED_AT));
  // 2b. Every naming AI crowded (v3: top 3 at 70%+; v4: locked spots) -> Not winnable.
  if (!open.length) {
    const worst = v4
      ? [...naming].sort((a, b) => by[b].inEvery.length - by[a].inEvery.length || by[a].once - by[b].once)[0]
      : [...naming].sort((a, b) => by[b].topShare - by[a].topShare)[0];
    return out('not_winnable', 'crowded', v4 ? 'Locked spots' : 'Crowded', `${naming.map(shareText).join('; ')}.${nearNote}`, { lockedBy: v4 ? by[worst].inEvery : by[worst].top, directories });
  }
  // 2c. At least one naming AI with room -> Winnable; repeat firms stored as the ones to beat.
  const always = all.filter((f) => f.count * 6 >= ok.length * 5);
  const toBeat = [...always, ...all.filter((f) => f.count >= 2 && !always.some((x) => s.key(x.name) === s.key(f.name)))].slice(0, 5);
  const few = always.length > 0 || all.some((f) => f.count * 2 >= ok.length);
  return out('winnable', 'open', few ? 'A few repeat' : 'Names change',
    `${naming.map(shareText).join('; ')}.${toBeat.length ? ` Ones to beat: ${toBeat.map((f) => `${f.name} (${f.count})`).join(', ')}.` : ''}${nearNote}`, { toBeat, directories });
}

/** Rules v3 "Audit incomplete": more than AUDIT_INCOMPLETE_AT of the audit's answers could not be measured. Counts every
 *  search that has a verdict (left-out and odd searches included: their answers were still asked). */
export function auditCompleteness(vs: (Pick<AuditVerdict, 'answers' | 'unmeasured'> | null | undefined)[]): { answers: number; unmeasured: number; incomplete: boolean } {
  let answers = 0, unmeasured = 0;
  for (const v of vs) { if (!v) continue; answers += v.answers + (v.unmeasured ?? 0); unmeasured += v.unmeasured ?? 0; }
  return { answers, unmeasured, incomplete: answers === 0 || unmeasured > answers * AUDIT_INCOMPLETE_AT };
}

/** The client's one plain line beside a winnable search (no counts, no competitors). */
export function clientLineOf(v: AuditVerdict): string {
  switch (v.rule) {
    case 'no_names': return "AI doesn't name businesses here yet.";
    case 'visible': return 'AI already names you here.';
    case 'open': return v.label === 'A few repeat' ? 'A few firms repeat, the rest change.' : 'AI names different firms each time.';
    case 'no_leader': return "AI doesn't name a clear leader here yet.";
    case 'directory_gap': return 'AI points people to listing sites, not to firms.';
    case 'category_gap': return 'AI names other kinds of business here.';
    case 'local_gap': return 'AI mixes this place up with another one.';
    default: return '';
  }
}
