import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TRADES } from '@/lib/trades';
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
import { WHATSAPP_TEMPLATES, ALL_WHATSAPP_TEMPLATES, isLegacyTemplate, templateLabel } from '@/types/outreach';
import { CAMPAIGN_TYPE_OPTIONS, type Campaign, type CampaignInput, type CampaignType } from '@/hooks/useCampaigns';

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this campaign; otherwise it creates a new one. */
  campaign?: Campaign | null;
  onSubmit: (values: CampaignInput) => Promise<unknown>;
}

const NO_TRADE = '__none';
const NO_METHOD = '__none__';
const NO_TEMPLATE = '__none__';

/** Shared create/edit form for a campaign: name, description, method, default sale type,
 *  default WhatsApp template. */
export function CampaignFormDialog({ open, onOpenChange, campaign, onSubmit }: CampaignFormDialogProps) {
  const isEdit = !!campaign;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<string>(NO_METHOD);
  const [saleType, setSaleType] = useState<SaleType>('website');
  const [defaultTemplate, setDefaultTemplate] = useState<string>(NO_TEMPLATE);
  const [tradeSlug, setTradeSlug] = useState<string>(NO_TRADE);
  const [campaignType, setCampaignType] = useState<CampaignType>('audit');
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever it opens (with the campaign's values in edit mode). A
  // stored default_template that isn't a current allowlist key falls back to "Not set";
  // an unknown/null campaign_type falls back to 'audit' (the column default).
  useEffect(() => {
    if (!open) return;
    setName(campaign?.name ?? '');
    setDescription(campaign?.description ?? '');
    setMethod(campaign?.method ?? NO_METHOD);
    setSaleType((campaign?.default_sale_type as SaleType) ?? 'website');
    /* ⛔ A STORED TEMPLATE THIS PICKER NO LONGER OFFERS IS KEPT, NOT SILENTLY RESET (2026-09-05).
       WHATSAPP_TEMPLATES shrank to Findable-only when the barber-era entries were split out, and
       two live campaigns still store booking_switch_barbers. The old line reset any unrecognised
       value to "Not set", so merely OPENING this dialog and pressing Save would have rewritten
       their default to null — a data change nobody asked for, made by a dialog they opened to edit
       something else. It is now kept and shown as legacy; only a genuinely unknown key falls back.
       ⚠️ This was already the behaviour for any key missing from the list; the split is what would
       have made it bite. Widening the check to ALL_WHATSAPP_TEMPLATES is the whole fix. */
    const t = campaign?.default_template;
    setDefaultTemplate(t && ALL_WHATSAPP_TEMPLATES.some((o) => o.value === t) ? t : NO_TEMPLATE);
    /* ⛔ VALIDATED AGAINST TRADES, so a slug removed from trades.ts shows as "not set" rather than
       as a value the picker cannot display. */
    const ts = campaign?.trade_slug;
    setTradeSlug(ts && TRADES.some((t) => t.slug === ts) ? ts : NO_TRADE);
    const ct = campaign?.campaign_type;
    setCampaignType(CAMPAIGN_TYPE_OPTIONS.some((o) => o.value === ct) ? (ct as CampaignType) : 'audit');
  }, [open, campaign]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    // Constrain to a known template key or null (matches the edge allowlist), same as method /
    // sale type are constrained to their option sets. ALL_ rather than the sendable list, so
    // saving an old barber campaign preserves the template it already had.
    const templateValid = defaultTemplate !== NO_TEMPLATE && ALL_WHATSAPP_TEMPLATES.some((o) => o.value === defaultTemplate);
    const result = await onSubmit({
      name,
      description,
      method: method === NO_METHOD ? null : method,
      default_sale_type: saleType,
      default_template: templateValid ? defaultTemplate : null,
      campaign_type: campaignType,
      /* ⛔ NO_TRADE STORES NULL, which means "nobody has said yet" — never an empty string, which
         would be a value that matches no trade and reads as if someone HAD answered. */
      trade_slug: tradeSlug === NO_TRADE ? null : tradeSlug,
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
            <label className="text-xs text-muted-foreground block mb-1.5">Campaign type</label>
            <Select value={campaignType} onValueChange={(v) => setCampaignType(v as CampaignType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Drives which metrics this campaign's dashboard card shows.</p>
          </div>

          {/* ⛔ THIS IS WHAT PUTS A LEAD IN THE RIGHT PLACE. Adding from Coverage or the market view
              matches the lead's trade to this, so it cannot depend on the campaign's NAME — only 4
              of 12 names resolve, and renaming a campaign must never move leads. */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Trade</label>
            <Select value={tradeSlug} onValueChange={setTradeSlug}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TRADE}>Not set</SelectItem>
                {TRADES.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Leads added from Coverage or the market view land here when their trade matches. Left
              unset, they fall back to whichever campaign is selected &mdash; and say so.
            </p>
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

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Default WhatsApp template for this campaign</label>
            <Select value={defaultTemplate} onValueChange={setDefaultTemplate}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>Not set</SelectItem>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
                {/* Only when this campaign ALREADY stores a legacy template: the option exists so
                    the picker can display what is saved, never to offer it as a new choice. */}
                {isLegacyTemplate(defaultTemplate) && (
                  <SelectItem value={defaultTemplate}>{templateLabel(defaultTemplate)} (legacy)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Leads in this campaign default to this template in manage-sites; you can still change it per send.</p>
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
