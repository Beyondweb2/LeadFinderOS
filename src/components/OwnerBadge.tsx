import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/salesCrm';
import { alreadyAddedLine, findLeadsStatusLabel, isStopStatus } from '@/lib/findLeadsLeadStatus';

/** A small avatar (image, else initials) for a team member. Names only — never a conversation. */
export function OwnerAvatar({ name, avatarUrl, className }: { name: string | null | undefined; avatarUrl?: string | null; className?: string }) {
  return (
    <Avatar className={cn('h-5 w-5 text-[9px]', className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name ?? ''} /> : null}
      <AvatarFallback className="bg-primary/15 text-primary font-semibold">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

/** "[PS] Already added · Paul" (or "· 25 Sep"). Shown instead of an Add/Claim button. */
/** Find Leads, a salesperson: the business is already in the CRM. Not a button. Names who ADDED it (2026-10-27); the tooltip
 *  adds who works it now when that is someone else, and the date. */
export function AlreadyAddedBadge({ ownerName, addedByName, avatarUrl, addedAt, leadStatus, className, compact = false }: {
  ownerName: string | null | undefined; addedByName?: string | null; avatarUrl?: string | null; addedAt?: string | null; className?: string;
  /** 2026-11-16: the server's status key (src/lib/findLeadsLeadStatus.ts) — "Added by Paul · Opted out". */
  leadStatus?: string | null;
  /** Phone card: the avatar and the first name only (the full line is the tooltip), so the business name keeps its room. */
  compact?: boolean;
}) {
  const date = addedAt ? new Date(addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : null;
  const who = addedByName ?? null;
  const status = findLeadsStatusLabel(leadStatus);
  const stop = isStopStatus(leadStatus);
  /* No lead at all (a phone on the opt-out / DNC list nobody added): the status alone. */
  const hasLead = !!(addedAt || who || ownerName);
  const line = alreadyAddedLine(who, leadStatus, ownerName, hasLead);
  const tip = hasLead
    ? [who ? `Added by ${who}` : 'Already in the CRM', ownerName && ownerName !== who ? `worked by ${ownerName}` : null, date ? `added ${date}` : null, status]
    : [status ? `${status} — this number is on the opt-out / Do Not Contact list. Never contact it.` : 'Already in the CRM'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs whitespace-nowrap cursor-default',
      stop ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border/60 bg-muted/40 text-muted-foreground', className)}
      title={tip.filter(Boolean).join(' · ')} aria-disabled="true" data-testid="find-leads-added-by-badge" data-lead-status={leadStatus ?? undefined}>
      {who ? <OwnerAvatar name={who} avatarUrl={who === ownerName ? avatarUrl : null} /> : null}
      <span>{compact ? (stop && status ? status : who ? `By ${who.split(' ')[0]}` : 'Added') : line}</span>
    </span>
  );
}

/** "Owner: Paul" line for a lead page or conversation header. */
export function OwnerLine({ ownerName, avatarUrl, className }: { ownerName: string | null | undefined; avatarUrl?: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span>Owner:</span>
      {ownerName ? <><OwnerAvatar name={ownerName} avatarUrl={avatarUrl} /><span className="text-foreground">{ownerName}</span></> : <span className="italic">Unassigned</span>}
    </span>
  );
}
