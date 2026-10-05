/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE "NEW FINDABLE CLIENT" EMAIL'S SETUP LINES (2026-10-02, docs/paid-client-automation.md).

   Pure: the webhook loads the facts (_shared/client-setup.ts + the crawl + the agency check) and this
   turns them into the lines Paul reads. Every line comes from a stored fact or a derived rule — nothing
   is guessed, and a fact we do not have is left out rather than written as "unknown".
   ⛔ MACHINE GUESSES SAY SO: services found by the crawl and the agency check are labelled as found,
   never as confirmed (CLAUDE.md §6 — the crawl never merges into what we measure).
   ⚠️ Edge-reachable (stripe-webhook): relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { HandoffReadiness, HandoffWho } from './handoffReadiness.ts';
import type { StageResult } from './deliveryStage.ts';
import type { HandoffApplies } from './salesHandoff.ts';
import { firstContactDueLabel } from './firstContact.ts';

export interface NewClientFacts {
  packageName: string | null;
  salesperson: string | null;
  amountGbp: number;
  website: string | null;
  /** "No agency evidence · 78% (automatic check)" / "Sales: an agency controls it" / null. */
  siteManagement: string | null;
  services: { list: string[]; source: 'client' | 'sales' | 'crawl' } | null;
  handoff: { applies: HandoffApplies; complete: boolean };
  readiness: HandoffReadiness;
  stage: StageResult;
  clientLink: string;
  setupLink: string | null;
}

const WHO_WORDS: Record<HandoffWho, string> = { sales: 'sales', client: 'client', findable: 'Findable' };
const SOURCE_WORDS = { client: 'from the client', sales: 'from Sales', crawl: 'found on their website — not yet confirmed' } as const;

export function newClientSetupLines(f: NewClientFacts): string[] {
  const out: string[] = [];
  if (f.packageName) out.push(`Package: ${f.packageName}`);
  if (f.salesperson) out.push(`Salesperson: ${f.salesperson}`);
  out.push(`Payment: £${f.amountGbp.toFixed(2)} received`);
  out.push(`Website: ${f.website ? f.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : 'none on file'}`);
  if (f.siteManagement) out.push(`Site management: ${f.siteManagement}`);
  if (f.services && f.services.list.length) {
    out.push(`Services (${SOURCE_WORDS[f.services.source]}):`);
    for (const s of f.services.list.slice(0, 8)) out.push(`  - ${s}`);
    if (f.services.list.length > 8) out.push(`  + ${f.services.list.length - 8} more`);
  }
  out.push('');
  out.push(`Sales handoff: ${f.handoff.applies !== 'required' ? 'not needed' : f.handoff.complete ? 'complete' : 'NOT COMPLETE — the salesperson still owes it'}`);
  out.push(`Setup: ${f.readiness.done}/${f.readiness.total} complete — ${f.stage.stateLabel}`);
  const waiting = f.readiness.items.filter((i) => i.required && !i.ok);
  if (waiting.length) {
    out.push('Waiting for:');
    for (const i of waiting) out.push(`  - ${i.label} (${WHO_WORDS[i.who]})`);
  }
  out.push('');
  /* ⛔ FIRST CONTACT IS PAUL'S (pre-sales fix 03, firstContact.ts): the client was told "within two working
     days" and the salesperson that their part is done — so the email says, first, whose move it is. */
  const contact = f.stage.firstContact;
  if (contact && (contact.state === 'owed' || contact.state === 'overdue')) {
    out.push(`FIRST CONTACT IS YOURS: introduce yourself and send the setup link by ${firstContactDueLabel(contact.due)}. Record it on the client page when done.`);
  }
  out.push(`Next step: ${f.stage.next.label}`);
  out.push(`Open the client: ${f.clientLink}`);
  if (f.setupLink && (f.stage.next.key === 'contact_client' || waiting.some((i) => i.who === 'client'))) out.push(`Client's setup link (send it if they still owe details): ${f.setupLink}`);
  return out;
}

/** The subject: one per new client, never per payment. */
export const newClientSubject = (businessName: string, amountGbp: number) =>
  `New Findable client: ${businessName.trim() || 'A client'} (paid £${amountGbp.toFixed(2)})`;
