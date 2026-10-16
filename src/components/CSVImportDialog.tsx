import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Info, Loader2, ListChecks, AlertTriangle } from 'lucide-react';
import { ActionBar, Callout, DialogHero, Figure, SubSection, TONE, type Tone } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignActions } from '@/hooks/useMyCampaigns';
import { planTradeCampaigns, tradePlanSummary, runImportPerTrade } from '@/lib/importCampaignPlan';
import { campaignErrorText } from '@/lib/campaignRules';
import { CampaignPicker } from '@/components/CampaignPicker';
import { useCountrySettings } from '@/hooks/useCountrySettings';
import { ReadinessSummaryBlock } from '@/components/LeadReadiness';
import { leadReadiness, readinessLeadFromImport, summariseReadiness } from '@/lib/leadReadiness';
import {
  IMPORT_FIELDS, IMPORT_FILE_MAX_BYTES, IMPORT_FILE_MAX_ROWS, IMPORT_BATCH_MAX,
  IMPORT_BATCH_NAME_MAX, withDefaultTrade, withImportCountry, countsByCountry, IMPORT_COUNTRIES, type ImportCountry,
  isResearchFile, buildResearchRows, batchFromFileName, RESEARCH_FILE_DEFAULT_TRADE,
  parseCsv, autoMapSimple, fileWarnings, FILE_FIELDS, FILE_FIELD_LABEL, columnLabel, buildImportRows, runImport, outcomeText, problemRows, possibleMatchRows,
  type ParsedCsv, type ColumnMapping, type ImportReport, type ImportRpc, type ImportField, type RowResult,
} from '@/lib/csvLeadImport';

/* ══ CSV IMPORT (2026-10-05, fix/csv-lead-import; docs/pre-sales-certification/csv-import-fix.md) ═══════════════
   Pick a file → match its columns → CHECK (a preview: the server runs every rule and writes nothing) → import.
   ⛔ The server (import_leads) decides validity, duplicates and the owner — always the person importing. This
   screen never decides a row's fate and never sends an owner, status or any field outside the thirteen (country is optional).
   DUPLICATE (same Place ID / phone / Maps listing) never becomes a second lead. POSSIBLE MATCH (same name only →
   imported and flagged; same website, or same name + same postcode / address → held until the person ticks
   "import these too") is shown on its own list and never disappears from the import by itself.
   ⛔ Nobody is contacted: an import creates or fills in lead records only — no WhatsApp, no queue, no launch,
   no status change (joining the chosen campaign sends nothing). The screen says so before the button is pressed.
   2026-10-14 (test day, import_leads_v2): a BATCH NAME on every new lead (Outreach search finds it), a TRADE typed once
   for the rows with none, and — admin only — the OWNER of the new leads (an active teammate; one notice to them, never
   one per lead). The server still decides; a salesperson's import is always their own.
   2026-10-14 (import_leads_v3): a REQUIRED campaign — an existing one or a new one made here (the shared campaign form).
   Every NEW lead joins it on the server (lead_set_campaign); filled-in existing leads keep theirs. Joining a campaign
   queues and sends nothing. */

export interface CsvImportResult {
  createdIds: string[];
  updatedIds: string[];
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a real import with the ids of the leads it created / filled in (the page refreshes; the admin's
   *  town check runs on the created ones). */
  onImported: (result: CsvImportResult) => Promise<void> | void;
  isAdmin: boolean;
}

type Step = 'pick' | 'map' | 'preview' | 'done';

const importRpc: ImportRpc = (args) =>
  (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>)('import_leads_v4', args);

const emptyMapping = () => Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;

