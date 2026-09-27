import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LeadWebsiteIssues } from '@/hooks/useLeadWebsiteIssues';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE ISSUES FOUND / ONLINE PRESENCE ISSUES FOUND — inside the Inbox AI visibility details, under
   the six results (Paul, 2026-09-27). Evidence already stored for the lead (useLeadWebsiteIssues), the
   same selection the Call Script reads.

   ⛔ NEVER INVENTED, NEVER MANUFACTURED. No strong finding says so ("No strong website issues found in
      this check."); a site that was never checked says THAT, not "no issues". A profile page is never
      called their website. At most HOOK_ISSUES_SHOWN findings by default; the rest behind "View all".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const HOOK_ISSUES_SHOWN = 3;
const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

/** The words for a list that has no findings in it. Only `clean` may say "no strong issues". */
export function websiteIssuesEmptyText(d: LeadWebsiteIssues): string | null {
  switch (d.outcome.status) {
    case 'findings': return null;
    case 'profile': return null;
    case 'no_website': return null;
    case 'clean': return 'No strong website issues found in this check.';
    case 'not_crawled': return 'The site has not been checked yet, so there are no website findings. (Use Crawl site for one.)';
    case 'crawl_stale': return 'The newest website check is more than 30 days old, so its findings are not used.';
    case 'unreadable': return 'The check could not read the site, so there is nothing reliable to say about it.';
  }
}

export function HookWebsiteIssuesView({ data }: { data: LeadWebsiteIssues }) {
  const [all, setAll] = useState(false);
  const { outcome, site } = data;
  const presence = outcome.status === 'profile' || outcome.status === 'no_website';
  const shown = all ? outcome.findings : outcome.findings.slice(0, HOOK_ISSUES_SHOWN);
  const empty = websiteIssuesEmptyText(data);
  return (
    <div data-testid="hook-website-issues" data-status={outcome.status}>
      <div className={EYEBROW}>{presence ? 'Online presence issues found' : 'Website issues found'}</div>
      {outcome.status === 'profile' ? (
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><span className="font-medium">No standalone business website found</span></li>
          <li className="break-words"><span className="font-medium">Only a {site.label ?? 'directory'} profile found</span>{data.website && <span className="text-muted-foreground"> · {data.website.replace(/^https?:\/\/(www\.)?/, '')}</span>}</li>
        </ul>
      ) : outcome.status === 'no_website' ? (
        <ul className="mt-1 ml-4 list-disc"><li className="font-medium">No website on record for this business</li></ul>
      ) : empty ? (
        <p className="mt-0.5 text-muted-foreground">{empty}</p>
      ) : (
        <>
          <ul className="mt-1 space-y-1">
            {shown.map((f) => (
              <li key={f.kind + f.title} className="break-words" data-testid="hook-website-issue">
                <span className="font-medium">{f.title}</span>
                <span className="block text-muted-foreground">{f.explanation}</span>
              </li>
            ))}
          </ul>
          {outcome.findings.length > HOOK_ISSUES_SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              {all ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {all ? 'Show fewer' : `View all issues (${outcome.findings.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
