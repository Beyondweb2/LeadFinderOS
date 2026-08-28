import { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { buildReportData, isMarketAudit, type QueueRow, type RunRow } from '@/lib/auditReport';
import { isAggregatorUrl } from '@/lib/aggregators';
import { downloadWelcomePack } from '@/lib/aiAuditReportDownload';
import { fetchAllRows } from '@/lib/fetchAllRows';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WELCOME PACK BUTTON — Outreach lead modal.

   Builds ONE PDF for a client who has just paid: cover, plan, how it works, get more reviews, then
   their own audit report with the selling sections hidden (hidePitch).

   ⛔ NO AUDIT, NO PACK. The pack's whole last section IS the report, so without a completed audit
   there is nothing to send. It says "Run an audit for this lead first" rather than producing a pack
   with an empty back half — the same refusal shape the report paths already use.
   ⛔ A MARKET AUDIT IS NOT A CLIENT DOCUMENT and is excluded here as it is everywhere else: it has
   no lead and no business-level result to report.
   ⚠️ THE REVIEW LINK IS OPTIONAL AND IS NEVER GUESSED. There is no per-business review-link field in
   the schema (checked: outreach_leads has google_maps_url, rating and review_count, no review URL),
   so it is asked for here, per pack. Left blank, the reviews page prints how to find it instead of a
   broken box — a wrong review link would send the client's customers to the wrong listing.
   ⚠️ Client-side only: reads audits/runs/queue rows through the operator's own session (RLS), builds
   the HTML in the browser, and prints via the SAME offscreen-iframe helper every other document uses.
   No edge function is involved.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

interface AuditRowLite {
  id: string;
  business_name: string;
  business_type: string | null;
  location_text: string | null;
  is_market?: boolean | null;
  created_at: string;
}

export function WelcomePackButton({ leadId, businessName }: { leadId: string; businessName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reviewLink, setReviewLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  /** Newest non-market audit for this lead that has a completed run, or null. */
  const resolveAudit = async (): Promise<{ audit: AuditRowLite; run: RunRow; rows: QueueRow[] } | null> => {
    const { data: audits } = await supabase
      .from('ai_audits')
      .select('id, business_name, business_type, location_text, is_market, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    const list = ((audits ?? []) as unknown as AuditRowLite[]).filter((a) => !isMarketAudit(a as never));
    for (const audit of list) {
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, status, results, created_at')
        .eq('audit_id', audit.id)
        .order('created_at', { ascending: false });
      const done = ((runs ?? []) as unknown as RunRow[]).filter((r) => r.status === 'complete' || r.status === 'capped');
      if (!done.length) continue;
      /* ALL runs' rows, like the report path — a measurement asks each question several times and the
         report aggregates across the repeats. Paginated: a 47-question x 3-run audit is 141 rows and
         PostgREST truncates silently at db-max-rows. */
      const { rows } = await fetchAllRows<QueueRow>(
        'welcome-pack queue rows',
        (from, to) => supabase
          .from('ai_audit_queue')
          .select('id, question, status, result')
          .eq('audit_id', audit.id)
          .order('id')
          .range(from, to) as never,
      );
      if (rows.length) return { audit, run: done[0], rows };
    }
    return null;
  };

  const onOpen = async () => {
    setChecking(true);
    try {
      const found = await resolveAudit();
      if (!found) {
        toast({ title: 'Run an audit for this lead first.', variant: 'destructive' });
        return;
      }
      setOpen(true);
    } catch (e) {
      toast({ title: "Couldn't check this lead's audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const found = await resolveAudit();
      if (!found) { toast({ title: 'Run an audit for this lead first.', variant: 'destructive' }); return; }
      const { audit, run, rows } = found;
      const report = buildReportData(rows, run, {
        businessName: audit.business_name || businessName,
        businessType: audit.business_type ?? '',
        locationText: audit.location_text ?? '',
        specialisms: '',
        isAggregatorUrl,
      });
      if (!report) {
        toast({ title: 'No completed results to report yet', description: 'Run an audit for this lead first.', variant: 'destructive' });
        return;
      }
      /* ⛔ NEVER the internal view in a client document. hidePitch is forced inside
         buildWelcomePackHtml, so it cannot be forgotten here either. */
      report.internal = false;
      downloadWelcomePack({
        businessName: audit.business_name || businessName,
        reviewLink: reviewLink.trim(),
        report,
      });
      setOpen(false);
    } catch (e) {
      toast({ title: "Couldn't build the welcome pack", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={checking}
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-400"
        title="Build the client welcome pack PDF: cover, plan, get more reviews, and their audit report with the sales pitch removed"
      >
        {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
        Welcome pack
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Welcome pack for {businessName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Cover, plan, how it works, get more reviews, then their audit report with the sales pitch
              removed. Saves as a PDF through your browser&rsquo;s print dialogue.
            </p>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="wp-review-link">
              Their Google review link (optional)
            </label>
            <Input
              id="wp-review-link"
              value={reviewLink}
              placeholder="https://g.page/r/…/review"
              onChange={(e) => setReviewLink(e.target.value)}
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank and the reviews page explains how they find it themselves. Nothing is guessed
              — a wrong link would send their customers to the wrong listing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Gift className="mr-1.5 h-3.5 w-3.5" />}
              {busy ? 'Building…' : 'Build welcome pack'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