export function CSVImportDialog({ open, onOpenChange, onImported, isAdmin }: CSVImportDialogProps) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping);
  const [mapNotes, setMapNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [importPossible, setImportPossible] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [defaultTrade, setDefaultTrade] = useState('');
  const [importCountry, setImportCountry] = useState<ImportCountry | ''>(''); // '' = worked out from each row
  const [research, setResearch] = useState(false); // a researched lead file (Ethan's format) — rows built by buildResearchRows
  const [assignTo, setAssignTo] = useState(''); // '' = the person importing
  const [campaignId, setCampaignId] = useState<string | null>(null); // required — the campaign every new lead joins
  const { campaigns } = useCampaigns();
  const campaignActions = useCampaignActions();
  const [townsChecked, setTownsChecked] = useState(false); // 2026-10-16: default OFF — towns in the file were checked by the researcher
  const [perTrade, setPerTrade] = useState(false); // 2026-10-16: one WhatsApp campaign per trade, named exactly the trade
  const qc = useQueryClient();
  const { user } = useAuth();
  const team = useTeamDirectory();
  const teammates = isAdmin ? (team.data ?? []).filter((m) => m.status === 'active' && m.role && m.user_id !== user?.id) : [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('pick'); setFile(null); setParsed(null); setMapping(emptyMapping()); setMapNotes([]);
    setError(null); setBusy(false); setProgress(null); setPreview(null); setResult(null); setImportPossible(false);
    setBatchName(''); setDefaultTrade(''); setAssignTo(''); setImportCountry(''); setResearch(false); setCampaignId(null); setPerTrade(false); setTownsChecked(false);
    setRowEdits({}); setEditRow(null); setReadyOnly(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (next) return;
    if (busy) return; // never abandon a running import half-reported
    reset();
    onOpenChange(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    reset();
    setFile(f);
    if (f.size > IMPORT_FILE_MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The most is ${IMPORT_FILE_MAX_BYTES / 1024 / 1024} MB — split it into smaller files.`);
      return;
    }
    try {
      const p = parseCsv(await f.text());
      if (!p.headers.length) { setError('That file is empty.'); return; }
      if (!p.records.length) { setError('The file has a header row but no rows under it.'); return; }
      if (p.records.length > IMPORT_FILE_MAX_ROWS) {
        setError(`That file has ${p.records.length.toLocaleString()} rows. The most in one import is ${IMPORT_FILE_MAX_ROWS.toLocaleString()} — split it into smaller files.`);
        return;
      }
      const m = autoMapSimple(p.headers);
      setParsed(p); setMapping(m.mapping); setMapNotes(m.notes); setStep('map');
      /* 2026-10-14: a researched lead file is read by its own rule (csvLeadImport.ts buildResearchRows). Its batch name
         defaults to the file name and its trade to Language schools — both still editable. Other files: as before. */
      if (isResearchFile(p.headers)) {
        setResearch(true);
        setBatchName(batchFromFileName(f.name));
        setDefaultTrade(RESEARCH_FILE_DEFAULT_TRADE);
        setMapNotes(['Recognised a researched lead file. Name, country, city, website, WhatsApp number and owner are read automatically. Hypothesis, website evidence and offer become the "Why this lead" note; the other research columns are kept on the lead. "Not established" counts as empty.']);
      }
    } catch (err) {
      console.error('CSV read error:', err);
      setError('That file could not be read as a CSV. Save it from your spreadsheet as "CSV UTF-8" and try again.');
    }
  };

  /* 2026-10-14: the file's country fills a blank Country (a row's own always wins); phones are read in that country. */
  const builtRows = parsed ? withImportCountry(withDefaultTrade(research ? buildResearchRows(parsed) : buildImportRows(parsed, mapping), defaultTrade), importCountry || null) : [];

  /* ── READINESS (2026-10-15, src/lib/leadReadiness.ts) ─────────────────────────────────────────────────────────
     After the check: of the rows that will be ADDED, how many are ready for an audit and a message, and what the rest
     need, grouped, with names. A name, town or number can be fixed here (the edit rides in the import; the server
     re-checks it on import), and "Import only the ready ones" leaves the others out. Nothing here decides a duplicate. */
  const { settings: countrySettings } = useCountrySettings();
  const [rowEdits, setRowEdits] = useState<Record<number, { business_name?: string; town?: string; phone?: string }>>({});
  const [editRow, setEditRow] = useState<number | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const rows = builtRows.map((r) => {
    const e = rowEdits[r.row];
    if (!e) return r;
    const out = { ...r };
    for (const [k, v] of Object.entries(e)) if (String(v ?? '').trim()) (out as Record<string, unknown>)[k] = String(v).trim();
    return out;
  });
  const importReadiness = useMemo(() => {
    if (!preview) return null;
    const outcome = new Map(preview.rows.map((r) => [r.row, r]));
    const adding = rows.filter((r) => {
      const o = outcome.get(r.row);
      return !!o && (o.outcome === 'new' || (o.outcome === 'held' && importPossible));
    });
    const list = adding.map((r) => ({
      row: r.row,
      name: r.business_name || `Row ${r.row}`,
      readiness: leadReadiness(readinessLeadFromImport(r, outcome.get(r.row)?.country ?? null, batchName), { countrySettings }),
    }));
    return { list, summary: summariseReadiness(list), notReady: new Set(list.filter((x) => !x.readiness.ok).map((x) => x.row)) };
  }, [preview, rows, importPossible, batchName, countrySettings]);

  const runCheck = async (commit: boolean) => {
    if (!parsed || !rows.length) return;
    setBusy(true); setError(null); setProgress({ done: 0, total: rows.length });
    try {
      const sendRows = commit && readyOnly && importReadiness ? rows.filter((r) => !importReadiness.notReady.has(r.row)) : rows;
      const tags = { assignTo: isAdmin && assignTo ? assignTo : null, batch: batchName, townsChecked };
      let rep;
      if (commit && perTradeOn) {
        /* Make (or reuse) each trade's campaign FIRST. If one cannot be made, nothing is imported. */
        const plan = planTradeCampaigns(sendRows, campaigns, user?.id);
        const ids = new Map<string, string>();
        for (const g of plan.groups) {
          if (g.existingId) { ids.set(g.key, g.existingId); continue; }
          const made = await campaignActions.create({ name: g.name, trade: g.name, method: 'whatsapp' });
          if (!made.ok || !made.id) { setError(`The campaign "${g.name}" could not be made: ${campaignErrorText(String(made.error ?? ''))} Nothing was imported.`); return; }
          ids.set(g.key, String(made.id));
        }
        rep = await runImportPerTrade({ rpc: importRpc, rows: sendRows, plan, fileName: file?.name ?? null, campaignIds: ids, fallbackCampaignId: campaignId,
          importPossible, tags, onProgress: (done, total) => setProgress({ done, total }) });
      } else {
        rep = await runImport(importRpc, sendRows, commit, file?.name ?? null, (done, total) => setProgress({ done, total }), commit && importPossible, { ...tags, campaignId });
      }
      if (commit) {
        setResult(rep); setStep('done');
        if (rep.joinedCampaign) {
          /* The campaign's counts and lead list re-read (Manage campaigns, the campaign page). */
          void qc.invalidateQueries({ queryKey: ['my-campaigns'] });
          void qc.invalidateQueries({ queryKey: ['campaign-detail'] });
          void qc.invalidateQueries({ queryKey: ['campaign-leads'] });
        }
        if (rep.createdIds.length || rep.updatedIds.length) {
          await onImported({ createdIds: rep.createdIds, updatedIds: rep.updatedIds });
        }
      } else {
        setPreview(rep);
        if (rep.stopped && !rep.rows.length) setError(rep.stopped.message);
        else setStep('preview');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(commit ? 'The import stopped. Check Outreach before trying again — rows already imported will show as "Already in your leads".' : 'The check could not run. Try again.');
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const setField = (f: ImportField, v: string) => setMapping((m) => {
    const idx = v === '' ? null : Number(v);
    const next = { ...m };
    // A column feeds one field: taking it here releases it elsewhere.
    if (idx != null) for (const k of IMPORT_FIELDS) if (next[k] === idx) next[k] = null;
    next[f] = idx;
    return next;
  });

  const owner = isAdmin && assignTo ? (team.byId.get(assignTo)?.display_name ?? 'that teammate') : isAdmin ? 'you (Paul)' : 'you';
  const perTradeOn = perTrade && !research && mapping.trade != null;
  const tradePlan = useMemo(() => (perTradeOn ? planTradeCampaigns(rows, campaigns, user?.id) : null), [perTradeOn, rows, campaigns, user?.id]);
  const campaign = campaignId ? campaigns.find((c) => c.id === campaignId) ?? null : null;
  /* A campaign launch messages only its OWNER's leads (docs/campaigns.md): say so when the new leads belong to someone else. */
  const leadOwnerId = isAdmin && assignTo ? assignTo : user?.id;
  const ownerMismatch = !!campaign && !!leadOwnerId && campaign.created_by !== leadOwnerId;
  const held = preview ? preview.counts.held : 0;
  const willAdd = preview ? preview.counts.new + (importPossible ? held : 0) : 0;
  const willFill = preview ? preview.counts.update : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto" data-testid="csv-import-dialog">
        <DialogHero
          icon={FileSpreadsheet}
          tone="blue"
          title="Import leads from a CSV"
          subtitle={<>New leads are added to your leads, owned by {owner}. Nobody is messaged and nothing is queued.</>}
        />

        <div className="space-y-4 min-w-0">
          {step === 'pick' && (
            <>
              <div>
                <Label htmlFor="csv-file" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CSV file</Label>
                <div className="mt-2">
                  <Input ref={fileInputRef} id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="h-12 w-full min-w-0 rounded-xl border-dashed border-blue-500/40 bg-blue-500/[0.04] hover:bg-blue-500/10" data-testid="csv-choose">
                    <Upload className={cn('h-4 w-4 mr-2 shrink-0', TONE.blue.text)} />
                    <span className="truncate">{file ? file.name : 'Choose CSV file…'}</span>
                  </Button>
                </div>
              </div>
              <Callout tone="blue" icon={Info}>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong className="text-foreground">Needed:</strong> business name, WhatsApp / mobile number, trade / category and town.</p>
                  <p><strong className="text-foreground">Also read if present:</strong> country, website, contact person. Any other column is ignored.</p>
                  <p>Up to {IMPORT_FILE_MAX_ROWS.toLocaleString()} rows. From Excel or Google Sheets, save as "CSV UTF-8".</p>
                </div>
              </Callout>
            </>
          )}

          {step === 'map' && parsed && (
            <>
              <p className="text-sm break-words" data-testid="csv-detected"><strong>{parsed.records.length.toLocaleString()}</strong> row{parsed.records.length === 1 ? '' : 's'} found in <span className="break-all">{file?.name}</span>. Check the columns, then press Check rows.</p>
              {!research && <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2" data-testid="csv-mapping">
                {FILE_FIELDS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="w-28 sm:w-32 shrink-0 break-words text-muted-foreground">{FILE_FIELD_LABEL[f]}{f === 'business_name' || f === 'phone' ? ' *' : ''}</span>
                    <select
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border/70 bg-background px-2 text-sm"
                      value={mapping[f] ?? ''}
                      onChange={(e) => setField(f, e.target.value)}
                      aria-label={FILE_FIELD_LABEL[f]}
                      data-field={f}
                    >
                      <option value="">— not imported —</option>
                      {parsed.headers.map((_, i) => <option key={i} value={i}>{columnLabel(parsed.headers, i)}</option>)}
                    </select>
                  </label>
                ))}
              </div>}
              <SubSection title="Tag this import" icon={ListChecks} tone="grey">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2" data-testid="csv-tags">
                  <div className="flex flex-col gap-1 text-sm min-w-0 sm:col-span-2">
                    <span className="text-muted-foreground">Add to campaign *</span>
                    <CampaignPicker mode="assign" value={campaignId} onChange={setCampaignId} requiredPlaceholder="Choose a campaign, or New campaign…" className="h-9 w-full min-w-0" testId="csv-campaign" />
                    {ownerMismatch && (
                      <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="csv-campaign-owner-note">This campaign belongs to someone else. The leads still join it, but launching it only messages its owner's leads.</span>
                    )}
                  </div>
                  {!research && mapping.trade != null && (
                    <div className="sm:col-span-2 space-y-1" data-testid="csv-per-trade">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={perTrade} onChange={(e) => setPerTrade(e.target.checked)} data-testid="csv-per-trade-toggle" />
                        Create a campaign for each trade (WhatsApp)
                      </label>
                      {perTradeOn && tradePlan && (
                        <p className="text-xs text-muted-foreground" data-testid="csv-per-trade-summary">
                          {tradePlanSummary(tradePlan, campaign?.name ?? null)} Nothing is queued or sent.
                        </p>
                      )}
                    </div>
                  )}
                  <label className="flex flex-col gap-1 text-sm min-w-0">
                    <span className="text-muted-foreground">Batch name</span>
                    <Input value={batchName} maxLength={IMPORT_BATCH_NAME_MAX} onChange={(e) => setBatchName(e.target.value)} placeholder="Left blank, the file name is used" data-testid="csv-batch" />
                  </label>
                  <div className="sm:col-span-2 space-y-1" data-testid="csv-towns-checked-row">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={townsChecked} onChange={(e) => setTownsChecked(e.target.checked)} data-testid="csv-towns-checked" />
                      Towns in this file were checked by the researcher
                    </label>
                    <p className="text-xs text-muted-foreground">Ticked: a real town in the file is saved as confirmed, so the AI audit uses it as it is. A blank town, &ldquo;Online&rdquo; or &ldquo;Not established&rdquo; stays blocked. Unticked: nothing changes.</p>
                  </div>
                  {(research || mapping.trade == null) && (
                    <label className="flex flex-col gap-1 text-sm min-w-0">
                      <span className="text-muted-foreground">{research ? 'Trade for rows with none' : 'Trade for the whole file'}</span>
                      <Input value={defaultTrade} maxLength={100} onChange={(e) => setDefaultTrade(e.target.value)} placeholder="e.g. Plumbers" data-testid="csv-trade" />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-sm min-w-0">
                    <span className="text-muted-foreground">Country of these leads</span>
                    <select className="h-9 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-sm" value={importCountry}
                      onChange={(e) => setImportCountry(e.target.value as ImportCountry | '')} aria-label="Country of these leads" data-testid="csv-country">
                      <option value="">Work it out from each row</option>
                      {IMPORT_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  {isAdmin && (
                    <label className="flex flex-col gap-1 text-sm min-w-0">
                      <span className="text-muted-foreground">New leads belong to</span>
                      <select className="h-9 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-sm" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="New leads belong to" data-testid="csv-owner">
                        <option value="">Me (Paul)</option>
                        {teammates.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Search the batch name in Outreach to see just this import. A row's own country always wins. Phone numbers are read in the row's country (Malaysia 012-345 6789 → +60, Singapore 9123 4567 → +65).</p>
              </SubSection>
              {mapNotes.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">{mapNotes.map((n) => <li key={n}>{n}</li>)}</ul>
              )}
              {campaignId == null && (
                <p className="text-xs text-destructive">Choose the campaign these leads go into.</p>
              )}
              {!research && fileWarnings(mapping, !!defaultTrade.trim()).map((w) => (
                <p key={w} className="text-xs text-destructive" data-testid="csv-warning">{w}</p>
              ))}
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <CountGrid items={[
                ['Rows detected', preview.counts.rows], ['Valid', preview.counts.valid], ['Invalid', preview.counts.invalid],
                ['Duplicates', preview.counts.duplicate_in_file + preview.counts.existing], ['Possible matches', preview.counts.possible_match],
                ['New', preview.counts.new], ['Fill in blanks', preview.counts.update], ['Held', held],
              ]} />
              <CountryCounts rows={preview.rows} />
              {importReadiness && importReadiness.list.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-border/60 p-3" data-testid="csv-readiness">
                  <ReadinessSummaryBlock summary={importReadiness.summary} testId="csv-readiness-summary"
                    onFixName={(name) => { const x = importReadiness.list.find((q) => q.name === name); if (x) setEditRow(x.row); }} />
                  {editRow != null && (() => {
                    const r = rows.find((q) => q.row === editRow);
                    if (!r) return null;
                    const set = (k: 'business_name' | 'town' | 'phone', v: string) => setRowEdits((p) => ({ ...p, [editRow]: { ...p[editRow], [k]: v } }));
                    return (
                      <div className="grid gap-2 sm:grid-cols-3" data-testid="csv-fix-row">
                        <Input aria-label="Business name" placeholder="Business name" value={rowEdits[editRow]?.business_name ?? r.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} />
                        <Input aria-label="Town" placeholder="Town" value={rowEdits[editRow]?.town ?? r.town ?? ''} onChange={(e) => set('town', e.target.value)} />
                        <Input aria-label="Phone" placeholder="Mobile number" value={rowEdits[editRow]?.phone ?? r.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
                        <p className="text-[11px] text-muted-foreground sm:col-span-2">Row {editRow}. The change goes in with the import; press Check again to re-run the duplicate check on it.</p>
                        <Button size="sm" variant="outline" onClick={() => setEditRow(null)}>Done</Button>
                      </div>
                    );
                  })()}
                  {importReadiness.summary.needs > 0 && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm" data-testid="csv-ready-only">
                      <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} />
                      Import only the ready ones ({importReadiness.summary.ready})
                    </label>
                  )}
                </div>
              )}
              {preview.stopped && (
                <Callout tone="red" icon={AlertCircle}>
                  Rows {preview.stopped.fromRow}–{preview.stopped.toRow} could not be checked: {preview.stopped.message}
                </Callout>
              )}
              <p className="text-sm break-words">
                {willAdd > 0 ? <><strong>{willAdd}</strong> new lead{willAdd === 1 ? '' : 's'} will be added, owned by {owner}, {perTradeOn && tradePlan ? <>into: {tradePlanSummary(tradePlan, campaign?.name ?? null)} </> : <>into the campaign <strong>{campaign?.name ?? 'you chose'}</strong>. </>}</> : 'No new leads to add. '}
                {willFill > 0 && <><strong>{willFill}</strong> of your existing leads will have blank details filled in (nothing is overwritten; they keep their campaign). </>}
                Nobody is messaged, nothing is queued and no status changes.
              </p>
              <p className="text-xs text-muted-foreground" data-testid="csv-dup-explainer">
                <strong>Duplicate</strong> = the same Google Place ID, phone number or Google Maps listing as a lead already in the system (or an earlier row): no second lead is made.
                {' '}<strong>Possible match</strong> = weaker evidence, such as the same business name — many businesses share a name across towns, so these are added and flagged.
              </p>
              {held > 0 && (
                <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm', TONE.amber.tint)} data-testid="csv-held">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-amber-500" checked={importPossible} onChange={(e) => setImportPossible(e.target.checked)} />
                  <span>
                    Also import the <strong>{held}</strong> held possible match{held === 1 ? '' : 'es'} (same website, or same name and the same postcode or address).
                    Tick only if you have checked they are different businesses — for example another branch.
                  </span>
                </label>
              )}
              {rows.length > IMPORT_BATCH_MAX && (
                <p className="text-xs text-muted-foreground">Checked in parts of {IMPORT_BATCH_MAX}. A business repeated across two parts shows here twice and is added once.</p>
              )}
              <RowList title="Possible matches" rows={possibleMatchRows(preview.rows)} isAdmin={isAdmin} testId="csv-possible" tone="amber" />
              <RowList title="Duplicates and rows not added" rows={problemRows(preview.rows)} isAdmin={isAdmin} testId="csv-problems" />
            </>
          )}

          {step === 'done' && result && (
            <>
              <Callout tone="green" icon={CheckCircle2} testId="csv-import-result">
                <>
                  {result.counts.created} lead{result.counts.created === 1 ? '' : 's'} added{result.joinedCampaign ? (perTradeOn ? ' to their trade campaigns' : ` to the campaign ${campaign?.name ?? ''}`.trimEnd()) : ''}{result.counts.updated ? `, ${result.counts.updated} filled in` : ''}.
                  {' '}{result.counts.invalid + result.counts.duplicate_in_file + result.counts.skipped + result.counts.failed + result.counts.held > 0
                    ? `${result.counts.invalid + result.counts.duplicate_in_file + result.counts.skipped + result.counts.failed + result.counts.held} row(s) not added — listed below.`
                    : 'Every row was added.'}
                </>
              </Callout>
              {result.stopped && (
                <Callout tone="red" icon={AlertCircle}>
                  The import stopped at row {result.stopped.fromRow}: {result.stopped.message} Rows {result.stopped.fromRow}–{result.stopped.toRow} were NOT imported.
                  Everything before row {result.stopped.fromRow} was. Importing the same file again adds only what is missing.
                </Callout>
              )}
              <CountGrid items={[
                ['Added', result.counts.created], ['Filled in', result.counts.updated], ['Duplicates', result.counts.skipped + result.counts.duplicate_in_file],
                ['Held', result.counts.held], ['Invalid', result.counts.invalid], ['Failed', result.counts.failed],
              ]} />
              <RowList title="Possible matches" rows={possibleMatchRows(result.rows)} isAdmin={isAdmin} testId="csv-possible" tone="amber" />
              <RowList title="Duplicates and rows not added" rows={problemRows(result.rows)} isAdmin={isAdmin} testId="csv-problems" />
            </>
          )}

          {progress && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="csv-progress"><Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', TONE.blue.text)} />Working… {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows</p>
          )}
          {error && (
            <Callout tone="red" icon={AlertCircle}><span data-testid="csv-error">{error}</span></Callout>
          )}
        </div>

        <ActionBar sticky>
          {step === 'done' ? (
            <Button onClick={() => handleClose(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => (step === 'preview' ? setStep('map') : handleClose(false))} disabled={busy}>
                {step === 'preview' ? 'Back' : 'Cancel'}
              </Button>
              {step === 'map' && (
                <Button onClick={() => runCheck(false)} disabled={busy || campaignId == null || !research && (mapping.business_name == null || mapping.phone == null)} data-testid="csv-check">
                  {busy ? 'Checking…' : `Check ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`}
                </Button>
              )}
              {step === 'preview' && (
                <Button onClick={() => runCheck(true)} disabled={busy || campaignId == null || willAdd + willFill === 0} data-testid="csv-import">
                  {busy ? 'Importing…' : willAdd + willFill === 0 ? 'Nothing to import' : `Import ${readyOnly && importReadiness ? Math.max(0, willAdd - importReadiness.notReady.size) : willAdd} new${willFill ? ` + fill ${willFill}` : ''}`}
                </Button>
              )}
            </>
          )}
        </ActionBar>
      </DialogContent>
    </Dialog>
  );
}

/* Colour carries meaning only (operator/ui tones): money/added = green (teal), held/possible = amber,
   invalid/failed = red, everything else neutral. A tone lights up only when its count is above zero. */
const COUNT_TONE: Record<string, Tone> = {
  New: 'green', Added: 'green', 'Fill in blanks': 'blue', 'Filled in': 'blue',
  'Possible matches': 'amber', Held: 'amber', Invalid: 'red', Failed: 'red',
};

function CountGrid({ items }: { items: Array<[string, number]> }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${items.length === 5 ? 'sm:grid-cols-5' : items.length === 6 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`} data-testid="csv-counts">
      {items.map(([label, n]) => (
        <Figure key={label} label={label} value={n.toLocaleString()} tone={COUNT_TONE[label] ?? 'grey'} strong={n > 0 && !!COUNT_TONE[label]} />
      ))}
    </div>
  );
}

/** The preview by country (2026-10-14): rows, how many will be added, and the numbers that could not be read there. */
function CountryCounts({ rows }: { rows: RowResult[] }) {
  const by = countsByCountry(rows);
  if (!by.length) return null;
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs ring-1 ring-inset ring-border/40" data-testid="csv-by-country">
      <span className="font-medium">By country: </span>
      {by.map((c, i) => (
        <span key={c.country}>
          {i > 0 && ' · '}
          {c.country} {c.rows} row{c.rows === 1 ? '' : 's'} ({c.adding} to add{c.unreadablePhones ? <>, <span className="text-destructive font-medium">{c.unreadablePhones} number{c.unreadablePhones === 1 ? '' : 's'} could not be read</span></> : null})
        </span>
      ))}
    </div>
  );
}

function RowList({ title, rows, isAdmin, testId, tone }: { title: string; rows: RowResult[]; isAdmin: boolean; testId: string; tone?: 'amber' }) {
  if (!rows.length) return null;
  return (
    <SubSection title={`${title} (${rows.length})`} icon={tone === 'amber' ? AlertTriangle : ListChecks} tone={tone === 'amber' ? 'amber' : 'grey'}>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 divide-y divide-border/50 text-xs" data-testid={testId}>
        {rows.map((r) => (
          <li key={`${r.row}-${r.i}`} className="px-3 py-2 flex gap-2 min-w-0">
            <span className="shrink-0 w-14 tabular-nums text-muted-foreground">Row {r.row}</span>
            <span className="min-w-0 flex-1 break-words">
              {r.business_name ? <span className="font-medium break-words">{r.business_name}: </span> : null}
              <span className={r.outcome === 'invalid' || r.outcome === 'failed' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{outcomeText(r, isAdmin)}</span>
            </span>
          </li>
        ))}
      </ul>
    </SubSection>
  );
}
