/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VOICE-NOTE SCRIPT — the Inbox / lead popup button (Paul, 2026-09-26).

   Opens a panel with the lead's newest saved script (a read, no spend), or generates one: the
   `voice-note-script` function picks ONE missed hook result (question + engine + that engine's
   competitors), reuses the saved site research, writes the script and checks it. Paul copies it and
   records the note himself.

   ⛔ NOTHING SENDS FROM HERE. There is no send callback, no composer write and no message row — only
   Copy (to the clipboard) and Regenerate. scripts/voice-note-script.test.ts pins this.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Mic, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { cn } from '@/lib/utils';

export const VOICE_NOTE_SCRIPT_LABEL = 'Voice-note script';

interface FindingRecord { id: string; kind: string; title: string; source: string; details: string[] }
interface ScriptRow {
  id: string;
  audit_id: string | null;
  hook_question_index: number | null;
  hook_question: string;
  hook_engine: string;
  competitors: string[];
  findings: FindingRecord[];
  site_mode: 'findings' | 'clean' | 'unread' | 'profile' | 'no_website';
  site_source: 'own_site' | 'directory_profile' | 'social_profile' | 'none' | null;
  site_source_label: string | null;
  research_basis: { plan?: string | null; usedFullCrawl?: boolean | null; status?: string | null; generatedAt?: string | null; sourceCrawlAt?: string | null; sources?: string[] } | null;
  script: string;
  word_count: number | null;
  problems: string[];
  warnings: string[];
  operator_note: string | null;
  generator_version: number | null;
  generated_at: string;
}
/** What a Regenerate would use today (the function's loadHookEvidence), or why it cannot write one. */
type CurrentBasis =
  | { ok: true; auditId: string; questionIndex: number; engine: string; engineLabel: string; question: string; competitors: string[] }
  | { ok: false; error: string; detail: string };
interface LatestResponse { ok: true; script: ScriptRow | null; versions: number; current?: CurrentBasis; stale?: boolean; generatorVersion?: number }
interface GenerateResponse { ok: true; script: ScriptRow }

const ENGINE_LABEL: Record<string, string> = { gemini: 'Google AI', chatgpt: 'ChatGPT' };
const SITE_MODE_TEXT: Record<Exclude<ScriptRow['site_mode'], 'findings'>, string> = {
  clean: 'Nothing strong found on the site, so the script uses the "nothing obviously broken" line.',
  unread: 'The site could not be read, so the script says nothing specific about it.',
  profile: 'The website on record is a profile page, not their own site. It was not researched.',
  no_website: 'No website on record.',
};
const SOURCE_TEXT: Record<string, string> = { page: 'live site', full_crawl: 'full crawl', crawl_check: 'crawl check', audit: 'AI audit' };

/** ~2.4 spoken words a second, Paul's relaxed pace. */
const seconds = (words: number) => Math.round(words / 2.4);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** The panel's content: the saved script (or Write), Copy, Regenerate, word count, "Based on". Shared by the
 *  dialog below and the Cold Call Playbook's Voice note tab (2026-09-27). Nothing sends from here. */
