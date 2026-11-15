/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT VERDICT RULES v2 (Paul, 2026-11-15). The full rule, in words: docs/AUDIT_RULES.md.

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

export const AUDIT_RULES_VERSION = 2 as const;

/* WHICH RULES A REPORT USES. An audit made before v2 shipped keeps the old rule, so a link already sent keeps the page it
   showed; an audit made after, or a re-scored copy (a run carrying results.report_rules = 2), uses v2. */
export const AUDIT_RULES_V2_FROM = '2026-11-15T06:00:00Z';
/** THE GUARANTEE'S NAME RULER (Paul, 2026-11-15): a baseline created on rules v2 counts "named" by the strict match, on
 *  both sides of its day-28 comparison and in its frozen day-0 snapshot. Name + website only (the same identity everywhere,
 *  so the two sides can never differ). Older and paid baselines: undefined = the ruler they were sold on. */
export function guaranteeIdentityFor(baselineCreatedAt: string | null | undefined, name: string | null | undefined, website: string | null | undefined): { name: string; domains: string[] } | undefined {
  const n = String(name ?? '').trim();
  if (!n || auditRulesFor({ createdAt: baselineCreatedAt }) !== 2) return undefined;
  const w = String(website ?? '').trim();
  return { name: n, domains: w ? [w] : [] };
}
export function auditRulesFor(o: { createdAt: string | null | undefined; runRules?: unknown[] }): 1 | 2 {
  if ((o.runRules ?? []).some((r) => Number(r) === 2)) return 2;
  const t = o.createdAt ? Date.parse(o.createdAt) : NaN;
  return Number.isFinite(t) && t >= Date.parse(AUDIT_RULES_V2_FROM) ? 2 : 1;
}

/** RULE 2's line: the top 3 firms' share of every firm mention at which a search is crowded (Not winnable). Chosen from
 *  the stored Moments (ukuarx) and LDM (f7n6d2) answers; the table is in docs/AUDIT_RULES.md. */
export const CROWDED_AT = 0.7;
/** How many firms count as "the top". */
export const CROWD_TOP = 3;

/** 'closed' is the retired rule 2 (kept so an old verdicts_v2 snapshot still reads); new verdicts say 'crowded'. */
export type VerdictRule =
  | 'rerun' | 'unnatural' | 'left_out'
  | 'visible' | 'crowded' | 'closed' | 'open' | 'no_leader' | 'directory_gap' | 'category_gap' | 'local_gap';
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
  rules: typeof AUDIT_RULES_VERSION;
  /** What the client sees. null = not shown (re-run, unnatural, left out). */
  verdict: 'winnable' | 'not_winnable' | null;
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
  const base = { rules: AUDIT_RULES_VERSION, namedYou, answers: ok.length, nearNames, perEngine, crowding: null as Crowding | null, lockedBy: [], toBeat: [], directories: [], emptyWhy: null };
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

/** The client's one plain line beside a winnable search (no counts, no competitors). */
export function clientLineOf(v: AuditVerdict): string {
  switch (v.rule) {
    case 'visible': return 'AI already names you here.';
    case 'open': return v.label === 'A few repeat' ? 'A few firms repeat, the rest change.' : 'AI names different firms each time.';
    case 'no_leader': return "AI doesn't name a clear leader here yet.";
    case 'directory_gap': return 'AI points people to listing sites, not to firms.';
    case 'category_gap': return 'AI names other kinds of business here.';
    case 'local_gap': return 'AI mixes this place up with another one.';
    default: return '';
  }
}
