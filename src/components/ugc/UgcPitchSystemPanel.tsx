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
import { logReplaceCounts, rowsFromCsv, rowsFromWorkbook, type PitchLogRow } from '@/lib/ugc/pitchLog';
import { parsePitchSystem, type PitchSystemImport } from '@/lib/ugc/pitchSystemImport';

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
  const [imported, setImported] = useState<PitchSystemImport | null>(null);
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
        <SubSection title="Pitch system" hint="Your full system as written: research fields, concept recipe, concept gate, hook test." tone="purple"
          action={<label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <FileUp className="h-3.5 w-3.5" />Import pitch-system.md
            <input type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden" data-testid="ugc-system-import" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void file.text().then((md) => {
                const r = parsePitchSystem(md);
                /* Her export wins over what is here; anything it does not cover is left as it was. Nothing is saved until Save. */
                setS((x) => ({ ...x, content: r.content, about_jess: r.about_jess || x.about_jess, rates: r.rates || x.rates, signoff_html: r.signoff_html || x.signoff_html, templates: { ...x.templates, ...r.templates } }));
                if (r.blocked_list.length) setBlocked(r.blocked_list.join('\n'));
                setImported(r);
              });
            }} />
          </label>}>
          {imported && (
            <Callout tone={imported.missing.length ? 'amber' : 'green'} className="mb-2" title={`Imported — check it, then Save. ${imported.placed.length} sections placed.`}>
              <span className="text-xs">{imported.placed.map((p) => `${p.heading} → ${p.to}`).join(' · ') || 'No sections recognised; the whole text is kept as your system.'}
                {imported.missing.length > 0 && ` · Not found: ${imported.missing.map((k) => TEMPLATE_LABEL[k]).join(', ')} (paste those below).`}</span>
            </Callout>
          )}
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
  const [upload, setUpload] = useState<{ name: string; rows: PitchLogRow[] } | null>(null);
  const [result, setResult] = useState<{ before: number; after: number; added: number; removed: number; kept: number; bySource: Record<string, number> } | null>(null);
  if (!isMember) return <Callout tone="blue" icon={Lock} title="Private to Jess">Her pitch log is visible to her account only.</Callout>;
  const parsed = csv.trim() ? rowsFromCsv(csv) : [];
  const counts = (log.data ?? []).reduce<Record<string, number>>((m, r) => { const k = r.channel ?? 'other'; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  return (
    <Card><CardContent className="space-y-4 p-4 text-sm">
      <SubSection title="Your pitch log" hint="Every brand here is skipped when found again, until its re-pitch date." tone="blue">
        <p data-testid="ugc-log-count"><b>{log.data?.length ?? 0}</b> brands already pitched{Object.keys(counts).length ? ` · ${Object.entries(counts).slice(0, 4).map(([k, n]) => `${n} ${k}`).join(' · ')}` : ''}</p>
      </SubSection>
      <SubSection title="Upload updated pitch log" icon={FileUp} tone="purple"
        hint="Upload your workbook (.xlsx) any time. It REPLACES this log (same rules as the first import: Pitch Log, Previously Pitched, Brands & Contacts, Chiang Mai Collabs, Agencies & Talent). Brands in it are skipped when found again.">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          <FileUp className="h-3.5 w-3.5" />Choose workbook (.xlsx) or CSV
          <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" data-testid="ugc-log-upload" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setResult(null);
            void (async () => {
              try {
                const rows = /\.csv$/i.test(file.name) ? rowsFromCsv(await file.text()) : rowsFromWorkbook((await (await import('@/lib/ugc/xlsxIO')).readWorkbookSheets(await file.arrayBuffer())));
                if (!rows.length) { setUpload(null); toast({ title: 'No pitched brands found in that file', variant: 'destructive' }); return; }
                setUpload({ name: file.name, rows });
              } catch (err) { setUpload(null); toast({ title: 'Could not read that file', description: edgeErrorMessage(err), variant: 'destructive' }); }
            })();
          }} />
        </label>
        {upload && (
          <div className="mt-2 space-y-1.5 text-xs" data-testid="ugc-log-upload-preview">
            <p><b>{upload.name}</b>: {upload.rows.length} pitched brands found. Now {log.data?.length ?? 0} in your log; replacing changes {(() => { const c = logReplaceCounts(log.data ?? [], upload.rows); return `+${c.added} new, -${c.removed} gone, ${c.kept} kept`; })()}.</p>
            <Button size="sm" disabled={busy} onClick={() => void (async () => {
              setBusy(true);
              try { setResult(await actions.replacePitchLog(ownerId, upload.rows)); setUpload(null); toast({ title: 'Pitch log replaced' }); }
              catch (err) { toast({ title: 'Not replaced — your old log was put back', description: edgeErrorMessage(err), variant: 'destructive' }); } finally { setBusy(false); }
            })()}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Replace my pitch log with these {upload.rows.length}</Button>
          </div>
        )}
        {result && (
          <Callout tone="green" className="mt-2" title="Pitch log replaced">
            <span data-testid="ugc-log-result" className="text-xs">Was {result.before}, now {result.after} · {result.added} new, {result.removed} gone, {result.kept} kept · {Object.entries(result.bySource).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(' · ')}</span>
          </Callout>
        )}
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