export function VoiceNoteScriptBody({ leadId, currentAuditId }: { leadId: string; currentAuditId?: string | null }) {
  const [row, setRow] = useState<ScriptRow | null>(null);
  const [versions, setVersions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [current, setCurrent] = useState<CurrentBasis | null>(null);
  const [stale, setStale] = useState(false);
  const [latestVersion, setLatestVersion] = useState<number | null>(null);

  // The newest saved script: a read of our own table, no fetch, no model.
  useEffect(() => {
    let live = true;
    setLoading(true);
    invokeEdge<LatestResponse>('voice-note-script', { action: 'latest', lead_id: leadId })
      .then((d) => { if (live) { setRow(d.script); setVersions(d.versions); setCurrent(d.current ?? null); setStale(d.stale === true); setLatestVersion(d.generatorVersion ?? null); } })
      .catch((e) => { if (live) setError(edgeErrorMessage(e, 'Could not load the saved script')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [leadId]);

  const generate = useCallback(async () => {
    setBusy(true); setError(null); setCopied(false);
    try {
      const d = await invokeEdge<GenerateResponse>('voice-note-script', { action: 'generate', lead_id: leadId, regenerate_of: row?.id ?? null });
      setRow(d.script); setVersions((v) => v + 1); setStale(false);
    } catch (e) {
      setError(edgeErrorMessage(e, 'Could not write the script'));
    } finally {
      setBusy(false);
    }
  }, [leadId, row?.id]);

  const copy = useCallback(async () => {
    if (!row) return;
    try { await navigator.clipboard.writeText(row.script); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError('Could not copy. Select the text and copy it by hand.'); }
  }, [row]);

  const basis = row?.research_basis;
  const outOfDate = !!row && (stale || (!!currentAuditId && !!row.audit_id && row.audit_id !== currentAuditId));
  const oldStyle = !!row && latestVersion !== null && (row.generator_version ?? 0) < latestVersion;
  const words = row?.word_count ?? 0;
  return (
    <div data-testid="voice-note-script-body">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="space-y-3">
            {error && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            {row ? (
              <>
                {/* ⛔ AN OUT-OF-DATE SCRIPT IS NEVER PRESENTED AS CURRENT (Paul, 2026-09-27). The function compares
                    the result this script quotes with the one a Regenerate would pick now. The playbook also
                    passes the audit its AI opportunity reads. Nothing regenerates on its own (a model call). */}
                {outOfDate && (
                  <div className="rounded-md border-2 border-red-500/60 bg-red-500/10 p-2.5 text-xs text-red-800 dark:text-red-200" data-testid="voice-note-out-of-date">
                    <p className="text-sm font-bold uppercase tracking-wide">Voice note out of date</p>
                    <p className="mt-0.5">
                      {current && 'detail' in current
                        ? current.detail
                        : current?.ok && current.auditId !== row.audit_id
                          ? 'A newer audit exists. This script quotes an earlier audit’s search and competitors.'
                          : 'The best missed search has changed since this script was written.'}
                    </p>
                    {current?.ok && (
                      <p className="mt-1 break-words">
                        Latest: <span className="font-semibold">{current.engineLabel}</span>, “{current.question}”
                        {current.competitors.length > 0 && <> · named {current.competitors.join(', ')}</>}
                      </p>
                    )}
                    {(!current || current.ok) && (
                      <Button size="sm" className="mt-2 h-8 gap-1" onClick={generate} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate using latest audit
                      </Button>
                    )}
                  </div>
                )}
                {!outOfDate && oldStyle && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200" data-testid="voice-note-old-style">
                    Written with the older script style (longer, and it ends by offering to explain changes). Regenerate for the short version that asks who controls the website.
                  </p>
                )}
                {row.problems.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-semibold">Check this script before recording:</p>
                    <ul className="ml-4 list-disc">{row.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                )}
                <div className={cn('rounded-md border border-border bg-muted/40 p-3', outOfDate && 'opacity-60')}>
                  {outOfDate && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Old script, from the earlier result</p>}
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.script}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{words} words · about {seconds(words)}s</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={copy}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button size="sm" className="h-8 gap-1" onClick={generate} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
                    </Button>
                  </div>
                </div>
                {row.warnings.length > 0 && <p className="text-[11px] text-muted-foreground">{row.warnings.join(' ')}</p>}

                <div className="space-y-1.5 border-t border-border pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Based on</p>
                  <Row label="Search">
                    <span className="font-medium">{ENGINE_LABEL[row.hook_engine] ?? row.hook_engine}</span>: “{row.hook_question}”
                  </Row>
                  <Row label="Named instead">{row.competitors.join(', ')}</Row>
                  <Row label="Website">
                    {row.site_mode === 'findings' ? (
                      <ul className="space-y-1">
                        {row.findings.map((f) => (
                          <li key={f.id}>
                            <span className="font-medium">{f.title}</span>
                            <span className="text-muted-foreground"> · {f.source}</span>
                            {f.details.length > 0 && <span className="block text-muted-foreground">{f.details.join(' · ')}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : row.site_mode === 'profile'
                      ? `The website on record is a ${row.site_source_label ?? 'directory'} profile, not their own site. It was not researched.`
                      : SITE_MODE_TEXT[row.site_mode]}
                  </Row>
                  {basis && (basis.sources?.length ?? 0) > 0 && (
                    <Row label="Research">
                      <span className="text-muted-foreground">
                        {basis.sources!.map((s) => SOURCE_TEXT[s] ?? s).join(', ')}
                        {basis.plan === 'reuse' || basis.plan === 'revalidated' ? ', saved' : ''}
                        {basis.generatedAt ? ` · ${when(basis.generatedAt)}` : ''}
                      </span>
                    </Row>
                  )}
                  {row.operator_note && <Row label="Note"><span className="text-muted-foreground">{row.operator_note}</span></Row>}
                  <p className="text-[10px] text-muted-foreground">Written {when(row.generated_at)}{versions > 1 ? ` · version ${versions}` : ''}</p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  No script yet. It uses one AI search this business was missed in, the competitors named for that exact search,
                  and the strongest real finding from the website research.
                </p>
                <Button size="sm" className="gap-1" onClick={generate} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                  {busy ? 'Writing… (can take ~30s if the site needs reading)' : 'Write the script'}
                </Button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function VoiceNoteScriptPanel({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mic className="h-4 w-4" /> {VOICE_NOTE_SCRIPT_LABEL}</DialogTitle>
          <DialogDescription>For you to read out and record. Nothing is sent from here.</DialogDescription>
        </DialogHeader>
        <VoiceNoteScriptBody leadId={leadId} />
      </DialogContent>
    </Dialog>
  );
}

export function VoiceNoteScriptButton({ leadId, compact, prominent, className }: { leadId: string; compact?: boolean; prominent?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  /* PROMINENT: the Inbox's open 24h window, beside the voice-note recorder (Paul, 2026-09-26). A real
     button, not a pill; closed-window threads do not get one at all. */
  if (prominent) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className={cn('h-8 gap-1.5 border-violet-500/50 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300', className)}>
          <Mic className="h-4 w-4" /> {VOICE_NOTE_SCRIPT_LABEL}
        </Button>
        {open && <VoiceNoteScriptPanel leadId={leadId} open={open} onOpenChange={setOpen} />}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={VOICE_NOTE_SCRIPT_LABEL}
        aria-label={VOICE_NOTE_SCRIPT_LABEL}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
          className,
        )}
      >
        <Mic className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {VOICE_NOTE_SCRIPT_LABEL}
      </button>
      {open && <VoiceNoteScriptPanel leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
