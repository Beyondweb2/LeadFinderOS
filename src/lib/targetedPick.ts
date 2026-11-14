/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE 20 TARGETED SEARCHES, PICKED FROM A DISCOVERY'S OWN ANSWERS (Paul, 2026-11-14; V2's baseline pick,
   leadfinderos-v2 app.ai_audit_propose_baseline, ported as behaviour).

     1. every hook search (the lead's AI check searches that the Discovery also asked), in their order;
     2. 3 or 4 HARDER main searches: not winnable because one or two firms own the answer (Little room),
        with firms named, most firms first (4 when there are 2 hooks or fewer, else 3);
     3. the WINNABLE searches with the most room (Lots, then Some, then already-named-but-open), most
        firms first, to fill up to 20;
     4. only if still short: whatever is left, a search where AI names no firms LAST.
   Final order: hooks, winnable, harder, fill. Every question comes from the Discovery: nothing is asked again.
   Pure; no I/O.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const TARGETED_SEARCH_COUNT = 20;

export type PickSource = 'hook' | 'winnable' | 'harder' | 'fill' | 'nofirms';
export const PICK_SOURCE_LABEL: Record<PickSource, string> = {
  hook: 'From the AI check',
  winnable: 'Winnable, most room',
  harder: 'Main search, harder',
  fill: 'Added to reach 20',
  nofirms: 'AI names no firms (last resort)',
};

export interface PickInput {
  question: string;
  /** reportDesign.winnableOf: winnable / not_winnable, null = left out (not their service, another place). */
  verdict: 'winnable' | 'not_winnable' | null;
  /** The room tier (reportOpportunity): lots / some / little / nofirms / named / … */
  tier: string;
  /** Distinct firms AI named across the answers (directories never count). */
  firms: number;
}
export interface Picked { question: string; source: PickSource }

const norm = (q: string) => q.trim().replace(/\s+/g, ' ').toLowerCase();

export function pickTargetedSearches(pool: PickInput[], hook: string[], target = TARGETED_SEARCH_COUNT): Picked[] {
  const seen = new Set<string>();
  const out: Picked[] = [];
  const take = (q: PickInput, source: PickSource) => { const k = norm(q.question); if (seen.has(k) || out.length >= target) return; seen.add(k); out.push({ question: q.question.trim(), source }); };
  const byQ = new Map(pool.map((p) => [norm(p.question), p] as const));

  // 1. hooks, in their own order, only those the Discovery asked
  for (const h of hook) { const p = byQ.get(norm(h)); if (p) take(p, 'hook'); }
  const hooks = out.length;
  const rest = pool.filter((p) => !seen.has(norm(p.question)));
  const byFirms = (a: PickInput, b: PickInput) => b.firms - a.firms || a.question.localeCompare(b.question);

  // 2. harder main searches (reserved now, placed after the winnable ones)
  const hardN = Math.max(0, Math.min(4, Math.max(3, 6 - hooks), target - hooks));
  const harder = rest.filter((p) => p.verdict === 'not_winnable' && p.tier === 'little' && p.firms > 0).sort(byFirms).slice(0, hardN);
  const hardSet = new Set(harder.map((p) => norm(p.question)));

  // 3. winnable, most room first
  const roomRank = (p: PickInput) => (p.tier === 'lots' ? 0 : p.tier === 'some' ? 1 : 2);
  const winnable = rest.filter((p) => p.verdict === 'winnable' && !hardSet.has(norm(p.question)))
    .sort((a, b) => roomRank(a) - roomRank(b) || byFirms(a, b));
  for (const p of winnable.slice(0, Math.max(0, target - hooks - harder.length))) take(p, 'winnable');
  for (const p of harder) take(p, 'harder');

  // 4. fill if short: other winnable, other little room, anything else, no-firms last
  const fillRank = (p: PickInput) => (p.verdict === 'winnable' ? 0 : p.tier === 'little' ? 1 : p.tier === 'nofirms' ? 3 : 2);
  const left = pool.filter((p) => !seen.has(norm(p.question)) && p.verdict !== null).sort((a, b) => fillRank(a) - fillRank(b) || byFirms(a, b));
  for (const p of left) take(p, p.tier === 'nofirms' ? 'nofirms' : 'fill');
  return out;
}
