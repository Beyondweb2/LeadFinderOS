import { useState } from 'react';
import { useCampaignStats, type CampaignStats } from '@/hooks/useCampaignStats';
import { useCampaigns, type CampaignInput } from '@/hooks/useCampaigns';
import { CampaignStatsCard } from '@/components/dashboard/CampaignStatsCard';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';
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

/* ── ONE CAMPAIGN, COLLAPSED UNTIL ASKED FOR ─────────────────────────────────────────────────────
   ⛔ THE SUMMARY CARRIES THE DECISION, NOT JUST THE NAME. Reached / replied / paid are what tell
   you whether a campaign is worth opening; a row of bare campaign names would turn "collapsed" into
   "gone", which is the failure a collapse is supposed to avoid.
   ⚠️ The card is UNMOUNTED when shut, not hidden — CampaignStatsCard does real work per render and
   thirteen of them running behind display:none is the cost this change exists to remove. */
function CampaignRow({ rowKey, stat, onEdit, onToggleHide, siteTrackingReady }: {
  rowKey: string;
  stat: CampaignStats;
  /* ⚠️ BOTH TAKE THE WHOLE CampaignStats, not a Campaign or a key. I guessed those signatures and
     tsc refused all four call sites — the row is a pass-through, so its types must be the card's. */
  onEdit: (s: CampaignStats) => void;
  onToggleHide: (s: CampaignStats) => void;
  siteTrackingReady: boolean;
}) {
  const [open, setOpen] = usePersistedState<boolean>(`dashboard.campaign.${rowKey}`, false, { tier: 'local' });
  const name = stat.campaign?.name ?? 'Unassigned';
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border border-border/50 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {stat.reached} reached · {stat.replied} replied · {stat.paid} paid
        </span>
      </button>
      {open && (
        <div className="mt-2">
          <CampaignStatsCard stat={stat} onEdit={onEdit} onToggleHide={onToggleHide} siteTrackingReady={siteTrackingReady} />
        </div>
      )}
    </div>
  );
}

export function CampaignStatsSection() {
  const { stats, isLoading, refetch, siteTrackingReady } = useCampaignStats();
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
      {/* 🔴 EVERY CAMPAIGN COLLAPSED BY DEFAULT (2026-09-13, Paul's cut). Thirteen campaigns each
          rendered a full 386-line card, expanded, with no max-height anywhere in the chain — this
          section alone was more page height than the rest of the dashboard together. The summary
          row keeps the three numbers that decide whether to open one, so collapsing costs no
          information you were actually reading.
          ⚠️ Expansion is per campaign and PERSISTED, so a campaign you are working on stays open
          across navigation and reloads, exactly like the section collapses. */}
      <div className="grid gap-2 grid-cols-1">
        {visible.map((s) => (
          <CampaignRow key={keyOf(s)} rowKey={keyOf(s)} stat={s}
            onEdit={handleEdit} onToggleHide={toggleHide} siteTrackingReady={siteTrackingReady} />
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
                <CampaignStatsCard key={keyOf(s)} stat={s} onEdit={handleEdit} onToggleHide={toggleHide} hidden siteTrackingReady={siteTrackingReady} />
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
