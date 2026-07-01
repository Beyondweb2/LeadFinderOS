import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Save, Check, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead, ConfirmedService } from '@/types/outreach';

/** Trim + drop blank-name rows; price/duration optional. */
function clean(rows: ConfirmedService[]): ConfirmedService[] {
  return rows
    .map((r) => {
      const out: ConfirmedService = { name: (r.name ?? '').trim() };
      if (r.price && r.price.trim()) out.price = r.price.trim();
      if (typeof r.durationMins === 'number' && r.durationMins > 0) out.durationMins = Math.round(r.durationMins);
      return out;
    })
    .filter((r) => r.name.length > 0);
}

function eq(a: ConfirmedService[], b: ConfirmedService[]): boolean {
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

/**
 * PHASE 3b — booking-page services editor.
 *
 * The operator's services-customization section for a booking page. Pre-fills from
 * the lead's confirmed_services (or its existing service names) and is fully
 * editable. Saving persists confirmed_services to the lead; generate-barber-site
 * (booking_only) then uses them. Services stay editable here and later in the live
 * site editor — which is where the one-time "Scan website" helper now lives.
 */
export function BookingServicesEditor({
  lead,
  onUpdate,
}: {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown> | void;
}) {
  const { toast } = useToast();

  const saved = useMemo<ConfirmedService[]>(() => {
    if (Array.isArray(lead.confirmed_services) && lead.confirmed_services.length) {
      return lead.confirmed_services.map((s) => ({ name: s.name, price: s.price, durationMins: s.durationMins }));
    }
    if (Array.isArray(lead.services_included) && lead.services_included.length) {
      return lead.services_included.map((n) => ({ name: n }));
    }
    return [];
  }, [lead.confirmed_services, lead.services_included]);

  const [rows, setRows] = useState<ConfirmedService[]>(saved);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = !eq(rows, saved);

  const setRow = (i: number, patch: Partial<ConfirmedService>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const next = clean(rows);
      await onUpdate(lead.id, { confirmed_services: next.length ? next : null });
      setRows(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      toast({ title: 'Services saved', description: next.length ? `${next.length} service${next.length === 1 ? '' : 's'} will pre-fill the booking page.` : 'Cleared — booking page falls back to defaults.' });
    } catch (e) {
      toast({ title: "Couldn't save", description: (e as Error)?.message ?? 'Save failed.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Booking page services</span>
      </div>

      <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
        Pre-fills the booking page. Nothing goes live until you Save.
      </p>

      {rows.length === 0 ? (
        <p className="mb-2.5 rounded-md border border-dashed border-border/50 px-2.5 py-3 text-center text-xs text-muted-foreground/50">
          No services yet — add them by hand. The booking page falls back to generic examples until you save some.
        </p>
      ) : (
        <ul className="mb-2.5 space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Service" className="h-7 min-w-0 flex-1 text-xs" />
              <Input value={r.price ?? ''} onChange={(e) => setRow(i, { price: e.target.value })} placeholder="£" className="h-7 w-16 text-xs" />
              <Input
                value={r.durationMins?.toString() ?? ''}
                onChange={(e) => setRow(i, { durationMins: e.target.value ? parseInt(e.target.value, 10) || undefined : undefined })}
                placeholder="min" inputMode="numeric" className="h-7 w-14 text-xs"
              />
              <button onClick={() => removeRow(i)} className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add service
          </Button>
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : justSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {justSaved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </section>
  );
}
