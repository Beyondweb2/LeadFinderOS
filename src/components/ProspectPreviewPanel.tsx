/* PROSPECT PREVIEW — the operator panel (AI Audit results → "Prospect preview").
   Generate on click only; never automatic, never sends. Shows the audit example, the site issue it
   leads with, the images to download and the suggested message to copy. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { resolveStoredAssets } from '@/lib/prospectPreview/assets';
import { OUTREACH_SEND_LABELS, type OutreachRecommendation } from '@/lib/prospectPreview/recommendation';
import { PREVIEW_ASSETS, PREVIEW_ASSET_LABELS, PREVIEW_STATUS_LABELS, type PreviewStatus, type ProspectHeadline, type CardFinding } from '@/lib/prospectPreview/types';

export const PROSPECT_PREVIEW_LABEL = 'Prospect preview';

interface PreviewView {
  status: PreviewStatus;
  statusDetail: string | null;
  generatedAt: string | null;
  template: string | null;
  headline: ProspectHeadline | null;
  primaryFinding: CardFinding | null;
  secondaryFindings: CardFinding[];
  notes: string[];
  message: string | null;
  stale: string[];
  assets: Record<string, string>;
  /** Stored copies of their images, by storage path → short-lived signed URL. */
  storedImages?: Record<string, string>;
  timings: Record<string, number> | null;
  recommendation?: OutreachRecommendation | null;
}
interface StatusResponse {
  ok: boolean;
  status: PreviewStatus;
  preview: PreviewView | null;
  eligible?: boolean;
  reason?: string | null;
  eligibilityNotes?: string[];
  headline?: ProspectHeadline | null;
  shotsConfigured?: boolean;
  plan?: string;
}

const IN_PROGRESS: PreviewStatus[] = ['gathering', 'selecting_template', 'building', 'rendering'];

