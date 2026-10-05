import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useRecordBusinessType, type LeadCompliance } from '@/hooks/useLeadCompliance';
import { BUSINESS_TYPES, BUSINESS_TYPE_SOURCES, type BusinessType, type BusinessTypeSource } from '@/lib/businessType';

/* The two compliance lines on the Prospect card (2026-10-05, docs/salesperson-onboarding.md §5–6).
   Display only: neither line allows or blocks a call or a message. */

const RECORD_ERRORS: Record<string, string> = {
  evidence_needed: 'Say what the evidence is (for example: "told me on the call", or the company number).',
  bad_type: 'Pick a business type.',
  bad_source: 'Pick where it came from.',
  too_long: 'Keep the note under 300 characters.',
};

export function BusinessTypeValue({ leadId, compliance, canRecord }: { leadId: string; compliance: LeadCompliance; canRecord: boolean }) {
  const { toast } = useToast();
  const record = useRecordBusinessType(leadId);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BusinessType | ''>('');
  const [source, setSource] = useState<BusinessTypeSource | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const bt = compliance.businessType;
  const save = async () => {
    if (!type || !source) return;
    setBusy(true);
    try {
      const r = await record(type, source, note);
      if (!r.ok) { toast({ title: 'Not saved', description: RECORD_ERRORS[String(r.error)] ?? String(r.error ?? 'Try again'), variant: 'destructive' }); return; }
      setOpen(false); setType(''); setSource(''); setNote('');
    } finally { setBusy(false); }
  };
  return (
    <span className="block">
      <span className={bt.type === 'unknown' ? 'italic text-muted-foreground/60' : ''}>{compliance.loading ? '…' : bt.label}</span>
      {!compliance.loading && <span className={`block text-[11px] ${bt.conflict ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{bt.detail}</span>}
      {canRecord && !open && <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setOpen(true)}>Record what you know</button>}
      {open && (
        <span className="mt-1 block space-y-1">
          <select className="h-7 w-full rounded border border-input bg-background px-1 text-xs" value={type} onChange={(e) => setType(e.target.value as BusinessType)}>
            <option value="">Business type…</option>
            {Object.entries(BUSINESS_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="h-7 w-full rounded border border-input bg-background px-1 text-xs" value={source} onChange={(e) => setSource(e.target.value as BusinessTypeSource)}>
            <option value="">How do you know?</option>
            {Object.entries(BUSINESS_TYPE_SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Input className="h-7 text-xs" value={note} maxLength={300} placeholder="The evidence (e.g. company number, what they said)" onChange={(e) => setNote(e.target.value)} />
          <span className="flex gap-1">
            <Button size="sm" className="h-7 text-xs" disabled={busy || !type || !source} onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          </span>
        </span>
      )}
    </span>
  );
}

export function TpsValue({ compliance }: { compliance: LeadCompliance }) {
  const t = compliance.tps;
  return (
    <span className="block" data-testid="tps-status" data-tps-state={t.state}>
      <span className={t.screenedClear ? '' : 'text-muted-foreground'}>{t.label}</span>
      <span className="block text-[11px] text-muted-foreground">{t.detail}</span>
    </span>
  );
}
