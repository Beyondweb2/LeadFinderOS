import { useState } from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

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
 * Includes an inline "New campaign…" action that opens a small create dialog.
 */
export function CampaignPicker({ value, onChange, mode, className }: CampaignPickerProps) {
  const { campaigns, createCampaign } = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    setCreating(true);
    const created = await createCampaign(newName);
    setCreating(false);
    if (created) {
      setNewName('');
      setDialogOpen(false);
      onChange(created.id);
    }
  };

  return (
    <>
      <Select value={selectValue} onValueChange={handleSelect}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Birmingham Barbers"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim() && !creating) handleCreate();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