export function ProspectPreviewButton({ leadId, className }: { leadId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)} title="Generate a replacement homepage + evidence card for outreach (never sends)">
        <MonitorSmartphone className="mr-2 h-4 w-4" /> {PROSPECT_PREVIEW_LABEL}
      </Button>
      {open && <ProspectPreviewSheet leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function ProspectPreviewSheet({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const poll = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await invokeEdge<StatusResponse>('prospect-preview', { action: 'status', lead_id: leadId });
      setData(r); setError(null);
    } catch (e) { setError(edgeErrorMessage(e, 'Could not load the prospect preview.')); }
  }, [leadId]);

  useEffect(() => { void load(); return () => { if (poll.current) window.clearInterval(poll.current); }; }, [load]);

  const generate = async (regenerate: boolean) => {
    setBusy(true); setError(null);
    // The generate call runs for the whole build; the status poll shows which stage it is on.
    poll.current = window.setInterval(() => { void load(); }, 3000);
    try {
      const r = await invokeEdge<StatusResponse>('prospect-preview', { action: 'generate', lead_id: leadId, regenerate });
      setData((d) => ({ ...(d ?? r), ...r }));
    } catch (e) {
      setError(edgeErrorMessage(e, 'Generation failed.'));
    } finally {
      if (poll.current) { window.clearInterval(poll.current); poll.current = null; }
      setBusy(false);
      void load();
    }
  };

  const openHtml = async (url: string, images: Record<string, string>) => {
    // Storage serves HTML as a download/plain text; render it from a blob in a new tab instead,
    // with the stored image copies swapped in (the saved page never holds an expiring link).
    const html = resolveStoredAssets(await (await fetch(url)).text(), (path) => images[path] ?? null);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };

  const p = data?.preview ?? null;
  const status: PreviewStatus = p?.status ?? 'not_generated';
  const headline = p?.headline ?? data?.headline ?? null;
  const working = busy || IN_PROGRESS.includes(status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{PROSPECT_PREVIEW_LABEL}</SheetTitle>
          <SheetDescription>One replacement homepage + an evidence card, for outreach. Not a Website Build. Nothing is sent.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          <div className="flex items-center gap-2">
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : status === 'ready' ? <Check className="h-4 w-4 text-emerald-600" /> : status === 'failed' ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
            <span className="font-semibold">{PREVIEW_STATUS_LABELS[status]}</span>
            {p?.stale?.length ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">Stale — {p.stale.join(', ')} changed</span> : null}
          </div>
          {status === 'failed' && p?.statusDetail && <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">{p.statusDetail}</p>}
          {error && <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">{error}</p>}
          {data && data.eligible === false && <p className="rounded border p-2 text-xs text-muted-foreground">{data.reason}</p>}
          {data?.shotsConfigured === false && <p className="text-xs text-amber-700 dark:text-amber-300">Screenshots are not configured on the server (Cloudflare secrets).</p>}

          {headline && (
            <div className="space-y-1">
              <div className="text-xs uppercase text-muted-foreground">AI search</div>
              <div className="font-medium">“{headline.question}” <span className="text-muted-foreground">· {headline.engines.join(', ')}</span></div>
              <div className="text-xs uppercase text-muted-foreground pt-2">Competitors named</div>
              <ul className="list-disc pl-5">{headline.competitors.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}

          {p?.status === 'ready' && (
            <>
              {p.recommendation && (
                // Guidance, not a gate: the homepage stays viewable and downloadable either way.
                <div className="rounded border p-2">
                  <div className="text-xs uppercase text-muted-foreground">Recommended outreach</div>
                  <div className="font-semibold">{OUTREACH_SEND_LABELS[p.recommendation.send]}</div>
                  <div className="text-xs text-muted-foreground">{p.recommendation.why}</div>
                  {p.recommendation.send === 'card_only' && <div className="pt-1 text-xs text-muted-foreground">The homepage is still below if you want to use it.</div>}
                  {p.recommendation.weaknesses.length > 1 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{p.recommendation.weaknesses.map((w) => <li key={w}>{w}</li>)}</ul>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground">Primary site issue</div>
                <div>{p.primaryFinding ? p.primaryFinding.line : 'None strong enough — the card uses the truthful no-issue wording.'}</div>
                {p.secondaryFindings.map((s) => <div key={s.id} className="text-muted-foreground">+ {s.line}</div>)}
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Assets</div>
                <div className="grid grid-cols-2 gap-2">
                  {PREVIEW_ASSETS.filter((a) => p.assets[a]).map((a) => (
                    <a key={a} href={p.assets[a]} target="_blank" rel="noreferrer" className="group rounded border p-1 hover:bg-muted">
                      <img src={p.assets[a]} alt={PREVIEW_ASSET_LABELS[a]} className="h-32 w-full rounded object-cover object-top" />
                      <div className="mt-1 flex items-center justify-between text-xs"><span>{PREVIEW_ASSET_LABELS[a]}</span><Download className="h-3 w-3 opacity-60" /></div>
                    </a>
                  ))}
                </div>
                {p.assets.homepage_html && (
                  <Button variant="outline" size="sm" onClick={() => void openHtml(p.assets.homepage_html, p.storedImages ?? {})}><ExternalLink className="mr-2 h-4 w-4" /> View homepage</Button>
                )}
              </div>

              {p.message && (
                <div className="space-y-1">
                  <div className="text-xs uppercase text-muted-foreground">Suggested message (not sent)</div>
                  <pre className="whitespace-pre-wrap rounded border bg-muted/40 p-2 font-sans text-sm">{p.message}</pre>
                  <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(p.message ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} Copy message
                  </Button>
                </div>
              )}

              {p.notes.length > 0 && (
                <details className="rounded border p-2 text-xs">
                  <summary className="cursor-pointer font-medium">Operator notes ({p.notes.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </details>
              )}
              <p className="text-xs text-muted-foreground">{p.template} · {p.generatedAt ? new Date(p.generatedAt).toLocaleString('en-GB') : ''}{p.timings?.totalMs ? ` · built in ${Math.round(p.timings.totalMs / 1000)}s` : ''}</p>
            </>
          )}

          <div className="flex gap-2">
            {status !== 'ready' ? (
              <Button size="sm" disabled={working || data?.eligible === false} onClick={() => void generate(false)}>
                {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MonitorSmartphone className="mr-2 h-4 w-4" />} Generate homepage preview
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={working || data?.eligible === false} onClick={() => void generate(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
