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
}

/** Sales: the cell for a non-new business, or null to let the normal Add button render. */
export function salesOwnershipCell(own: OwnershipInfo | null | undefined, onClaim?: (leadId: string) => void, claiming?: boolean): ReactNode | null {
  if (!own || own.state === 'new') return null;
  if (own.state === 'yours' && own.leadId) {
    return (
      <Link to={`/sales/lead/${own.leadId}`} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium whitespace-nowrap">
        <Check className="h-3.5 w-3.5" /> Yours
      </Link>
    );
  }
  if (own.state === 'claimable' && own.leadId && onClaim) {
    return (
      <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled={claiming} onClick={() => onClaim(own.leadId!)}>
        Claim lead
      </Button>
    );
  }
  return <AlreadyAddedBadge ownerName={own.ownerName} avatarUrl={own.avatarUrl} addedAt={own.addedAt} />;
}

/** Admin: a small owner marker beside the existing In-CRM / Remove control. */
export function adminOwnerMarker(own: OwnershipInfo | null | undefined): ReactNode | null {
  if (!own || own.state === 'new') return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap" title={own.ownerName ? `Owner: ${own.ownerName}` : 'Unassigned'}>
      {own.ownerName ? <OwnerAvatar name={own.ownerName} avatarUrl={own.avatarUrl} /> : null}
      {own.ownerName ?? 'Unassigned'}
    </span>
  );
}
