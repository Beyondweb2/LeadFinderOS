import { useState } from 'react';
import { useCampaigns, type CampaignInput } from '@/hooks/useCampaigns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';

const NEW_CAMPAIGN = '__new__';
const ALL_CAMPAIGNS = '__all__';
const NO_CAMPAIGN = '__none__';

interface CampaignPickerProps {
  /** Selected campaign id. null = "All" (filter mode) or "No campaign" (assign mode). */
  value: string | null;
  onChange: (campaignId: string | null) => void;
  /** filter mode adds an "All campaigns" option; assign mode adds a "No campaign" option. */
  mode: 'filter' | 'assign';
  className?: string;
}

/**
 * Thin campaign dropdown shared by Outreach (filter) and Find Leads (assign).
 * Includes an inline "New campaign…" action that opens the shared create dialog.
 */
export function CampaignPicker({ value, onChange, mode, className }: CampaignPickerProps) {
  const { campaigns, createCampaign, refetch } = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);

  const sentinel = mode === 'filter' ? ALL_CAMPAIGNS : NO_CAMPAIGN;
  const selectValue = value ?? sentinel;

  const handleSelect = (v: string) => {
    if (v === NEW_CAMPAIGN) {
      setDialogOpen(true);
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
    if (created) onChange(created.id);
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
          <SelectItem value={NEW_CAMPAIGN}>
            <span className="flex items-center gap-1.5 text-primary">
              <Plus className="h-3.5 w-3.5" />
              New campaign…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </>
  );
}
