import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  MARKET_AUDIT_QUESTION_COUNT, MARKET_AUDIT_MIN_AUDITS, MARKET_POOL_FRESH_MS,
  asPence, auditsToRun, deriveRun, elapsedPhrase, measureAction, measureProgress, measureRunCost,
  stalledPhrase,
  type MarketAuditProgress, type MeasureAction, type MeasurePhase,
} from '@/lib/marketView';

/* ============================================================
   MEASURE THIS MARKET — one button, trade and town, everything else automatic.

   ⛔ WHAT THIS REPLACED, because the shape of it is the point. The old path was: press Find Leads,
   wait, press "Audit this market", read a dialog, press Confirm, then five minutes during which
   nothing on screen moved, and a sentence buried in a paragraph saying "1 audit still running".
   Five clicks, two dialogs, no feedback, on a thing used every day. And it ran ONE audit, so it
   landed on "not enough measured yet" — the view refuses to call a shape below two.

   THE SEQUENCE: search -> gate -> audit 1 -> audit 2 -> poll -> results.

   ⛔ SEARCH FIRST, NOT IN PARALLEL, THOUGH IT COULD BE. See the note on MARKET_SEARCH_USD: a market
   audit reads nothing from the pool, so they are independent — but the search is the only typo
   detector there is, and parallelising trades that guard for about twenty seconds of a five-and-a-
   half minute run.

   ⛔ THE AUDITS ARE CREATED SEQUENTIALLY. create-ai-audit's coverage directive reads the queue rows
   of audits already run for this trade and town, and writes its own before returning. Both at once
   means both get no coverage hint and ask overlapping questions, which is the whole reason for
   running two. `await` between them is load-bearing.

   ⛔ NO CONFIRM DIALOG. The cost is on the button instead, where it is read every time rather than
   once. What protects a mis-press is three things, none of them a dialog: the price on the face of
   the button, the search gate (a mistyped town finds nothing and the audits never start), and a
   SERVER-side ten-minute cooldown in create-ai-audit — because client state resets on reload and
   that is exactly how repeated pressing happens.
   ============================================================ */

export interface MeasureMarketProps {
  trade: string;
  town: string;
  /** Completed market audits this market already has, from the view. */
  completedMarketAudits: number;
  /** ⛔ THE UNFINISHED MARKET AUDITS, STRAIGHT FROM THE VIEW. This is what makes the bar survive a
   *  reload: the truth about what is running lives in the database, and this is it. Supplies which
   *  audits, how many questions each, and when they started — identity and origin. The 5-second
   *  queue poll supplies the movement. */
  marketProgress: MarketAuditProgress[] | undefined;
  /** When the cached lead pool was searched, or null. Inside 72h the search is free. */
  poolSearchedAt: string | null;
  /** Runs the same lead search the manual button runs. Resolves to the number of businesses found. */
  onSearch: () => Promise<number>;
  /** Re-reads the market view. */
  onReload: () => Promise<void>;
  /** ⛔ CALLED ONLY WHEN A MEASUREMENT FINISHES, never on a refresh. The panel decides whether the
   *  extraction was dirty enough to be worth cleaning — it owns the view, so it owns the threshold.
   *  Separate from onReload because refreshing a settled market must never spend anything. */
  onMeasureComplete?: () => Promise<void>;
}

interface QRow { status: string | null }

/** ⛔ 5s WHILE RUNNING. The old panel polled at 45s, which is why the screen looked dead. Sixteen
 *  queue rows is a cheap read, and it is what makes the bar move at the moments it genuinely can. */
const POLL_MS = 5_000;

/** Elapsed, with no claim about how long it should take. Used for the search, whose duration the
 *  audit median says nothing about. */
