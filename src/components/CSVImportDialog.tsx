import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import {
  IMPORT_FIELDS, IMPORT_FIELD_LABEL, IMPORT_FILE_MAX_BYTES, IMPORT_FILE_MAX_ROWS, IMPORT_BATCH_MAX,
  parseCsv, autoMapColumns, columnLabel, buildImportRows, runImport, outcomeText, problemRows, possibleMatchRows,
  type ParsedCsv, type ColumnMapping, type ImportReport, type ImportRpc, type ImportField, type RowResult,
} from '@/lib/csvLeadImport';

/* ══ CSV IMPORT (2026-10-05, fix/csv-lead-import; docs/pre-sales-certification/csv-import-fix.md) ═══════════════
   Pick a file → match its columns → CHECK (a preview: the server runs every rule and writes nothing) → import.
   ⛔ The server (import_leads) decides validity, duplicates and the owner — always the person importing. This
   screen never decides a row's fate and never sends an owner, status or any field outside the twelve.
   DUPLICATE (same Place ID / phone / Maps listing) never becomes a second lead. POSSIBLE MATCH (same name only →
   imported and flagged; same website, or same name + same postcode / address → held until the person ticks
   "import these too") is shown on its own list and never disappears from the import by itself.
   ⛔ Nobody is contacted: an import creates or fills in lead records only — no WhatsApp, no queue, no campaign,
   no status change. The screen says so before the button is pressed. */

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
  (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>)('import_leads', args);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('pick'); setFile(null); setParsed(null); setMapping(emptyMapping()); setMapNotes([]);
    setError(null); setBusy(false); setProgress(null); setPreview(null); setResult(null); setImportPossible(false);
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
      const m = autoMapColumns(p.headers);
      setParsed(p); setMapping(m.mapping); setMapNotes(m.notes); setStep('map');
    } catch (err) {
      console.error('CSV read error:', err);
      setError('That file could not be read as a CSV. Save it from your spreadsheet as "CSV UTF-8" and try again.');
    }
  };

  const rows = parsed ? buildImportRows(parsed, mapping) : [];

  const runCheck = async (commit: boolean) => {
    if (!parsed || !rows.length) return;
    setBusy(true); setError(null); setProgress({ done: 0, total: rows.length });
    try {
      const rep = await runImport(importRpc, rows, commit, file?.name ?? null, (done, total) => setProgress({ done, total }), commit && importPossible);
      if (commit) {
        setResult(rep); setStep('done');
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

  const owner = isAdmin ? 'you (Paul)' : 'you';
  const held = preview ? preview.counts.held : 0;
  const willAdd = preview ? preview.counts.new + (importPossible ? held : 0) : 0;
  const willFill = preview ? preview.counts.update : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="csv-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import leads from a CSV
          </DialogTitle>
          <DialogDescription>
            New leads are added to your leads, owned by {owner}. Nobody is messaged and nothing is queued.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
          {step === 'pick' && (
            <>
              <div>
                <Label htmlFor="csv-file">CSV file</Label>
                <div className="mt-2">
                  <Input ref={fileInputRef} id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full min-w-0" data-testid="csv-choose">
                    <Upload className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{file ? file.name : 'Choose CSV file…'}</span>
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Needed:</strong> a business name, and a phone number or an email.</p>
                <p><strong>Also read if present:</strong> contact person, website, address, postcode, town, trade / category, notes, Google Maps link, Google Place ID. You can match the columns on the next step.</p>
                <p>Up to {IMPORT_FILE_MAX_ROWS.toLocaleString()} rows. From Excel or Google Sheets, save as "CSV UTF-8".</p>
              </div>
            </>
          )}

          {step === 'map' && parsed && (
            <>
              <p className="text-sm" data-testid="csv-detected"><strong>{parsed.records.length.toLocaleString()}</strong> row{parsed.records.length === 1 ? '' : 's'} found in <span className="break-all">{file?.name}</span>. Check the columns, then press Check rows.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2" data-testid="csv-mapping">
                {IMPORT_FIELDS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="w-32 shrink-0 text-muted-foreground">{IMPORT_FIELD_LABEL[f]}{f === 'business_name' ? ' *' : ''}</span>
                    <select
                      className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                      value={mapping[f] ?? ''}
                      onChange={(e) => setField(f, e.target.value)}
                      aria-label={IMPORT_FIELD_LABEL[f]}
                      data-field={f}
                    >
                      <option value="">— not imported —</option>
                      {parsed.headers.map((_, i) => <option key={i} value={i}>{columnLabel(parsed.headers, i)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {mapNotes.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">{mapNotes.map((n) => <li key={n}>{n}</li>)}</ul>
              )}
              {mapping.business_name == null && (
                <p className="text-xs text-destructive">Choose the column that holds the business name.</p>
              )}
              {mapping.business_name != null && mapping.phone == null && mapping.email == null && (
                <p className="text-xs text-destructive">Choose a phone or an email column — every lead needs one of them.</p>
              )}
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <CountGrid items={[
                ['Rows detected', preview.counts.rows], ['Valid', preview.counts.valid], ['Invalid', preview.counts.invalid],
                ['Duplicates', preview.counts.duplicate_in_file + preview.counts.existing], ['Possible matches', preview.counts.possible_match],
                ['New', preview.counts.new], ['Fill in blanks', preview.counts.update], ['Held', held],
              ]} />
              {preview.stopped && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" />
                  <AlertDescription>Rows {preview.stopped.fromRow}–{preview.stopped.toRow} could not be checked: {preview.stopped.message}</AlertDescription>
                </Alert>
              )}
              <p className="text-sm">
                {willAdd > 0 ? <><strong>{willAdd}</strong> new lead{willAdd === 1 ? '' : 's'} will be added, owned by {owner}. </> : 'No new leads to add. '}
                {willFill > 0 && <><strong>{willFill}</strong> of your existing leads will have blank details filled in (nothing is overwritten). </>}
                Nobody is messaged, nothing is queued and no status changes.
              </p>
              <p className="text-xs text-muted-foreground" data-testid="csv-dup-explainer">
                <strong>Duplicate</strong> = the same Google Place ID, phone number or Google Maps listing as a lead already in the system (or an earlier row): no second lead is made.
                {' '}<strong>Possible match</strong> = weaker evidence, such as the same business name — many businesses share a name across towns, so these are added and flagged.
              </p>
              {held > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-amber-500/50 p-2 text-sm" data-testid="csv-held">
                  <input type="checkbox" className="mt-1" checked={importPossible} onChange={(e) => setImportPossible(e.target.checked)} />
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
              <Alert data-testid="csv-import-result">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  {result.counts.created} lead{result.counts.created === 1 ? '' : 's'} added{result.counts.updated ? `, ${result.counts.updated} filled in` : ''}.
                  {' '}{result.counts.invalid + result.counts.duplicate_in_file + result.counts.skipped + result.counts.failed + result.counts.held > 0
                    ? `${result.counts.invalid + result.counts.duplicate_in_file + result.counts.skipped + result.counts.failed + result.counts.held} row(s) not added — listed below.`
                    : 'Every row was added.'}
                </AlertDescription>
              </Alert>
              {result.stopped && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The import stopped at row {result.stopped.fromRow}: {result.stopped.message} Rows {result.stopped.fromRow}–{result.stopped.toRow} were NOT imported.
                    Everything before row {result.stopped.fromRow} was. Importing the same file again adds only what is missing.
                  </AlertDescription>
                </Alert>
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
            <p className="text-xs text-muted-foreground" data-testid="csv-progress">Working… {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows</p>
          )}
          {error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription data-testid="csv-error">{error}</AlertDescription></Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'done' ? (
            <Button onClick={() => handleClose(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => (step === 'preview' ? setStep('map') : handleClose(false))} disabled={busy}>
                {step === 'preview' ? 'Back' : 'Cancel'}
              </Button>
              {step === 'map' && (
                <Button onClick={() => runCheck(false)} disabled={busy || mapping.business_name == null || (mapping.phone == null && mapping.email == null)} data-testid="csv-check">
                  {busy ? 'Checking…' : `Check ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`}
                </Button>
              )}
              {step === 'preview' && (
                <Button onClick={() => runCheck(true)} disabled={busy || willAdd + willFill === 0} data-testid="csv-import">
                  {busy ? 'Importing…' : willAdd + willFill === 0 ? 'Nothing to import' : `Import ${willAdd} new${willFill ? ` + fill ${willFill}` : ''}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountGrid({ items }: { items: Array<[string, number]> }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${items.length === 5 ? 'sm:grid-cols-5' : items.length === 6 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`} data-testid="csv-counts">
      {items.map(([label, n]) => (
        <div key={label} className="rounded-md border px-2 py-1.5">
          <div className="text-lg font-semibold leading-tight">{n.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

function RowList({ title, rows, isAdmin, testId, tone }: { title: string; rows: RowResult[]; isAdmin: boolean; testId: string; tone?: 'amber' }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs font-medium mb-1">{title} ({rows.length})</p>
      <ul className={`max-h-56 overflow-y-auto rounded-md border divide-y text-xs ${tone === 'amber' ? 'border-amber-500/50' : ''}`} data-testid={testId}>
        {rows.map((r) => (
          <li key={`${r.row}-${r.i}`} className="px-2 py-1.5 flex gap-2 min-w-0">
            <span className="shrink-0 w-14 text-muted-foreground">Row {r.row}</span>
            <span className="min-w-0 flex-1">
              {r.business_name ? <span className="font-medium break-words">{r.business_name}: </span> : null}
              <span className={r.outcome === 'invalid' || r.outcome === 'failed' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{outcomeText(r, isAdmin)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
