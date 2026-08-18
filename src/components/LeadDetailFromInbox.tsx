import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useOutreach } from '@/hooks/useOutreach';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import type { LeadStatus, OutreachLead } from '@/types/outreach';

/* ============================================================
   INBOX → THE RICH LEAD DIALOG — one component, second mount (2026-08-18, Paul's spec).

   ⛔ THIS IS NOT A NEW DIALOG. It renders the EXACT SAME `LeadDetailDialog` the Outreach page
   uses — audit, questionnaire, full business info, mark-paid, the lot — as an overlay over Inbox,
   with no navigation away. There is no fork: any change to LeadDetailDialog is inherited by both
   pages by construction, which is the hard rule.

   WHY A WRAPPER. Inbox holds only a slim WaConversation (leadId, status, campaign, isPaid, phone) —
   nowhere near the full OutreachLead the dialog renders, and none of the real mutation handlers.
   So this wrapper mounts `useOutreach` (the full paginated lead fetch AND the identical handlers
   Outreach passes) the moment a detail opens, finds the lead by id, and hands the dialog the same
   props Outreach hands it.

   ⛔ CLOSED → RENDERS NULL, so the heavy hook is not mounted until a detail is actually opened —
   Inbox pays nothing for this until you click Details. The stated cost when you DO open one is the
   ~1s paginated lead fetch (the shell shows a spinner, never an empty dialog); it disappears when
   useOutreach moves to React Query (CLAUDE.md §6c).

   ⛔ STATE STAYS TRUE ON BOTH PAGES. A status change made in the dialog is reflected on Inbox's own
   conversation pill via `onStatusPatched` (useInbox.patchLeadStatus — the same optimistic update
   Inbox's inline pill already uses), so the two never disagree. Outreach sees it through its own
   fetch as it always did.
   ============================================================ */

export function LeadDetailFromInbox({ leadId, open, onOpenChange, onStatusPatched }: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reflect a status change on Inbox's pill without a refetch (useInbox.patchLeadStatus). */
  onStatusPatched?: (leadId: string, status: string) => void;
}) {
  // Not open → nothing mounts, so useOutreach (and its fetch) never runs on a closed Inbox.
  if (!open || !leadId) return null;
  return <LeadDetailFromInboxInner leadId={leadId} onOpenChange={onOpenChange} onStatusPatched={onStatusPatched} />;
}

function LeadDetailFromInboxInner({ leadId, onOpenChange, onStatusPatched }: {
  leadId: string;
  onOpenChange: (open: boolean) => void;
  onStatusPatched?: (leadId: string, status: string) => void;
}) {
  const { user } = useAuth();
  const {
    leads, isLoading,
    updateStatus, updateNextAction, updateLead, updateNotes, updateBusinessName, fetchActivities,
  } = useOutreach();
  const lead = useMemo(() => leads.find((l) => l.id === leadId) ?? null, [leads, leadId]);

  /* The two handlers that can move status are wrapped so Inbox's pill follows live. Everything
     else is passed straight through — the SAME functions Outreach uses, not reimplementations. */
  const onStatusChange = async (id: string, status: LeadStatus) => {
    const r = await updateStatus(id, status);
    onStatusPatched?.(id, status);
    return r;
  };
  const onUpdateLead = async (id: string, updates: Partial<OutreachLead>) => {
    const r = await updateLead(id, updates);
    // Mark-paid and any status-carrying edit go through updateLead — keep Inbox's pill honest.
    if (typeof updates.status === 'string') onStatusPatched?.(id, updates.status);
    return r;
  };

  /* NEVER AN EMPTY DIALOG. While the lead list is still fetching, the shell shows a spinner; if the
     lead is gone (archived/removed since Inbox listed it), it says so rather than rendering blank. */
  if (!lead) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            {isLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading the full lead…</>
              : 'This lead is no longer in your outreach list — it may have been archived or removed.'}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <LeadDetailDialog
      open
      onOpenChange={onOpenChange}
      lead={lead}
      onStatusChange={onStatusChange}
      onNextActionChange={updateNextAction}
      onUpdateLead={onUpdateLead}
      onNotesChange={updateNotes}
      onBusinessNameChange={updateBusinessName}
      onImageChange={(id, url) => updateLead(id, { image_url: url })}
      fetchActivities={fetchActivities}
      userId={user?.id}
      // Matches OutreachTable's own mount when no campaign sale-type map is to hand — the dialog
      // treats null as "use the plain default" on mark-paid.
      campaignDefaultSaleType={null}
    />
  );
}
