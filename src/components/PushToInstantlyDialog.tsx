import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, AlertTriangle, ClipboardList, Check } from 'lucide-react';
import { AUDIT_EST_USD_PER_QUESTION, CLEANER_USD_PER_RUN } from '@/lib/marketView';

interface InstantlyCampaign { id: string; name: string }

/** One lead's verdict, exactly as bulk-jobs' triageForPush returned it. Never recomputed here. */
interface TriageRow {
  lead_id: string;
  business_name: string;
  bucket: 'push_now' | 'needs_audit' | 'cannot';
  reason: string;
}

interface PushToInstantlyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected lead ids. What happens to each is decided by the server-side triage. */
  leadIds: string[];
  /** Called after the job starts so the table can refresh + clear selection. */
  onPushed?: () => void;
  /** Starts the two-phase job. Supplied by Outreach via useBulkJobs. */
  onBulkJob?: (
    type: 'enrich' | 'site_gen' | 'audit' | 'audit_and_push',
    leadIds: string[],
    params?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** True while any bulk job is running — only one may be active at a time. */
  bulkJobActive?: boolean;
}

/* ══ ONE ACTION ═══════════════════════════════════════════════════════════════════════════════
   ⛔ WHAT THIS REPLACED, AND WHY. The dialog used to call instantly-push directly with whatever was
   selected. Every lead without a completed audit was refused, so Paul selected 10 accountants,
   pressed Push, and got 0 pushed — twice. The work needed to make them pushable (audit them, wait,
   come back, push again) was real work he had to remember to do, and the button gave no hint of it.

   Now the selection is triaged SERVER-SIDE and the whole sequence runs as one bulk job:
     phase A  audit the ones that need it (skip_seo — the email carries no website grade)
     phase B  push the lot in a single Instantly call, once every audit has actually been ANSWERED

   ⚠️ THE TRIAGE IS NOT COMPUTED HERE. It comes from bulk-jobs' triageForPush, which `create` then
   re-runs on the same leads. Two copies of "who is pushable" is how a confirm screen ends up
   promising something the job does not do — and the direction that error runs is spending money on
   a lead the operator was told would be left alone.

   ⚠️ AND IT IS A JOB, NOT A REQUEST. An audit takes ~9 minutes; nothing that waits that long may
   live in a dialog. The job survives closing the browser, and its progress comes back from
   bulk_jobs on the next page load. */
