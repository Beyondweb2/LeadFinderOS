/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INITIAL OPENER — ONE SELECTED TEMPLATE, NO SPLIT (Paul, 2026-09-23).

   Two approved cold openers exist. Paul chooses which one new cold outreach uses; nothing else does.

   🔴 WHAT THIS REPLACED. From 2026-09-22 this file split newly-queued leads ~50/50 between the two
   openers by a hash of the lead id (`openerTemplateFor`, applied in the Outreach queue dialog): an
   operator who picked "Initial contact" got initial_opener_v2 on about half the batch. Paul did not
   want that. The split, its hash and the substitution are GONE — there is no coin flip, no
   alternation, no hidden arm and no fallback to the other opener anywhere.

   ⛔ THE ONE SETTING: `whatsapp_outreach_state.initial_opener_template` (the singleton outreach
   settings row, beside first_reply_template), read and written only through process-whatsapp-queue
   (modes 'status' / 'set_initial_opener_template'). Default and current value: INITIAL_OPENER_A.
   ⛔ AN OPENER THAT IS NOT THE SELECTED ONE IS NOT SENDABLE — in every picker (getTemplateSendability
   calls openerSendability) and at the Inbox send (send-whatsapp-message refuses it). If the selected
   opener cannot be read, NO opener is sendable: failing closed, never falling back to the other.
   ⛔ AN ASSIGNMENT IS FROZEN AT QUEUE TIME. The queue sends `outreach_leads.whatsapp_template` exactly
   as stored and never substitutes (process-whatsapp-queue refuses an unknown template rather than
   swap it), so a retry, a delayed send, a reopened lead or a later change of the setting cannot
   switch what an already-queued lead receives. Changing the setting changes FUTURE queueing only.

   Edge-safe leaf (imported by process-whatsapp-queue and send-whatsapp-message): no imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The ORIGINAL cold opener — long-approved, the one Paul has selected. */
export const INITIAL_OPENER_A = 'initial_contact';

/** The NEWER opener (registered at Meta 2026-09-22 as `initial_opener_v2`). Kept, sendable only when
 *  Paul selects it. */
export const INITIAL_OPENER_B = 'initial_opener_v2';

/**
 * 🟢 APPROVED AT META 2026-09-22 (Paul confirmed from WhatsApp Manager). This is Meta's approval
 * state only — it decides whether v2 MAY be selected, never whether it is sent.
 * ⚠️ Not inferred from anything: Meta's state is not mirrored here, so a human sets this after looking.
 */
export const INITIAL_OPENER_V2_APPROVED = true;

/** Both openers, display order: the original first. */
export const INITIAL_OPENERS = [INITIAL_OPENER_A, INITIAL_OPENER_B] as const;
export type InitialOpener = (typeof INITIAL_OPENERS)[number];

/** What new cold outreach uses when nothing has been stored — the original. */
export const DEFAULT_INITIAL_OPENER: InitialOpener = INITIAL_OPENER_A;

/** Short names for the one control that chooses between them. */
export const INITIAL_OPENER_LABELS: Record<InitialOpener, string> = {
  initial_contact: 'Original opener (initial_contact)',
  initial_opener_v2: 'Newer opener v2 (initial_opener_v2)',
};

const OPENER_SET: ReadonlySet<string> = new Set(INITIAL_OPENERS);

/** True when this template is one of the initial cold openers. */
export function isInitialOpener(name: string | null | undefined): boolean {
  return OPENER_SET.has(String(name ?? '').trim());
}

/** May this opener be SELECTED? Only an opener Meta has approved. */
export function openerSelectable(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (n === INITIAL_OPENER_A) return true;
  if (n === INITIAL_OPENER_B) return INITIAL_OPENER_V2_APPROVED;
  return false;
}

/**
 * The stored setting, read. A stored value that is not a selectable opener (a typo, a template since
 * withdrawn) is NOT replaced by the other opener: it comes back as `ok:false` with the reason, and
 * nothing is sendable until Paul picks again. `null`/`undefined` (never stored) is the default.
 */
export interface SelectedOpener { ok: boolean; template: InitialOpener | null; reason?: string }
export function resolveSelectedOpener(stored: string | null | undefined): SelectedOpener {
  if (stored === null || stored === undefined || String(stored).trim() === '') return { ok: true, template: DEFAULT_INITIAL_OPENER };
  const s = String(stored).trim();
  if (isInitialOpener(s) && openerSelectable(s)) return { ok: true, template: s as InitialOpener };
  return { ok: false, template: null, reason: `The selected initial template "${s}" is not available. Choose the initial outreach template again — nothing is sent in its place.` };
}

/**
 * Is this template sendable as far as the opener rule goes? Every non-opener passes untouched (the
 * rule must not reach a follow-up). An opener passes ONLY if it is the selected one.
 * `selected` undefined = the setting has not been read (loading, a failed read, a non-admin):
 * every opener is refused — fail closed.
 */
export function openerSendability(template: string, selected: string | null | undefined): { ok: boolean; reason?: string } {
  if (!isInitialOpener(template)) return { ok: true };
  if (selected === undefined) return { ok: false, reason: 'Could not read the selected initial outreach template — nothing is sent until it loads.' };
  const r = resolveSelectedOpener(selected);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (template !== r.template) return { ok: false, reason: `Not the selected initial template (selected: ${r.template}).` };
  return { ok: true };
}
