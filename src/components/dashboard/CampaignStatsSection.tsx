import { useState } from 'react';
import { useCampaignStats, type CampaignStats } from '@/hooks/useCampaignStats';
import { useCampaigns, type CampaignInput } from '@/hooks/useCampaigns';
import { CampaignStatsCard } from '@/components/dashboard/CampaignStatsCard';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import type { Campaign } from '@/hooks/useCampaigns';

/**
 * Per-campaign monitoring grid for the operator dashboard. Admin-gated by the
 * caller (matches SiteFunnelCard's visibility). Cards compare campaigns side by
 * side; the pencil edits name/description/method in place.
 */
export function CampaignStatsSection() {
  const { stats, isLoading, refetch } = useCampaignStats();
  const { updateCampaign } = useCampaigns();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEdit = (s: CampaignStats) => {
    if (!s.campaign) return;
    setEditing(s.campaign);
    setDialogOpen(true);
  };

  const handleSave = async (values: CampaignInput) => {
    if (!editing) return null;
    const updated = await updateCampaign(editing.id, values);
    if (updated) await refetch();
    return updated;
  };

  if (isLoading) return null;
  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No campaigns yet. Create one from the campaign picker on Find Leads or Outreach.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <CampaignStatsCard key={s.campaign?.id ?? '__unassigned__'} stat={s} onEdit={handleEdit} />
        ))}
      </div>

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editing}
        onSubmit={handleSave}
      />
    </>
  );
}