export function PushToInstantlyDialog({
  open, onOpenChange, leadIds, onPushed, onBulkJob, bulkJobActive,
}: PushToInstantlyDialogProps) {
  const { toast } = useToast();
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [triaging, setTriaging] = useState(false);
  const [triage, setTriage] = useState<TriageRow[] | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(0);
  const [cap, setCap] = useState(25);
  const [questionCount, setQuestionCount] = useState(3);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-push', {
        body: { mode: 'list_campaigns' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Could not load campaigns');
      const list: InstantlyCampaign[] = Array.isArray(data.campaigns) ? data.campaigns : [];
      setCampaigns(list);
      if (list.length === 1) setCampaignId(list[0].id);
    } catch (e) {
      setLoadError((e as Error).message || 'Could not load campaigns');
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  /** Ask the server what would happen. Read-only: no job, no spend, no email. */
  const loadTriage = useCallback(async () => {
    if (!leadIds.length) { setTriage([]); return; }
    setTriaging(true);
    setTriageError(null);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-jobs', {
        body: { action: 'triage', lead_ids: leadIds },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Could not work out what these leads need');
      setTriage(Array.isArray(data.triage) ? data.triage : []);
      setOverCap(Number(data.over_cap) || 0);
      setCap(Number(data.cap) || 25);
    } catch (e) {
      setTriageError((e as Error).message);
      setTriage(null);
    } finally {
      setTriaging(false);
    }
  }, [leadIds]);

  useEffect(() => {
    if (!open) return;
    setCampaignId('');
    setTriage(null);
    loadCampaigns();
    loadTriage();
  }, [open, loadCampaigns, loadTriage]);

  const groups = useMemo(() => ({
    pushNow: (triage ?? []).filter((r) => r.bucket === 'push_now'),
    needsAudit: (triage ?? []).filter((r) => r.bucket === 'needs_audit'),
    cannot: (triage ?? []).filter((r) => r.bucket === 'cannot'),
  }), [triage]);

  /* ⚠️ MEASURED CONSTANTS, IMPORTED. AUDIT_EST_USD_PER_QUESTION is from ai_audit_runs.actor_cost_usd;
     CLEANER_USD_PER_RUN is the gpt-4o competitor clean that fires once per finished run. NO SEO line:
     this job type always passes skip_seo, so there is no $0.04-per-website charge to estimate.
     Leads already ready to push cost nothing — the push itself is one free API call. */
  const costUsd = useMemo(
    () => groups.needsAudit.length * (questionCount * AUDIT_EST_USD_PER_QUESTION + CLEANER_USD_PER_RUN),
    [groups.needsAudit.length, questionCount],
  );

  const actionable = groups.pushNow.length + groups.needsAudit.length;
  const willRun = Math.min(actionable, cap);

  const handleStart = async () => {
    if (!campaignId || starting || !onBulkJob) return;
    setStarting(true);
    try {
      const res = await onBulkJob('audit_and_push', leadIds, {
        campaign_id: campaignId,
        question_count: questionCount,
      });
      if (!res.ok) {
        toast({ title: 'Could not start', description: res.error, variant: 'destructive' });
        return;
      }
      toast({
        title: groups.needsAudit.length
          ? `Started — auditing ${groups.needsAudit.length}, then pushing ${willRun}`
          : `Started — pushing ${willRun} to Instantly`,
        description: groups.needsAudit.length
          ? 'Audits run first and take a few minutes each. The push happens once they have all answered. Safe to leave this page.'
          : 'Running server-side. Safe to leave this page.',
      });
      onOpenChange(false);
      onPushed?.();
    } finally {
      setStarting(false);
    }
  };

  const noCampaigns = !loadingCampaigns && !loadError && campaigns.length === 0;
  const busy = triaging || loadingCampaigns;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Push to Instantly</DialogTitle>
          <DialogDescription>
            Audits whichever of the selected leads still need one, then pushes the whole set into an
            Instantly campaign in a single upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* ── Campaign ────────────────────────────────────────────────────────────────── */}
          {loadingCampaigns ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your Instantly campaigns…
            </div>
          ) : loadError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadCampaigns}>Retry</Button>
            </div>
          ) : noCampaigns ? (
            <p className="text-sm text-muted-foreground">
              No Instantly campaigns found — create one in Instantly first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Campaign</label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Pick a campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── The triage ──────────────────────────────────────────────────────────────── */}
          {triaging ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Working out what these {leadIds.length} leads need…
            </div>
          ) : triageError ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{triageError}</p>
              <Button variant="outline" size="sm" onClick={loadTriage}>Retry</Button>
            </div>
          ) : triage && (
            <div className="space-y-2">
              {groups.pushNow.length > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    <span className="font-semibold">{groups.pushNow.length}</span> already audited —
                    pushed as they are.
                  </span>
                </p>
              )}
              {groups.needsAudit.length > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{groups.needsAudit.length}</span> need an audit
                    first — that runs before anything is pushed, and takes a few minutes each.
                  </span>
                </p>
              )}

              {/* ⛔ THE THIRD GROUP IS NAMED, NOT COUNTED. A number tells the operator that something
                  was excluded; it does not tell him a client he cares about was excluded, or why. This
                  is the group where money is NOT spent and email is NOT sent, which makes it exactly
                  the group a silent count would hide. */}
              {groups.cannot.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {groups.cannot.length} cannot be pushed — no audit, no email, no charge
                  </p>
                  <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs leading-snug">
                    {groups.cannot.map((r) => (
                      <li key={r.lead_id} className="flex gap-1.5">
                        <span className="font-medium">{r.business_name}</span>
                        <span className="text-muted-foreground">— {r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* A cap that quietly drops work reads as "everything was done". Say what is left. */}
              {overCap > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  <span className="font-semibold">{overCap} over the {cap}-lead cap</span> — this run
                  takes {cap}. Run it again afterwards for the rest.
                </p>
              )}

              {groups.needsAudit.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Questions per audit</label>
                  <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                {willRun > 0 ? (
                  <>
                    Push <span className="font-semibold">{willRun}</span> lead{willRun === 1 ? '' : 's'}
                    {groups.needsAudit.length > 0 && <>, auditing <span className="font-semibold">{groups.needsAudit.length}</span> first</>}
                    {' '}(~<span className="font-semibold">${costUsd.toFixed(2)}</span>
                    {costUsd === 0 && ' — nothing to audit'}). Proceed?
                  </>
                ) : (
                  <>Nothing to do — every selected lead is in the list above.</>
                )}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={starting}>Cancel</Button>
          <Button
            onClick={handleStart}
            disabled={!campaignId || starting || busy || noCampaigns || willRun === 0 || !!bulkJobActive || !onBulkJob}
          >
            {starting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {groups.needsAudit.length > 0 ? `Audit ${groups.needsAudit.length} and push ${willRun}` : `Push ${willRun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
