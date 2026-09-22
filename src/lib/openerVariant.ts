/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INITIAL-OPENER A/B — two cold openers, one deterministic split, and nothing else.

   This is ONE two-variant test, not an experimentation framework. The whole thing is: which of two
   approved Meta templates a newly-queued lead gets, decided from the lead's own id.

   ⛔ THE ASSIGNMENT IS DERIVED FROM THE LEAD ID, NOT DRAWN AT RANDOM. That is what makes it stable
   with no new column and no new table: the same lead id always hashes to the same arm, so cancelling
   and re-queueing, a retry after a temporary failure, or an operator re-running the bulk queue all
   land on the arm the lead already had. A `Math.random()` split would have needed somewhere to
   remember the draw, and a lead that got re-queued would silently change arms — which corrupts the
   very comparison the test exists to make.

   ⛔ NOTHING NEW IS STORED. The arm a lead was assigned is already persisted three times over:
   `outreach_leads.whatsapp_template` (the assignment), `whatsapp_messages.template_name` and
   `whatsapp_sends.template` (what actually went out). The comparison is therefore the one
   src/lib/armComparison.ts already does, keyed on template name — no migration, no new field, and
   no unrelated column repurposed.

   ⛔ V2 IS OFF UNTIL META APPROVES IT. `INITIAL_OPENER_V2_APPROVED` is the single switch. While it
   is false every lead gets the existing, approved opener and v2 is not offered in the send picker —
   so a pending template cannot reach Meta and cannot fail a send. The registries below it are
   already complete, so approval is a one-line change to that constant and nothing else.
   (Same shape as REMEASURE_RESULTS_COPY_APPROVED, which gates the four-week results sender.)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The existing, long-approved cold opener. Unchanged, and the fallback for everything. */
export const INITIAL_OPENER_A = 'initial_contact';

/** The variant under test. Registered at Meta as `initial_opener_v2` — names match Meta exactly. */
export const INITIAL_OPENER_B = 'initial_opener_v2';

/**
 * 🟢 APPROVED AT META 2026-09-22 (Paul confirmed from WhatsApp Manager). The A/B is LIVE: newly
 * queued leads are split ~50/50 between the two openers from this moment.
 *
 * While this was false:
 *   · every queued lead got INITIAL_OPENER_A, so the split was inert and no send could fail;
 *   · the picker label carried a PENDING warning so it could not be hand-picked unwarned.
 * Both behaviours are driven by this one constant, so flipping it turned the test on and cleared
 * the warning together.
 *
 * ⚠️ IT IS NOT INFERRED FROM ANYTHING, AND MUST NOT BECOME SO. Meta's approval state is not mirrored
 * into this database and a send is the only thing that discovers it, so the honest answer is a
 * switch a human sets after looking — never a guess, and never "try it and see", which costs a real
 * message to a real prospect and burns the first impression this test exists to measure.
 * ⚠️ TO STOP THE TEST, set this back to false: every lead returns to the incumbent opener
 * immediately, no rows change, and the leads already sent v2 keep their record of it.
 */
export const INITIAL_OPENER_V2_APPROVED = true;

/** Both arms, display order: the incumbent first. */
export const INITIAL_OPENERS = [INITIAL_OPENER_A, INITIAL_OPENER_B] as const;
export type InitialOpener = (typeof INITIAL_OPENERS)[number];

const OPENER_SET: ReadonlySet<string> = new Set(INITIAL_OPENERS);

/** True when this template is one of the two initial openers under test. */
export function isInitialOpener(name: string | null | undefined): boolean {
  return OPENER_SET.has(String(name ?? '').trim());
}

/* FNV-1a, 32-bit. Chosen because it is a handful of lines, has no dependencies and is byte-stable
   across engines — the split must give the same answer in the browser today and in a test tomorrow,
   or the "same lead keeps its arm" property is not a property at all. `>>> 0` after each step keeps
   it in unsigned 32-bit space; `Math.imul` does the multiply without losing the high bits. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which arm this lead belongs to — the pure split, independent of whether v2 is approved yet.
 *
 * ⚠️ Exported mainly so the test can drive the distribution directly. Callers deciding what to SEND
 * want `openerTemplateFor`, which also honours the approval switch.
 *
 * A blank id cannot be hashed into a meaningful arm, so it takes the incumbent — the direction that
 * cannot send an unapproved template to somebody.
 */
export function openerArmFor(leadId: string | null | undefined): InitialOpener {
  const id = String(leadId ?? '').trim();
  if (!id) return INITIAL_OPENER_A;
  return (fnv1a32(id) & 1) === 0 ? INITIAL_OPENER_A : INITIAL_OPENER_B;
}

/**
 * The template to actually queue for a lead, given what the operator picked.
 *
 * ⛔ IT ONLY EVER TOUCHES THE INITIAL OPENER. Any other template the operator chose — a follow-up, a
 * hook, a re-engage — is returned exactly as given. The A/B must not be able to reach a template
 * that is not in it, which is the failure mode that would put a cold opener into a live thread.
 * ⛔ AND IT ONLY SUBSTITUTES WHEN V2 IS APPROVED. Otherwise the incumbent is returned, so a pending
 * template can never be queued.
 */
export function openerTemplateFor(
  chosenTemplate: string | null | undefined,
  leadId: string | null | undefined,
): string {
  const chosen = String(chosenTemplate ?? '').trim();
  /* Only the incumbent opener is split. If the operator deliberately picked v2 itself, that is their
     choice and it stands (the picker only offers it once approved). */
  if (chosen !== INITIAL_OPENER_A) return chosen;
  if (!INITIAL_OPENER_V2_APPROVED) return INITIAL_OPENER_A;
  return openerArmFor(leadId);
}
