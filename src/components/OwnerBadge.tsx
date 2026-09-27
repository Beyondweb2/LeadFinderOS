import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/salesCrm';

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
export function AlreadyAddedBadge({ ownerName, avatarUrl, addedAt, className }: {
  ownerName: string | null | undefined; avatarUrl?: string | null; addedAt?: string | null; className?: string;
}) {
  const date = addedAt ? new Date(addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground whitespace-nowrap', className)}
      title={date ? `Added ${date}` : undefined}>
      {ownerName ? <OwnerAvatar name={ownerName} avatarUrl={avatarUrl} /> : null}
      <span>Already added{ownerName ? ` · ${ownerName}` : ''}</span>
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
