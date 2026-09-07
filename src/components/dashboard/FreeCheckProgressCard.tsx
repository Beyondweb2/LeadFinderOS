import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { useFreeCheckProgress, type FreeCheckRow } from '@/hooks/useFreeCheckProgress';
import { emailStateFor, whatsappStateFor, type FreeCheckStage, type SendState } from '@/lib/freeCheckProgress';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WATCH A FREE CHECK GO THROUGH — the screen that did not exist.

   ⛔ THE PROBLEM IT SOLVES, in Paul's words (2026-09-07): "I submit a free check and I'm blind — I
   can't tell if the audit is running, done, or failed, so every test is guesswork." The data was
   always there, across five tables, surfaced nowhere. The glue-pot incident is what it cost: an
   operator email confidently narrating a state that had never happened, and no screen to check it
   against.

   ⛔ EVERY CLAIM ON THIS CARD NAMES ITS EVIDENCE. "Result sent" appears only when the send stamp
   exists; "audit running" only while a run is genuinely unsettled. There is no optimistic default
   anywhere — an unestablished stage prints "never started", not something reassuring.

   ⛔ "ACCEPTED" IS NOT "DELIVERED", AND THE EMAIL COLUMN SAYS ACCEPTED. Our database records that
   Resend returned 2xx; whether a mailbox received it is a fact that lives only in Resend's delivery
   events. Measured 2026-09-07: 19 rows carry that stamp and not one carries a provider error, so
   from our side every email "worked" — which is exactly why the word matters. WhatsApp is different
   and does carry a real receipt, so its column can legitimately say delivered.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const STAGE: Record<FreeCheckStage, { label: string; className: string }> = {
  complete: { label: 'Result sent', className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  running: { label: 'Measuring', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  stranded: { label: 'FINISHED, NOT SENT', className: 'bg-amber-500/20 text-amber-700 border-amber-500/40' },
  failed: { label: 'AUDIT FAILED', className: 'bg-red-500/15 text-red-600 border-red-500/30' },
  no_audit: { label: 'No audit ran', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  no_lead: { label: 'No lead created', className: 'bg-red-500/15 text-red-600 border-red-500/30' },
  unknown: { label: 'Never started', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
};

/** The send words, kept honest per channel. */
const SEND: Record<SendState, string> = {
  accepted: 'accepted', pending: 'pending', failed: 'FAILED', retired: 'not needed', none: 'not sent',
};
const sendTone = (s: SendState) =>
  s === 'failed' ? 'text-red-600' : s === 'accepted' ? 'text-foreground/80' : 'text-muted-foreground/60';

const shortTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Row({ r }: { r: FreeCheckRow }) {
  const s = STAGE[r.progress.stage];
  const email = emailStateFor(r);
  const wa = whatsappStateFor(r.whatsapp_status);
  return (
    <div className="border-t border-border/40 py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-foreground">
          {(r.business_name ?? '').trim() || 'Unnamed'}
        </span>
        <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>
        {r.progress.stage === 'running' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {shortTime(r.submitted_at)}
        </span>
      </div>

      <p className={`mt-1 text-[11px] leading-snug ${r.progress.needsYou ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}`}>
        {r.progress.detail}
      </p>

      {/* The measurement's own progress, only when there is a measurement to report. A 0-of-0 bar
          on a submission that never audited would be theatre. */}
      {r.progress.questionsTotal > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${r.progress.stage === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.round((r.progress.questionsDone / r.progress.questionsTotal) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {r.progress.runsDone}/{r.progress.runsTarget} runs · {r.progress.questionsDone}/{r.progress.questionsTotal} questions
          </span>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
        <span title="The operator alert to you. 'Accepted' means Resend took the message — arrival is not recorded in our database, only in Resend's delivery events.">
          alert email <span className={`font-semibold ${sendTone(email)}`}>{SEND[email]}</span>
        </span>
        <span title="The prospect's result email. Its stamp is written when the send path runs; like the alert, acceptance is not proof of arrival.">
          result <span className={`font-semibold ${r.result_sent_at ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>
            {r.result_sent_at ? `sent ${shortTime(r.result_sent_at)}` : 'not sent'}
          </span>
        </span>
        <span title="WhatsApp DOES report real delivery, unlike email — this is a genuine receipt from Meta.">
          whatsapp <span className={`font-semibold ${sendTone(wa)}`}>{SEND[wa]}</span>
        </span>
        {r.contact_email && <span className="truncate">{r.contact_email}</span>}
        {r.progress.reportUrl && (
          <a
            href={r.progress.reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground/80 underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60"
          >
            report <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export function FreeCheckProgressCard() {
  const { rows, isLoading, error, live, refetch } = useFreeCheckProgress();
  const needing = rows.filter((r) => r.progress.needsYou).length;

  return (
    <Card>
      <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            Free checks
            {live && <span className="ml-2 text-[10px] font-normal text-blue-600">live</span>}
            {needing > 0 && (
              <span className="ml-2 text-[10px] font-normal text-amber-700 dark:text-amber-500">
                {needing} need{needing === 1 ? 's' : ''} you
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => void refetch()} title="Refresh now">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground/70">
          Every submission and exactly where it got to. Refreshes itself while an audit is running.
        </p>
      </CardHeader>
      <CardContent className="p-3 pt-1 sm:p-4 sm:pt-2">
        {/* ⛔ THREE OUTCOMES, THREE MESSAGES. A read that FAILED must never render as "none yet" —
            that is the RLS-returns-empty-array trap, and on this card it would say the free check
            has never been used. */}
        {error ? (
          <p className="py-2 text-[11px] text-red-600">
            Could not read the submissions ({error}). This is not "none" — the data was not readable.
          </p>
        ) : isLoading ? (
          <p className="py-2 text-[11px] text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-foreground">
            No free checks submitted yet.
          </p>
        ) : (
          <div>{rows.map((r) => <Row key={r.onboarding_id} r={r} />)}</div>
        )}
      </CardContent>
    </Card>
  );
}
