import { useState } from 'react';
import { useCampaigns, type CampaignInput } from '@/hooks/useCampaigns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Settings2 } from 'lucide-react';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import { CampaignManagerDialog } from '@/components/CampaignManagerDialog';

const NEW_CAMPAIGN = '__new__';
const MANAGE_CAMPAIGNS = '__manage__';
const ALL_CAMPAIGNS = '__all__';
const NO_CAMPAIGN = '__none__';

interface CampaignPickerProps {
  /** Selected campaign id. null = "All" (filter mode) or "No campaign" (assign mode). */
  value: string | null;
  onChange: (campaignId: string | null) => void;
  /** filter mode adds an "All campaigns" option; assign mode adds a "No campaign" option. */
  mode: 'filter' | 'assign';
  className?: string;
  /** Hide the inline "New campaign…" / "Manage campaigns…" actions — for places
   *  that only filter and never create (e.g. the Inbox). */
  hideCreate?: boolean;
}

/**
 * Thin campaign dropdown shared by Outreach (filter) and Find Leads (assign).
 * Includes an inline "New campaign…" action that opens the shared create dialog.
 */
export function CampaignPicker({ value, onChange, mode, className, hideCreate = false }: CampaignPickerProps) {
  const { campaigns, createCampaign, refetch } = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  const sentinel = mode === 'filter' ? ALL_CAMPAIGNS : NO_CAMPAIGN;
  const selectValue = value ?? sentinel;

  const handleSelect = (v: string) => {
    if (v === NEW_CAMPAIGN) {
      setDialogOpen(true);
      return;
    }
    if (v === MANAGE_CAMPAIGNS) {
      setManagerOpen(true);
      return;
    }
    if (v === ALL_CAMPAIGNS || v === NO_CAMPAIGN) {
      onChange(null);
      return;
    }
    onChange(v);
  };

  const handleCreate = async (values: CampaignInput) => {
    const created = await createCampaign(values);
    if (created) {
      // Auto-select the new campaign. createCampaign already added it to the list,
      // so defer the selection by a tick: this lets the new <SelectItem> mount and
      // register in Radix's item collection BEFORE it becomes the value. Selecting
      // it in the same commit it's added leaves the trigger blank until the user
      // re-opens and picks it manually (Radix resolves the label from the collection,
      // which only registers after the commit).
      setTimeout(() => onChange(created.id), 0);
    }
    return created;
  };

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={handleSelect}
        // Refetch on open so the list is always current — a campaign created in
        // another picker/page/tab (useCampaigns has no shared store) shows up
        // immediately, without a page reload.
        onOpenChange={(open) => { if (open) refetch(); }}
      >
        <SelectTrigger className={className ?? 'h-9 w-[200px]'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={sentinel}>
            {mode === 'filter' ? 'All campaigns' : 'No campaign'}
          </SelectItem>
          {campaigns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          {!hideCreate && (
            <SelectItem value={NEW_CAMPAIGN}>
              <span className="flex items-center gap-1.5 text-primary">
                <Plus className="h-3.5 w-3.5" />
                New campaign…
              </span>
            </SelectItem>
          )}
          {!hideCreate && campaigns.length > 0 && (
            <SelectItem value={MANAGE_CAMPAIGNS}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Manage campaigns…
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />

      <CampaignManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
