/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "HERE'S WHAT WE HAVE SO FAR" — what a client confirms on their own sign-up page before they see the plan
   (final pass, 2026-10-07; docs/pre-sales-certification/sales-to-payment-final-pass.md).

   The salesperson already asked these on the call (Quick Close). The client is shown the answers back, in
   their own words, and presses "Looks right" or corrects one. It is a confirmation, not a second
   questionnaire: four facts at most, only the ones that apply.
   ⛔ THE WORDS AND THE RULES LIVE HERE, ONCE. fn findable-onboarding builds the items and findable.live only
   draws them — the site never decides which question applies, so the two repos cannot drift.
   ⛔ NOTHING HERE TOUCHES THE PLAN, THE PRICE OR THE SELLER. The four keys are the situation facts
   (quickClose.CLIENT_CONFIRMABLE_KEYS); a correction is recorded beside the salesperson's answers and judged by
   the same gate (quickClose.effectiveAnswers), never applied over them.
   ⚠️ Reached from an edge function: explicit .ts on every relative import.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { THIRD_PARTY_MANAGERS, effectiveAnswers, thirdPartyManaged, type ClientConfirmKey, type QuickCloseAnswers, type QuickCloseRecord } from './quickClose.ts';

export interface ConfirmOption { value: string; label: string }
/** When an item applies, judged on another item's CURRENT value — so the page can re-judge as the client changes
 *  an answer ("an agency" → the contract question appears) without holding a copy of the rule. */
export interface ConfirmShowIf { key: ClientConfirmKey; in?: string[]; notIn?: string[] }
export interface ConfirmItem {
  key: ClientConfirmKey;
  showIf?: ConfirmShowIf;
  /** The row's label in the summary ("Who looks after your website"). */
  label: string;
  /** The question, as asked if they press Change. */
  question: string;
  /** The saved answer (null = not answered yet) and how it reads back. */
  value: string | null;
  answer: string;
  /** What they may pick when correcting it. Legacy stored answers are never offered. */
  options: ConfirmOption[];
}

const MANAGER_OPTIONS: ConfirmOption[] = [
  { value: 'owner', label: 'We manage it ourselves' },
  { value: 'freelancer', label: 'A freelancer / individual developer' },
  { value: 'agency', label: 'An agency' },
  { value: 'no_website', label: "We don't have a website" },
  { value: 'not_sure', label: 'Not sure' },
];
const CONTRACT_OPTIONS: ConfirmOption[] = [
  { value: 'in_contract', label: 'Yes' },
  { value: 'free', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];
const DOMAIN_OPTIONS: ConfirmOption[] = [
  { value: 'yes', label: 'We do' },
  { value: 'agency', label: 'Our agency / developer' },
  { value: 'not_sure', label: 'Not sure' },
  { value: 'no_domain', label: "We don't have one yet" },
];
const RIGHTS_OPTIONS: ConfirmOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];
/** Stored answers that are still valid but no longer offered — they still read back. */
const LEGACY_ANSWER: Record<string, string> = {
  employee: 'Someone in our business',
  third_party: 'Another company',
  no: 'Not us',
};

const SPEC: Record<ClientConfirmKey, { label: string; question: string; options: ConfirmOption[] }> = {
  manager: { label: 'Who looks after your website', question: 'Who currently looks after your website?', options: MANAGER_OPTIONS },
  agency_contract: { label: 'Contract with them', question: 'Are you still tied into a contract with them?', options: CONTRACT_OPTIONS },
  domain: { label: 'Who controls your web address', question: 'Who has control of your web address (domain)?', options: DOMAIN_OPTIONS },
  rights: { label: 'Reuse of your current site', question: 'Do you own, or have permission to reuse, the design and content from your current website?', options: RIGHTS_OPTIONS },
};

const SHOW_IF: Partial<Record<ClientConfirmKey, ConfirmShowIf>> = {
  agency_contract: { key: 'manager', in: [...THIRD_PARTY_MANAGERS] },
  rights: { key: 'manager', notIn: ['no_website'] },
};
/** Does this item apply, given the current values of the four? (The page runs the same check on `showIf`.) */
export function confirmItemApplies(item: Pick<ConfirmItem, 'showIf'>, values: Partial<Record<ClientConfirmKey, string | null>>): boolean {
  const s = item.showIf;
  if (!s) return true;
  const v = values[s.key] ?? null;
  if (s.in) return v !== null && s.in.includes(v);
  if (s.notIn) return v === null || !s.notIn.includes(v);
  return true;
}

/** Which of the four apply to these answers. ⛔ The contract only when an agency / freelancer is involved; the
 *  reuse question only when there is a current site — a client with no website is never asked about one. */
export function confirmKeysFor(a: QuickCloseAnswers): ClientConfirmKey[] {
  const keys: ClientConfirmKey[] = ['manager'];
  if (thirdPartyManaged(a)) keys.push('agency_contract');
  keys.push('domain');
  if (a.manager !== 'no_website') keys.push('rights');
  return keys;
}

/** ALL FOUR items, each with its own `showIf`; the page draws the ones that apply to the current values. */
export function confirmItemsFor(qc: QuickCloseRecord | null | undefined): ConfirmItem[] {
  const a = effectiveAnswers(qc);
  return (['manager', 'agency_contract', 'domain', 'rights'] as ClientConfirmKey[]).map((key) => {
    const spec = SPEC[key];
    const value = (a[key] as string | null | undefined) ?? null;
    const answer = value === null ? 'Not answered yet' : spec.options.find((o) => o.value === value)?.label ?? LEGACY_ANSWER[value] ?? 'Not sure';
    return { key, label: spec.label, question: spec.question, value, answer, options: spec.options, ...(SHOW_IF[key] ? { showIf: SHOW_IF[key] } : {}) };
  });
}
