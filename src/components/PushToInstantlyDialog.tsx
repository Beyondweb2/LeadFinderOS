import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { readFunctionError } from '@/lib/functionError';
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
  /** Whether THIS run touches the lead. The cap is applied server-side, never recomputed here. */
  will_run: boolean;
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
    type: 'enrich' | 'audit' | 'audit_and_push',
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
  /* ⛔ HOW MANY TO SEND — THE OPERATOR'S NUMBER, AND BLANK MEANS ALL OF THEM (Paul, 2026-09-09:
     "remove the cap, allow me to select an amount that it sends"). Held as a STRING because it is
     a text box: a numeric state would turn a half-typed "" into 0 and a cleared box into "send
     nothing", which is the opposite of what clearing it means. */
  const [sendLimit, setSendLimit] = useState('');
  const [debouncedLimit, setDebouncedLimit] = useState('');
  /** How many of the selection can be sent at all — what the box is offering to slice. */
  const [actionable, setActionable] = useState(0);
  const [overLimit, setOverLimit] = useState(0);
  /** The limit the SERVER applied. null means it applied none. Never re-derived here. */
  const [appliedLimit, setAppliedLimit] = useState<number | null>(null);
  /* ⛔ WHAT THIS RUN DOES, FROM THE SERVER. The cost used to be quoted against every lead that
     NEEDED an audit rather than the capped subset that would get one — "auditing 138 first
     (~$13.97)" beside "113 over the 25-lead cap". Overstated 5x, on the number that decides whether
     the button gets pressed. These two come from the same will_run flags the job itself is built
     from, so they cannot drift from it. */
  const [auditsThisRun, setAuditsThisRun] = useState(0);
  const [pushThisRun, setPushThisRun] = useState(0);
  /* ⛔ FIVE, NOT THREE. Three questions x two engines is six datapoints, and "AI named you once in
     6 answers" is a weak measurement stated strongly — Wilson's report said exactly that and he was
     entitled to disbelieve it. Five makes it "1 of 10" for +2 questions = +2p a lead (8p -> 10p).
     ⚠️ IT FIXES THE MEASUREMENT RATHER THAN HEDGING THE SENTENCE. The alternative on the table was
     softening the verdict wording, which would have made a thin sample READ as less thin without
     making it less thin. Paul rejected that.
     Still an interim: the real fix is deriving from the market audit's 16 questions. */
  const [questionCount, setQuestionCount] = useState(5);

  /* ⛔ WHAT A TYPED AMOUNT MEANS, DECIDED IN ONE PLACE. Blank is not zero and not an error — it is
     "no limit", which is what removing the cap means. Anything else must be a whole number of at
     least one; a half-typed or nonsense value re-asks nothing and sends nothing, so a keystroke can
     never fire a job for an amount the operator did not finish typing.
     ⚠️ This is form validation, not the send rule. The server resolves the amount itself
     (resolveSendLimit) and refuses a bad one; this only decides whether it is worth asking yet. */
  const parseLimit = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 1 ? n : null;
  };
  const limitToSend = useMemo(() => parseLimit(debouncedLimit), [debouncedLimit]);
  /** Typed something, but not a usable amount. Shown inline; nothing is fetched for it. */
  const limitLooksWrong = sendLimit.trim() !== '' && parseLimit(sendLimit) === null;

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-push', {
        body: { mode: 'list_campaigns' },
      });
      if (error) throw new Error(await readFunctionError(error));
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

  /* ⛔ NO AUDIT, BY DEFAULT (Paul, 2026-09-09): "I'm dropping {{competitors}} from the email, so no
     audit is needed." Competitor names were the ONLY thing the audit put into the email, so with
     them gone an audit before a push buys nothing and costs ~8p and several minutes per lead.
     ⚠️ Kept as a TOGGLE rather than deleted outright because Paul asked for "the option (or
     default)". If it goes a month unused it should be removed — a switch nobody flips is the
     clutter this cleanup is about. */
  const [auditFirst, setAuditFirst] = useState(false);

  /** Ask the server what would happen. Read-only: no job, no spend, no email. */
  const loadTriage = useCallback(async () => {
    if (!leadIds.length) { setTriage([]); return; }
    setTriaging(true);
    setTriageError(null);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-jobs', {
        body: {
          action: 'triage',
          lead_ids: leadIds,
          skip_audit: !auditFirst,
          /* Omitted entirely when blank. Absent means "no limit" server-side; sending 0 or null
             would be a number, and a number means something. */
          ...(limitToSend === null ? {} : { limit: limitToSend }),
        },
      });
      /* ⛔ THE REAL MESSAGE, NOT THE WRAPPER. supabase-js's .message is always "Edge Function
         returned a non-2xx status code"; the reason is in the response body. Throwing the raw error
         is what reduced a real failure to "edge function error" on 2026-09-09 and left nobody able
         to say what had gone wrong. */
      if (error) throw new Error(await readFunctionError(error));
      if (!data?.ok) throw new Error(data?.error || 'Could not work out what these leads need');
      setTriage(Array.isArray(data.triage) ? data.triage : []);
      setActionable(Number(data.actionable) || 0);
      setOverLimit(Number(data.over_limit) || 0);
      /* ⚠️ null is a real answer here ("no limit applied") and must not collapse into a number.
         `Number(null) || 25` is exactly how the old code invented a 25-lead cap that no longer
         exists — the absent-value fault, on the field that says how many businesses get emailed. */
      setAppliedLimit(typeof data.limit === 'number' ? data.limit : null);
      setAuditsThisRun(Number(data.audits_this_run) || 0);
      setPushThisRun(Number(data.push_this_run) || 0);
    } catch (e) {
      setTriageError((e as Error).message);
      setTriage(null);
    } finally {
      setTriaging(false);
    }
  }, [leadIds, auditFirst, limitToSend]);

  /* ⛔ TWO EFFECTS, NOT ONE, AND THAT IS A FIX RATHER THAN TIDYING. Opening resets the campaign
     choice; re-triaging must not. They were one effect keyed on loadTriage's identity, so every
     change that re-triaged (the audit toggle, and now every keystroke in the amount box) also blew
     away the campaign the operator had just picked. */
  useEffect(() => {
    if (!open) return;
    setCampaignId('');
    setTriage(null);
    loadCampaigns();
  }, [open, loadCampaigns]);

  useEffect(() => {
    if (!open) return;
    loadTriage();
  }, [open, loadTriage]);

  /* Typing re-asks the server, so it waits for a pause. Same reasoning as InboxComposer's 400ms:
     a keystroke must not cost a round trip. */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLimit(sendLimit), 400);
    return () => clearTimeout(t);
  }, [sendLimit]);

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
    () => auditsThisRun * (questionCount * AUDIT_EST_USD_PER_QUESTION + CLEANER_USD_PER_RUN),
    [auditsThisRun, questionCount],
  );

  const willRun = pushThisRun;

  const handleStart = async () => {
    if (!campaignId || starting || !onBulkJob) return;
    setStarting(true);
    try {
      const res = await onBulkJob('audit_and_push', leadIds, {
        campaign_id: campaignId,
        question_count: questionCount,
        /* ⛔ IN params, WHICH IS WHAT GETS STORED ON THE JOB ROW. The runner reads the mode back
           from there when it calls instantly-push, so a flag sent anywhere else would be honoured
           at triage and forgotten at push. */
        skip_audit: !auditFirst,
        /* ⛔ IN params FOR THE SAME REASON THE MODE IS: params is what gets stored on the job row,
           so the amount the operator agreed to is recorded WITH the job rather than living only in
           the request that started it. */
        ...(limitToSend === null ? {} : { send_limit: limitToSend }),
      });
      if (!res.ok) {
        toast({ title: 'Could not start', description: res.error, variant: 'destructive' });
        return;
      }
      toast({
        title: auditsThisRun
          ? `Started — auditing ${auditsThisRun}, then pushing ${willRun}`
          : `Started — pushing ${willRun} to Instantly`,
        description: auditsThisRun
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
              {/* ⛔ WHAT ACTUALLY GETS UPLOADED, NAMED. The merge-field names ARE the contract with
                  the Instantly template — it fills {{business_name}} by exact name, and a mismatch
                  renders as an empty string in a sent email rather than erroring. Listing them here
                  means the campaign's copy can be checked against this screen. */}
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <p className="font-semibold">Uploaded per lead</p>
                <p className="mt-0.5 text-muted-foreground">
                  email · <code>{'{{business_name}}'}</code> · <code>{'{{trade}}'}</code> · <code>{'{{city}}'}</code>
                  {auditFirst && <> · <code>{'{{competitors}}'}</code> · <code>{'{{report_url}}'}</code></>}
                </p>
                <label className="mt-2 flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={auditFirst}
                    onChange={(e) => setAuditFirst(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Audit first, so the email can name competitors</span>
                    <span className="block text-muted-foreground">
                      Off by default — the email no longer uses {'{{competitors}}'}, so an audit adds
                      cost and several minutes per lead for a field nothing merges. Turning this on
                      restores the old behaviour and only pushes leads that have a finished audit.
                    </span>
                  </span>
                </label>
              </div>
              {/* ⛔ HOW MANY, AND WHICH ONES — Paul, 2026-09-09. The old 200-lead cap is gone; this
                  box replaces it, blank meaning all of them. The ORDER is the half that matters
                  more than the number: the server takes them oldest first, which is the bottom of
                  the Outreach table, because those are the leads that have sat unworked longest.
                  It used to slice by UUID, so the same lead could stay unsent indefinitely. */}
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <label className="flex flex-wrap items-center gap-2" htmlFor="push-send-limit">
                  <span className="font-semibold">How many to send</span>
                  <input
                    id="push-send-limit"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    placeholder={actionable ? String(actionable) : 'all'}
                    value={sendLimit}
                    onChange={(e) => setSendLimit(e.target.value)}
                    className="h-7 w-24 rounded border border-input bg-background px-2 text-xs"
                  />
                  <span className="text-muted-foreground">
                    blank = all {actionable || 'of them'}
                  </span>
                </label>
                <p className="mt-1 text-muted-foreground">
                  Taken <span className="font-medium">oldest first</span> — the ones deepest in your
                  outreach list, which have waited longest.
                </p>
                {limitLooksWrong && (
                  <p className="mt-1 text-destructive">
                    Enter a whole number of at least 1, or clear the box to send them all.
                  </p>
                )}
              </div>

              {groups.pushNow.length > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    <span className="font-semibold">{groups.pushNow.length}</span>{' '}
                    {auditFirst ? 'already audited — pushed as they are.' : 'ready to upload now.'}
                  </span>
                </p>
              )}
              {groups.needsAudit.length > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{groups.needsAudit.length}</span> need an audit
                    first
                    {auditsThisRun < groups.needsAudit.length
                      ? <> — <span className="font-semibold">this run audits {auditsThisRun}</span> of
                          them; the rest wait for the next run.</>
                      : <> — that runs before anything is pushed, and takes a few minutes each.</>}
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

              {/* A limit that quietly drops work reads as "everything was done". Say what is left,
                  and say WHY it was left — an amount the operator chose reads very differently from
                  a ceiling the app imposed, and only one of them is a surprise. */}
              {overLimit > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  <span className="font-semibold">
                    {overLimit} of the {actionable} left over
                  </span>{' '}
                  {appliedLimit !== null && limitToSend !== null
                    ? <>— you asked for {appliedLimit}. Run it again for the rest.</>
                    : <>— this run takes {appliedLimit ?? pushThisRun}, because auditing costs money.
                        Run it again afterwards for the rest.</>}
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

              {/* ⛔ ONE SENTENCE, AND EVERY NUMBER IN IT IS ABOUT THIS RUN. */}
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                {willRun > 0 ? (
                  <>
                    {auditFirst ? (
                      <>
                        This run performs <span className="font-semibold">{auditsThisRun}</span>{' '}
                        audit{auditsThisRun === 1 ? '' : 's'} and pushes{' '}
                        <span className="font-semibold">{willRun}</span> lead{willRun === 1 ? '' : 's'}
                        {' '}(~<span className="font-semibold">${costUsd.toFixed(2)}</span>
                        {auditsThisRun === 0 && ' — nothing to audit'}). Proceed?
                      </>
                    ) : (
                      <>
                        Uploads <span className="font-semibold">{willRun}</span> lead{willRun === 1 ? '' : 's'}{' '}
                        to the campaign. <span className="font-semibold">No audit, no cost.</span> Proceed?
                      </>
                    )}
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
            {auditsThisRun > 0 ? `Audit ${auditsThisRun} and push ${willRun}` : `Push ${willRun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
