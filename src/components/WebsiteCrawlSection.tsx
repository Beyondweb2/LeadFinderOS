/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE CRAWL — the call screen's section under the AI result (Paul, 2026-10-19).

   What the ONE website check (src/lib/websiteCheck.ts, read through the playbook) found on the lead's site:
     · the serious issues as plain titles, at most WEBSITE_CRAWL_MAX_ISSUES, worst first — each with its evidence
       (the page it was read on and what was seen) one tap away;
     · "Checked <day>", and "Press Run again before the call" when the check is older than CALL_SCRIPT_CHECK_OLD_DAYS;
     · "Checking the website…" while a crawl is under way; a failed check says so and nothing about the site.
   Opening it starts the missing quick check ONCE (useCallScreenCrawl → crawl-check "call_screen"); Run again starts the
   same full crawl every Crawl-site button starts, and this section watches it.
   ⛔ Nothing here sends anything, spends anything, or writes a lead. Minor points never appear here.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, Globe, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { startFullLeadCrawl, useCrawlJobWatch } from '@/components/LeadCrawlPanel';
import { useCallScreenCrawl } from '@/hooks/useCallScreenCrawl';
import { issueWhere, plainIssueTitle, type WebsiteIssue } from '@/lib/websiteCheck';
import { CALL_SCRIPT_CHECK_OLD_DAYS, CALL_SCRIPT_CHECK_OLD_NOTE } from '@/lib/callScript';
import type { ColdCallPlaybook } from '@/lib/coldCallPlaybook';

/** Issues listed in the section (Paul: max 5, most serious first). */
export const WEBSITE_CRAWL_MAX_ISSUES = 5;
export const WEBSITE_CRAWL_TITLE = 'Website crawl';
export const CHECKING_WEBSITE_LINE = 'Checking the website...';

function IssueRow({ issue }: { issue: WebsiteIssue }) {
  const [open, setOpen] = useState(false);
  const where = issueWhere(issue);
  return (
    <li className="rounded-xl bg-amber-500/[0.07] px-3 py-2 ring-1 ring-inset ring-amber-500/25" data-testid="website-crawl-issue">
      <button type="button" className="flex w-full items-start gap-2 text-left text-sm font-medium leading-snug" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1">{plainIssueTitle(issue)}</span>
        <ChevronDown className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 text-[12px] leading-snug text-muted-foreground" data-testid="website-crawl-evidence">
          <p>{issue.saw}</p>
          {issue.pages.map((u) => <p key={u} className="break-all">{u}</p>)}
          {!issue.pages.length && where && <p>{where}</p>}
        </div>
      )}
    </li>
  );
}

export function WebsiteCrawlSection({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const qc = useQueryClient();
  const auto = useCallScreenCrawl(leadId, p);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useCrawlJobWatch(jobId, async () => {
    setJobId(null);
    await qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });
    void qc.invalidateQueries({ queryKey: ['lead-crawls'] });
  });
  const runAgain = async () => {
    setStarting(true); setError(null); setSavedNote(null);
    try {
      const r = await startFullLeadCrawl(leadId, 'lead_detail');
      if (r?.cached) setSavedNote('Checked recently, so the saved check is shown.');
      else if (r?.job_id) setJobId(String(r.job_id));
      await qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });
    } catch (e) {
      setError(edgeErrorMessage(e, 'Could not start the website check'));
    } finally { setStarting(false); }
  };

  const check = p.websiteCheck;
  if (check.state === 'no_website' || check.state === 'profile') {
    return (
      <section className="space-y-1 rounded-2xl border border-border/70 bg-card p-3" data-testid="website-crawl-section" data-state={check.state}>
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/80"><Globe className="h-4 w-4" />{WEBSITE_CRAWL_TITLE}</h3>
        <p className="text-sm text-muted-foreground">{check.headline}</p>
      </section>
    );
  }
  const checking = !!jobId || starting || auto === 'checking' || p.findingsStatus === 'checking';
  const issues = check.serious.slice(0, WEBSITE_CRAWL_MAX_ISSUES);
  const old = check.ageDays != null && check.ageDays > CALL_SCRIPT_CHECK_OLD_DAYS;
  const state = checking ? 'checking' : check.state;
  return (
    <section className="space-y-2 rounded-2xl border border-border/70 bg-card p-3" data-testid="website-crawl-section" data-state={state}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/80"><Globe className="h-4 w-4" />{WEBSITE_CRAWL_TITLE}</h3>
        {!checking && check.checkedDay && <span className="text-[11px] text-muted-foreground" data-testid="website-crawl-checked">Checked {check.checkedDay}</span>}
        {!checking && old && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400" data-testid="website-crawl-old">{CALL_SCRIPT_CHECK_OLD_NOTE}</span>}
        {!checking && (
          <Button type="button" size="sm" variant="outline" className="ml-auto h-7 gap-1 rounded-full px-2.5 text-xs" onClick={() => void runAgain()} data-testid="website-crawl-run">
            <RefreshCw className="h-3.5 w-3.5" />{check.state === 'not_checked' ? 'Check now' : 'Run again'}
          </Button>
        )}
      </header>
      {checking ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="website-crawl-checking"><Loader2 className="h-4 w-4 animate-spin" />{CHECKING_WEBSITE_LINE}</p>
      ) : check.state === 'unreadable' ? (
        <p className="flex gap-2 text-sm text-muted-foreground" data-testid="website-crawl-failed"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />The website check failed: {(check.summary?.failure ?? 'the site did not answer').replace(/\.\s*$/, '')}. Say nothing about the site.</p>
      ) : check.state === 'not_checked' ? (
        <p className="text-sm text-muted-foreground" data-testid="website-crawl-not-checked">{auto === 'failed' ? 'The website check could not be started.' : 'Not checked yet.'} Say nothing about the site until it is.</p>
      ) : issues.length ? (
        <ul className="space-y-1.5" data-testid="website-crawl-issues">{issues.map((i) => <IssueRow key={i.id} issue={i} />)}</ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="website-crawl-clean"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No issues found on the site. Say nothing about it.</p>
      )}
      {savedNote && <p className="text-[11px] text-muted-foreground">{savedNote}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </section>
  );
}