function secondsOnly(startedMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - startedMs) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function MeasureMarket({
  trade, town, completedMarketAudits, marketProgress, poolSearchedAt, onSearch, onReload,
  onMeasureComplete,
}: MeasureMarketProps) {
  const { toast } = useToast();
  /* ⛔ `sessionPhase` IS ONLY WHAT THIS TAB IS DOING RIGHT NOW — searching, starting, blocked, failed.
     It is deliberately NOT the source of truth for "an audit is running": that comes from the view,
     so a reload rebuilds it. Component state was always going to lose this. */
  const [sessionPhase, setSessionPhase] = useState<MeasurePhase | null>(null);
  const [auditIds, setAuditIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [found, setFound] = useState<number | null>(null);
  const [sessionStartedMs, setSessionStartedMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [blocked, setBlocked] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Set when the gate fired, so the override appears AFTER the refusal rather than as a checkbox
   *  ticked in advance. Assessing a town before deciding to sell into it is a real case; pre-arming
   *  it would also disarm the guard for the mistyped-town case it exists for. */
  const [offerOverride, setOfferOverride] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const poolFresh = !!poolSearchedAt && (Date.now() - new Date(poolSearchedAt).getTime()) < MARKET_POOL_FRESH_MS;

  /* THE DERIVED RUN. On mount this is the whole story: if the view says audits are unfinished, the
     bar is there, seeded with their real start time so elapsed resumes from the beginning rather
     than from when the page happened to load. */
  const derived = deriveRun(marketProgress, nowMs);
  /* A session phase wins ONLY while it is doing something the database cannot know about — searching
     (nothing records a search in progress) or reporting a refusal. Otherwise the database wins. */
  const sessionOwns = sessionPhase === 'searching' || sessionPhase === 'blocked' || sessionPhase === 'failed';
  const phase: MeasurePhase = sessionOwns
    ? sessionPhase as MeasurePhase
    : derived.phase === 'idle' ? (sessionPhase ?? 'idle') : derived.phase;

  const action: MeasureAction = measureAction(completedMarketAudits, derived.auditIds.length);
  const audits = auditsToRun(action);
  const cost = measureRunCost(poolFresh, audits);
  const running = phase === 'searching' || phase === 'starting' || phase === 'answering';
  /* The queue poll's rows when this tab started the run; the view's counts otherwise. Both describe
     the same questions — one is just fresher. */
  const rows = questions.length ? questions : Array.from(
    { length: derived.questionsTotal },
    (_, i) => ({ status: i < derived.questionsDone ? 'done' : 'running' }),
  );
  const progress = measureProgress(phase, rows, found);
  const startedMs = sessionStartedMs ?? derived.startedMs;

  /* The clock for the elapsed line. Separate from the poll so the seconds tick smoothly while the
     queue is read at its own, slower rate. */
  useEffect(() => {
    /* Also while stalled: the staleness message counts minutes of silence, and a frozen clock would
       have it stuck on whatever it said when the tab last rendered. */
    if (!running && phase !== 'stalled') return;
    const t = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [running, phase]);

  /** Read the queue rows for the audits this run started. One query, all runs. */
  const readQueue = useCallback(async (ids: string[]): Promise<QRow[]> => {
    if (!ids.length) return [];
    const client = supabase as unknown as {
      from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: QRow[] | null }> } };
    };
    const { data } = await client.from('ai_audit_queue').select('status').in('audit_id', ids);
    return data ?? [];
  }, []);

  /* ⛔ POLL WHATEVER IS RUNNING, not only what this tab started. The ids come from the derived run
     on a reload and from the run itself in-session, which is what lets the 5-second cadence survive
     a refresh instead of dropping back to the view's 45-second poll. */
  /* ⛔ A STRING, NOT THE ARRAY, AND THE EFFECT REBUILDS THE ARRAY FROM IT. `derived.auditIds` is a
     fresh array on every render, so depending on it would tear down and restart the 5-second
     interval continuously — a poll that never completes a cycle. Keying on the joined ids makes the
     dependency what it actually is: the identity of the set, not the object. Splitting it back
     inside the effect keeps eslint's rule satisfied honestly rather than suppressed. */
  const pollKey = (auditIds.length ? auditIds : derived.auditIds).join(',');
  useEffect(() => {
    const ids = pollKey ? pollKey.split(',') : [];
    if (phase !== 'answering' || ids.length === 0) return;
    let stop = false;
    const tick = async () => {
      const fresh = await readQueue(ids);
      if (stop || cancelled.current) return;
      setQuestions(fresh);
      const settled = fresh.length > 0 && fresh.every((r) => r.status === 'done' || r.status === 'failed');
      if (settled) {
        /* Reload rather than declaring done locally: the VIEW decides when a market is measured, and
           a bar that reaches 100% while the panel still says measuring is the same broken promise as
           a fake one. Once the view drops the audit from marketProgress, derived.phase goes idle. */
        setSessionPhase(null);
        setQuestions([]);
        await onReload();
        /* The one place a measurement is known to have just finished. The panel checks the junk
           ratio and cleans only if it is over — see shouldAutoClean. */
        if (onMeasureComplete) await onMeasureComplete();
      }
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [phase, pollKey, readQueue, onReload, onMeasureComplete]);

  /** One market audit. Returns its id, or throws with the server's own error code. */
  const startOne = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; audit_id?: string; age_seconds?: number }>(
      'create-ai-audit',
      {
        body: {
          market_only: true, purpose: 'market',
          business_type: trade, location_text: town,
          question_count: MARKET_AUDIT_QUESTION_COUNT,
          business_scope: 'local', has_website: false,
        },
      },
    );
    /* THE SERVER'S OWN STRING, dug out of the wrapper. supabase-js buries the body of a non-2xx in
       error.context, and a generic "Edge Function returned a non-2xx status code" is what makes a
       cooldown look like a crash. */
    let code = data?.error ?? null;
    let age: number | null = data?.age_seconds ?? null;
    if (error) {
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx?.text) {
          const body = await ctx.text();
          const parsed = body ? JSON.parse(body) as { error?: string; age_seconds?: number } : null;
          if (parsed?.error) code = parsed.error;
          if (typeof parsed?.age_seconds === 'number') age = parsed.age_seconds;
        }
      } catch { /* keep whatever we have */ }
    }
    if (code === 'market_cooldown') {
      const mins = age !== null ? Math.max(1, Math.round(age / 60)) : null;
      throw new Error(`COOLDOWN:Already measuring ${trade} in ${town}${mins ? `, started ${mins} minute${mins === 1 ? '' : 's'} ago` : ''}.`);
    }
    if (error || data?.ok === false || !data?.audit_id) {
      throw new Error(code ?? error?.message ?? 'Could not start the market audit.');
    }
    return data.audit_id;
  }, [trade, town]);

  const run = useCallback(async (skipGate: boolean) => {
    setBlocked(null); setNote(null); setOfferOverride(false);
    setQuestions([]); setAuditIds([]); setFound(null);
    setSessionStartedMs(Date.now()); setNowMs(Date.now());

    try {
      /* 1. THE SEARCH, unless the pool is fresh or the operator has overridden the gate. */
      let businesses: number | null = null;
      if (!poolFresh && !skipGate) {
        setSessionPhase('searching');
        businesses = await onSearch();
        if (cancelled.current) return;
        setFound(businesses);
        if (businesses === 0) {
          /* ⛔ THE GATE. Zero businesses almost always means the town is mistyped, and stopping here
             costs 8p instead of 21p and leaves no audit rows for a town that does not exist. The
             override appears only now, because the one real reason to continue — assessing a town
             before deciding to sell into it — is a decision made in response to this, not before. */
          setSessionPhase('blocked');
          setBlocked(`No businesses found for ${trade} in ${town}. That usually means the town is misspelled.`);
          setOfferOverride(true);
          return;
        }
      } else if (poolFresh) {
        setNote('Pool searched in the last 72 hours, so the search was free.');
      }

      /* 2. THE AUDITS, one after the other. See the header note: the await is load-bearing. */
      setSessionPhase('starting');
      const ids: string[] = [];
      for (let i = 0; i < audits; i++) {
        try {
          ids.push(await startOne());
          setAuditIds([...ids]);
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.startsWith('COOLDOWN:')) {
            setSessionPhase('blocked');
            setBlocked(msg.slice('COOLDOWN:'.length));
            await onReload();
            return;
          }
          /* ⛔ A PARTIAL START IS NOT AN ERROR SCREEN. If the second call fails the market has one
             audit, which is the "not enough measured yet" state this whole rebuild exists to stop
             the operator landing on. Keep the first one, say so plainly, and let the button become
             "Finish measuring" — a next step rather than a dead end. */
          if (ids.length > 0) {
            setNote(`Started ${ids.length} of ${audits}. The second did not start: ${msg}. Press Finish measuring when this one is done.`);
            break;
          }
          setSessionPhase('failed');
          setBlocked(msg);
          return;
        }
      }
      if (ids.length === 0) { setSessionPhase('failed'); return; }

      /* 3. WATCH. The queue rows exist by now — create-ai-audit inserts them before it returns. */
      setSessionPhase('answering');
      await onReload();
    } catch (e) {
      setSessionPhase('failed');
      setBlocked((e as Error).message);
    }
  }, [poolFresh, onSearch, trade, town, audits, startOne, onReload]);

  const refresh = useCallback(async () => {
    setSessionPhase('idle'); setBlocked(null); setNote(null);
    await onReload();
    toast({ title: 'Market refreshed', description: `Re-read ${trade} in ${town}. Nothing was spent.` });
  }, [onReload, toast, trade, town]);

  const LABEL: Record<MeasureAction, string> = {
    measure: 'Measure this market',
    finish: 'Finish measuring',
    refresh: 'Refresh this market',
    running: 'Measuring...',
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => (action === 'refresh' || action === 'running' ? void refresh() : void run(false))}
          disabled={running || action === 'running' || !trade || !town}
          className="min-w-[13.5rem]"
        >
          {running
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : action === 'running'
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : action === 'refresh'
                ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {running ? 'Measuring...' : LABEL[action]}
          {/* ⛔ THE PRICE IS ON THE BUTTON, not in a dialog. It is the thing the removed confirm was
              actually for, and here it is read on every press rather than once. Refresh says free
              because it is free — re-reading spends nothing. */}
          {!running && (
            <span className="ml-1.5 opacity-80">· {action === 'refresh' || action === 'running' ? 'free' : `~${asPence(cost)}`}</span>
          )}
        </Button>

        {/* THE WIDEN OPTION, priced, and only once the market is already measured. Running two more
            automatically would re-answer a question that has been answered, and coverage directives
            thin out with each round. */}
        {action === 'refresh' && !running && (
          <Button size="sm" variant="outline" onClick={() => void run(true)}>
            Add another audit · ~{asPence(measureRunCost(true, 1))}
          </Button>
        )}
      </div>

      {/* ⛔ A REAL BAR. Every point of it is a state that exists — see QUESTION_STATE_SCORE. The
          elapsed time sits BESIDE it as text and never fills it. */}
      {(running || phase === 'stalled') && (
        <div className="space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            {/* ⛔ A STALLED BAR MUST NOT LOOK LIKE A MOVING ONE. Amber, and the label says stopped.
                An audit past MARKET_AUDIT_STALE_MS has stopped moving and will not restart on its
                own, so a bar still implying progress is worse than no bar — the operator sits and
                waits for something that is never coming. */}
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${phase === 'stalled' ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${progress.percent}%` }}
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={progress.label}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className={phase === 'stalled' ? 'font-medium text-amber-600' : undefined}>{progress.label}</span>
            {/* ⛔ NOT DURING THE SEARCH. The median is the AUDIT's, so "0m 07s - usually about 5
                minutes" against a 10-30 second search was simply wrong, and it appeared in the one
                window where the operator is already wondering whether anything is happening. The
                search gets a plain elapsed count with no comparison it cannot meet. */}
            {startedMs !== null && phase === 'searching' && (
              <span className="tabular-nums">{secondsOnly(startedMs, nowMs)}</span>
            )}
            {startedMs !== null && (phase === 'starting' || phase === 'answering') && (
              <span className="tabular-nums">{elapsedPhrase(startedMs, nowMs)}</span>
            )}
          </div>
          {phase === 'stalled' && startedMs !== null && (
            <p className="text-xs text-amber-600">{stalledPhrase(startedMs, nowMs)}</p>
          )}
          {phase === 'stalled' && derived.error && (
            /* THE RAW STRING off the queue row, never a wrapper. A catch-all message is what sent
               the last diagnosis chasing question wording while an Apify 402 sat unread. */
            <p className="break-words text-xs text-muted-foreground">{derived.error}</p>
          )}
        </div>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {blocked && (
        <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="flex-1 text-xs text-muted-foreground">{blocked}</p>
          {offerOverride && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void run(true)}>
              Measure it anyway · ~{asPence(measureRunCost(true, MARKET_AUDIT_MIN_AUDITS))}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
