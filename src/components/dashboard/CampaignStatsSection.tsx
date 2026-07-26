import { useState } from 'react';
import { useCampaignStats, type CampaignStats } from '@/hooks/useCampaignStats';
import { useCampaigns, type CampaignInput } from '@/hooks/useCampaigns';
import { CampaignStatsCard } from '@/components/dashboard/CampaignStatsCard';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@/hooks/useCampaigns';

// Per-user (per-browser) hidden-campaign preference. localStorage by decision:
// hiding is a personal view tweak, not shared state — and it never deletes anything.
const HIDDEN_KEY = 'dashboard.hiddenCampaigns';
const UNASSIGNED_KEY = '__unassigned__';

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveHidden(ids: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  } catch { /* storage unavailable — hiding just won't persist */ }
}

/**
 * Per-campaign monitoring grid for the operator dashboard. Admin-gated by the
 * caller. Cards compare campaigns side by side; the pencil edits the campaign in
 * place; the eye hides a card from this view (persisted per-user in localStorage —
 * the campaign itself is untouched) with a "Show hidden (N)" reveal.
 */
export function CampaignStatsSection() {
  const { stats, isLoading, refetch } = useCampaignStats();
  const { updateCampaign } = useCampaigns();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(loadHidden);
  const [showHidden, setShowHidden] = useState(false);

  const keyOf = (s: CampaignStats) => s.campaign?.id ?? UNASSIGNED_KEY;

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

  const toggleHide = (s: CampaignStats) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      const key = keyOf(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveHidden(next);
      return next;
    });
  };

  if (isLoading) return null;
  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No campaigns yet. Create one from the campaign picker on Find Leads or Outreach.
      </p>
    );
  }

  const visible = stats.filter((s) => !hiddenIds.has(keyOf(s)));
  const hidden = stats.filter((s) => hiddenIds.has(keyOf(s)));

  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <CampaignStatsCard key={keyOf(s)} stat={s} onEdit={handleEdit} onToggleHide={toggleHide} />
        ))}
      </div>

      {hidden.length > 0 && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? `Hide hidden campaigns (${hidden.length})` : `Show hidden (${hidden.length})`}
          </Button>
          {showHidden && (
            <div className="mt-3 grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 opacity-70">
              {hidden.map((s) => (
                <CampaignStatsCard key={keyOf(s)} stat={s} onEdit={handleEdit} onToggleHide={toggleHide} hidden />
              ))}
            </div>
          )}
        </div>
      )}

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editing}
        onSubmit={handleSave}
      />
    </>
  );
}
