import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SALE_TYPES, type SaleType } from '@/lib/saleType';
import { CAMPAIGN_METHOD_OPTIONS } from '@/lib/campaign';
import type { Campaign, CampaignInput } from '@/hooks/useCampaigns';

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this campaign; otherwise it creates a new one. */
  campaign?: Campaign | null;
  onSubmit: (values: CampaignInput) => Promise<unknown>;
}

const NO_METHOD = '__none__';

/** Shared create/edit form for a campaign: name, description, method, default sale type. */
export function CampaignFormDialog({ open, onOpenChange, campaign, onSubmit }: CampaignFormDialogProps) {
  const isEdit = !!campaign;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<string>(NO_METHOD);
  const [saleType, setSaleType] = useState<SaleType>('website');
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever it opens (with the campaign's values in edit mode).
  useEffect(() => {
    if (!open) return;
    setName(campaign?.name ?? '');
    setDescription(campaign?.description ?? '');
    setMethod(campaign?.method ?? NO_METHOD);
    setSaleType((campaign?.default_sale_type as SaleType) ?? 'website');
  }, [open, campaign]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const result = await onSubmit({
      name,
      description,
      method: method === NO_METHOD ? null : method,
      default_sale_type: saleType,
    });
    setSaving(false);
    if (result) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Name</label>
            <Input
              autoFocus
              placeholder="e.g. Birmingham Barbers"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && !saving) handleSave();
              }}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">What this is</label>
            <Textarea
              placeholder="Short description so you can tell campaigns apart"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Method (intended channel)</label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_METHOD}>Not set</SelectItem>
                {CAMPAIGN_METHOD_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Default sale type for this campaign</label>
            <Select value={saleType} onValueChange={(v) => setSaleType(v as SaleType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Leads in this campaign default to this; each lead can override.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
