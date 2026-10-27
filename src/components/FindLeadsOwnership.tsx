import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlreadyAddedBadge, OwnerAvatar } from '@/components/OwnerBadge';
import type { IdentityState } from '@/lib/salesCrm';

/* FIND LEADS OWNERSHIP (multi-user, 2026-09-27) — what a search result's action cell shows once the
 * server has said whether the business is already in LeadFinderOS (lead_identity_lookup).
 *
 * ⛔ The state is the SERVER'S, across every user's leads — never this browser's list. A salesperson
 * gets NO Add and NO Claim on anything owned or ever contacted: they see "Already added · <name>"
 * and nothing else about it. Claim is offered only for 'claimable' (unassigned, never contacted). */

export interface OwnershipInfo {
  state: IdentityState;
  leadId: string | null;
  ownerName: string | null;
  avatarUrl: string | null;
  addedAt: string | null;
  /** Who ADDED it (outreach_leads.added_by_user_id), which can differ from who works it now. Null = not recorded. */
  addedByName?: string | null;
}

/** Sales: the cell for a non-new business, or null to let the normal Add button render. */
export function salesOwnershipCell(own: OwnershipInfo | null | undefined, onClaim?: (leadId: string) => void, claiming?: boolean): ReactNode | null {
  if (!own || own.state === 'new') return null;
  if (own.state === 'paused') {
    return (
      <span className="inline-flex items-center h-8 px-2.5 rounded-md bg-muted text-muted-foreground text-xs whitespace-nowrap" title="Usage temporarily paused — contact Paul">
        Paused
      </span>
    );
  }
  if (own.state === 'yours' && own.leadId) {
    return (
      <Link to={`/sales/lead/${own.leadId}`} title="Already in your pipeline — open it" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium whitespace-nowrap">
        <Check className="h-3.5 w-3.5" /> Yours
      </Link>
    );
  }
  if (own.state === 'claimable' && own.leadId && onClaim) {
    return (
      <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled={claiming} onClick={() => onClaim(own.leadId!)} title="Already in LeadFinderOS, unassigned and never contacted — claim it to add it to your pipeline">
        Claim lead
      </Button>
    );
  }
  return <AlreadyAddedBadge ownerName={own.ownerName} addedByName={own.addedByName} avatarUrl={own.avatarUrl} addedAt={own.addedAt} />;
}

/** The server says this business is already in LeadFinderOS (any owner). 'paused' is a refusal, not an answer. */
export function isAlreadyAdded(own: OwnershipInfo | null | undefined): boolean {
  return !!own && own.state !== 'new' && own.state !== 'paused';
}

/** "Added by Paul" — the ONE wording for every already-added marker (Paul, 2026-10-19). Since 2026-10-27 it names who ADDED
 *  the lead; who works it now follows when that is someone else. Neither recorded → "Already in the CRM". */
export function addedByText(addedByName: string | null | undefined, ownerName?: string | null): string {
  if (addedByName) return ownerName && ownerName !== addedByName ? `Added by ${addedByName} · worked by ${ownerName}` : `Added by ${addedByName}`;
  return ownerName ? `Already in the CRM · worked by ${ownerName}` : 'Already in the CRM';
}

/** Admin: the owner's avatar beside the existing In-CRM / Remove control, tooltip "Added by <name>". Not clickable.
 *  No owner on record → nothing here (the In CRM control beside it already says so). */
export function adminOwnerMarker(own: OwnershipInfo | null | undefined): ReactNode | null {
  if (!isAlreadyAdded(own) || !own?.ownerName) return null;
  return (
    <span className="ml-1.5 inline-flex cursor-default items-center" title={addedByText(own.addedByName, own.ownerName)}
      aria-label={addedByText(own.addedByName, own.ownerName)} data-testid="find-leads-added-by">
      <OwnerAvatar name={own.ownerName} avatarUrl={own.avatarUrl} />
    </span>
  );
}

/**
 * Admin: what replaces Add to CRM when the SERVER recognises a business this browser's own match missed (a lead that
 * came in by file — 2026-10-19). Not a button and not clickable: the owner's avatar with "Added by <name>", or, with no
 * owner on record, a neutral "In CRM" tick.
 */
export function AlreadyAddedMarker({ own, compact = false }: { own: OwnershipInfo; compact?: boolean }) {
  return (
    <span className={`inline-flex cursor-default select-none items-center gap-1.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 font-medium whitespace-nowrap ${compact ? 'h-8 px-2 text-[11px]' : 'h-8 px-2.5 text-xs'}`}
      title={addedByText(own.addedByName, own.ownerName)} aria-label={addedByText(own.addedByName, own.ownerName)} aria-disabled="true" data-testid="find-leads-already-added">
      {own.ownerName ? <OwnerAvatar name={own.ownerName} avatarUrl={own.avatarUrl} /> : <Check className="h-3.5 w-3.5" />}
      In CRM
    </span>
  );
}
