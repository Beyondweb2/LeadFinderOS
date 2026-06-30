import { useState } from 'react';
import { useCampaigns, type Campaign, type CampaignInput } from '@/hooks/useCampaigns';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import { CAMPAIGN_METHOD_LABELS } from '@/lib/campaign';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

interface CampaignManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manage your LeadFinder campaigns: rename / edit settings (via CampaignFormDialog)
 * and delete. Deleting a campaign moves its leads to "No campaign" — it NEVER deletes
 * leads (the FK is ON DELETE SET NULL; see useCampaigns.deleteCampaign).
 */
export function CampaignManagerDialog({ open, onOpenChange }: CampaignManagerDialogProps) {
  const { campaigns, isLoading, updateCampaign, deleteCampaign } = useCampaigns();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openEdit = (c: Campaign) => { setEditing(c); setEditOpen(true); };

  const handleDelete = async (c: Campaign) => {
    const ok = window.confirm(
      `Delete the campaign "${c.name}"?\n\n` +
      `Its leads will be moved to "No campaign" — they are NOT deleted, just unassigned. ` +
      `This also clears this campaign's teammate claims. This can't be undone.`,
    );
    if (!ok) return;
    setDeletingId(c.id);
    try { await deleteCampaign(c.id); } finally { setDeletingId(null); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage campaigns</DialogTitle>
            <DialogDescription>
              Rename, edit settings, or delete. Deleting a campaign moves its leads to
              “No campaign” — it never deletes leads.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              campaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    {(c.method || c.description) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {c.method ? (CAMPAIGN_METHOD_LABELS[c.method] ?? c.method) : ''}
                        {c.method && c.description ? ' · ' : ''}
                        {c.description ?? ''}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => openEdit(c)} title="Edit campaign"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)} disabled={deletingId === c.id}
                      title="Delete campaign (leads are moved to No campaign, not deleted)"
                    >
                      {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reuses the shared create/edit form in edit mode. */}
      <CampaignFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        campaign={editing}
        onSubmit={(vals: CampaignInput) => (editing ? updateCampaign(editing.id, vals) : Promise.resolve(null))}
      />
    </>
  );
}
