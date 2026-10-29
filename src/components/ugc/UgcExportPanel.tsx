import { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Callout, EmptyState, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { useUgcActions, type UgcBrand } from '@/hooks/useUgc';
import type { BrandView } from '@/lib/ugc/brandView';
import { EXPORT_SHEET_NAME, exportFileName, exportRows, isExportable, sheetDate, splitExport, toCsv } from '@/lib/ugc/leadExport';
import { researchGaps } from '@/lib/ugc/research';

/* STEP 4 — EXPORT. The UGC page is a lead source: researched brands leave as rows in the layout of the
   "Brands & Contacts" tab of Jess's workbook (xlsx or CSV). Exported brands are marked with the date and are not
   exported twice unless asked. Nothing is sent. */

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function UgcExportPanel({ rows }: { rows: { brand: UgcBrand; view: BrandView }[] }) {
  const actions = useUgcActions();
  const { toast } = useToast();
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const ready = useMemo(() => rows.filter((r) => isExportable(r.brand, r.view.tier)), [rows]);
  const split = splitExport(ready, again);
  const notYet = rows.filter((r) => r.brand.track === 'brand' && !r.view.hidden && !isExportable(r.brand, r.view.tier)).length;

  const items = () => split.export.map((r) => ({ brand: r.brand, ctx: { tier: r.view.tier, contact: r.view.contact, wa: r.view.wa.filter((w) => w.worthTrying) } }));
  const run = async (kind: 'xlsx' | 'csv') => {
    if (!split.export.length) return;
    setBusy(kind);
    try {
      const table = exportRows(items());
      if (kind === 'csv') download(exportFileName(new Date(), 'csv'), toCsv(table), 'text/csv;charset=utf-8');
      else {
        const { buildXlsx } = await import('@/lib/ugc/xlsxIO');
        download(exportFileName(new Date(), 'xlsx'), await buildXlsx(EXPORT_SHEET_NAME, table), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
      const fresh = split.export.filter((r) => !r.brand.exported_at).map((r) => r.brand);
      if (fresh.length) await actions.markExported(fresh);
      toast({ title: `Exported ${split.export.length} brands`, description: fresh.length ? `${fresh.length} marked Exported today.` : 'Already-exported brands were included on request.' });
    } catch (e) { toast({ title: 'Not exported', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4" data-testid="ugc-export">
      <Card><CardContent className="space-y-3 p-4 text-sm">
        <SubSection title="Export ready leads" icon={FileSpreadsheet} tone="green"
          hint="One row per researched brand, in the column layout of the Brands & Contacts tab of your workbook. Source URLs included; unknown is blank.">
          <div className="flex flex-wrap items-center gap-2">
            <ToneChip tone="green">{split.fresh.length} new to export</ToneChip>
            <ToneChip tone="grey">{split.already.length} already exported</ToneChip>
            {notYet > 0 && <ToneChip tone="amber">{notYet} not researched yet</ToneChip>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button disabled={!split.export.length || !!busy} onClick={() => void run('xlsx')} data-testid="ugc-export-xlsx">
              {busy === 'xlsx' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}Export Excel (.xlsx)</Button>
            <Button variant="outline" disabled={!split.export.length || !!busy} onClick={() => void run('csv')} data-testid="ugc-export-csv">
              {busy === 'csv' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}Export CSV</Button>
            <label className="ml-2 flex items-center gap-2 text-xs"><Switch checked={again} onCheckedChange={setAgain} />Include already exported</label>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Exported brands are marked “Exported” with the date. Product, what the brand is pushing and reviews are not columns in your sheet: use “Copy for Claude” on the brand for those.</p>
        </SubSection>
        {!ready.length
          ? <EmptyState icon={CheckCircle2} tone="purple" title="Nothing researched yet." />
          : (
            <ul className="divide-y rounded-xl border text-xs" data-testid="ugc-export-list">
              {ready.map((r) => {
                const gaps = researchGaps(r.brand.research?.verified ?? null);
                return (
                  <li key={r.brand.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0"><b>{r.brand.name}</b> <span className="text-muted-foreground">{r.brand.domain ?? ''}</span></span>
                    <span className="flex items-center gap-1.5">
                      {gaps.length ? <ToneChip tone="amber" title={gaps.join(', ')}>Needs: {gaps.length} field{gaps.length > 1 ? 's' : ''}</ToneChip> : <ToneChip tone="green">Ready</ToneChip>}
                      {r.brand.exported_at ? <ToneChip tone="grey">Exported {sheetDate(r.brand.exported_at)}</ToneChip> : <ToneChip tone="blue">New</ToneChip>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
      </CardContent></Card>
      <Callout tone="blue" title="After you export">Paste the rows into your workbook and pitch from your own sheet and Claude Project. Upload the updated workbook on the Pitch log tab so these brands are skipped next time.</Callout>
    </div>
  );
}
