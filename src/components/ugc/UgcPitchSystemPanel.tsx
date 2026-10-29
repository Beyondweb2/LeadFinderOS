import { useEffect, useState } from 'react';
import { FileUp, Loader2, Lock, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Callout, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { useUgcActions, useUgcPitchLog, useUgcPitchSystem, type UgcPitchSystem } from '@/hooks/useUgc';
import { TEMPLATE_KEYS, TEMPLATE_LABEL, WHATSAPP_ASK_DRAFT } from '@/lib/ugc/pitch';
import { rowsFromCsv } from '@/lib/ugc/pitchLog';

/* HER PITCH SYSTEM — private to Jess (RLS: owner only, not the admin). Personal data: it lives here, never in git. */

const EMPTY: Omit<UgcPitchSystem, 'owner_user_id'> = {
  content: '', about_jess: '', rates: '', templates: {}, blocked_list: [], signoff_html: '', whatsapp_template: WHATSAPP_ASK_DRAFT, whatsapp_template_approved: false,
};

export function UgcPitchSystemPanel({ ownerId, isMember }: { ownerId: string; isMember: boolean }) {
  const q = useUgcPitchSystem(isMember);
  const actions = useUgcActions();
  const { toast } = useToast();
  const [s, setS] = useState(EMPTY);
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) { setS({ ...EMPTY, ...q.data }); setBlocked((q.data.blocked_list ?? []).join('\n')); }
  }, [q.data]);

  if (!isMember) {
    return <Callout tone="blue" icon={Lock} title="Private to Jess">Her pitch system, rates, templates and pitch log are visible to her account only — not to the admin.</Callout>;
  }
  const save = async () => {
    setBusy(true);
    try {
      await actions.savePitchSystem(ownerId, { ...s, blocked_list: blocked.split('\n').map((x) => x.trim()).filter(Boolean) });
      toast({ title: 'Saved' });
    } catch (e) { toast({ title: 'Not saved', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(false); }
  };
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4">
      <Callout tone="blue" icon={Lock} title="Private to you">Only your account can read or change this. The pitch writer follows it; rates are kept here and never put in a pitch.</Callout>
      <Card><CardContent className="space-y-4 p-4 text-sm">
        <SubSection title="Pitch system" hint="Your full system as written: research fields, concept recipe, concept gate, hook test." tone="purple">
          <Textarea className="min-h-[220px] font-mono text-xs" value={s.content} onChange={(e) => set('content', e.target.value)} placeholder="Paste pitch-system.md here" data-testid="ugc-system-content" />
        </SubSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <SubSection title="About Jess" hint="The only source for anything personal in a pitch." tone="green">
            <Textarea className="min-h-[120px] text-xs" value={s.about_jess} onChange={(e) => set('about_jess', e.target.value)} />
          </SubSection>
          <SubSection title="Rates" hint="Stored for you. Never sent to the writer, never in a pitch." tone="grey">
            <Textarea className="min-h-[120px] text-xs" value={s.rates} onChange={(e) => set('rates', e.target.value)} />
          </SubSection>
        </div>
        <SubSection title="Templates (exactly as written)" tone="blue">
          <div className="grid gap-3 lg:grid-cols-2">
            {TEMPLATE_KEYS.map((k) => (
              <label key={k} className="text-xs font-medium">{TEMPLATE_LABEL[k]}
                {!s.templates[k]?.trim() && <ToneChip tone="amber" className="ml-1.5">Not loaded</ToneChip>}
                <Textarea className="mt-1 min-h-[100px] text-xs" value={s.templates[k] ?? ''} onChange={(e) => set('templates', { ...s.templates, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </SubSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <SubSection title="Email sign-off" hint="HTML with live links; kept by Copy email." tone="grey">
            <Textarea className="min-h-[90px] font-mono text-xs" value={s.signoff_html} onChange={(e) => set('signoff_html', e.target.value)} />
          </SubSection>
          <SubSection title="Blocked brands" hint="One name or domain per line. Never pitched." tone="red">
            <Textarea className="min-h-[90px] text-xs" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
          </SubSection>
        </div>
        <SubSection title="WhatsApp opener" hint="Your system has no WhatsApp template. This draft is used until you change it." tone="amber"
          action={<label className="flex items-center gap-2 text-xs">Approved <Switch checked={s.whatsapp_template_approved} onCheckedChange={(v) => set('whatsapp_template_approved', v)} /></label>}>
          <Textarea className="min-h-[70px] text-xs" value={s.whatsapp_template} onChange={(e) => set('whatsapp_template', e.target.value)} />
          {!s.whatsapp_template_approved && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Jess to approve. [Brand] and [Product] are filled in for each brand.</p>}
        </SubSection>
        <div className="flex justify-end"><Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save</Button></div>
      </CardContent></Card>
    </div>
  );
}

export function UgcPitchLogPanel({ ownerId, isMember }: { ownerId: string; isMember: boolean }) {
  const log = useUgcPitchLog(isMember);
  const actions = useUgcActions();
  const { toast } = useToast();
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isMember) return <Callout tone="blue" icon={Lock} title="Private to Jess">Her pitch log is visible to her account only.</Callout>;
  const parsed = csv.trim() ? rowsFromCsv(csv) : [];
  const counts = (log.data ?? []).reduce<Record<string, number>>((m, r) => { const k = r.channel ?? 'other'; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  return (
    <Card><CardContent className="space-y-4 p-4 text-sm">
      <SubSection title="Your pitch log" hint="Every brand here is skipped when found again, until its re-pitch date." tone="blue">
        <p data-testid="ugc-log-count"><b>{log.data?.length ?? 0}</b> brands already pitched{Object.keys(counts).length ? ` · ${Object.entries(counts).slice(0, 4).map(([k, n]) => `${n} ${k}`).join(' · ')}` : ''}</p>
      </SubSection>
      <SubSection title="Import" icon={FileUp} tone="green" hint="Paste a CSV export with a Brand column (optional: Website, Instagram, Date, Channel, Outcome, Re-pitch from).">
        <Textarea className="min-h-[110px] font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'Brand,Website,Instagram,Date,Channel,Outcome'} />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" disabled={!parsed.length || busy} onClick={() => void (async () => {
            setBusy(true);
            try { await actions.importPitchLog(ownerId, parsed); toast({ title: `Imported ${parsed.length} rows` }); setCsv(''); }
            catch (e) { toast({ title: 'Not imported', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(false); }
          })()}>Import {parsed.length || ''} rows</Button>
        </div>
      </SubSection>
    </CardContent></Card>
  );
}
