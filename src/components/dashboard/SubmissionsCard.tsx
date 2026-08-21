import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ClipboardList, Loader2, MailWarning, MessageCircle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { firstNameFrom, questionnaireFollowupBody } from '@/lib/questionnaireFollowup';
import {
  useSubmissions, notifyStateFor, isPaidSubmission, isLeadPaid, needsQ2, daysSince,
  type NotifyState, type SubmissionRow,
} from '@/hooks/useSubmissions';

/* ══ WHO FILLED IN MY FORM? ═══════════════════════════════════════════════════════════════════
   ⛔ THE POINT: email stops being the only thing that says somebody filled the questionnaire in.
   The notifier retries a failed send three times now, but a delivered email can still land in
   spam, and a submission with no lead_id has no trace anywhere else in the app — NextActionsCard's
   chase task is keyed on a lead and only fires after a day. This shows every submission the moment
   it lands, whether or not any email worked.

   ⚠️ IT SHOWS THE NOTIFICATION STATE PER ROW, not a total. "3 notifications lost" would be wrong
   in both directions: rows retired on purpose (they paid inside the delay window, or predate
   outcome recording) sit in the same not-delivered state as a genuine failure, and only the reason
   tells them apart. So the reason is what is rendered.

   ── THE NUDGE + DELETE CONTROLS (2026-08-22) ──────────────────────────────────────────────────
   ⛔ THE PER-ROW NUDGE REUSES THE LEAD-CARD GUARD EXACTLY (showNudge = row && !rowPaid && !leadPaid)
   and the server still enforces the real rules (pitchEverSent one-per-lead, no_contact_name). The
   button also needs a lead_id AND a phone — send-whatsapp-message resolves NOTHING from a lead_id,
   it sends to the phone in the request — so a lead-less or phone-less row shows no button.

   ⛔ BULK DELETE SKIPS PAID ROWS, ENFORCED SERVER-SIDE (see the endpoint). A paying customer's
   answers are real data, not test junk. Delete-selected / delete-all pass allow_paid:false so the
   server keeps paid rows and tells us how many it kept. A single per-row delete passes
   allow_paid:true — you can remove one deliberately, with its own confirm. */

const NOTIFY_BADGE: Record<NotifyState, { label: string; className: string } | null> = {
  /* The happy path gets NO badge. A row per submission all saying "emailed" is noise that hides
     the one that says otherwise. */
  delivered: null,
  pending: { label: 'email pending', className: 'bg-muted text-muted-foreground border-transparent' },
  failed: { label: 'EMAIL FAILED', className: 'bg-red-500/15 text-red-600 border-red-500/30' },
  retired: { label: 'no email needed', className: 'bg-muted text-muted-foreground border-transparent' },
};

const when = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/** The nudge is offered on the same terms as the lead card: a submitted-but-unpaid row that has a
 *  lead with a phone. Followup already sent is handled separately (shown as a note). */
const canNudge = (r: SubmissionRow) =>
  !isPaidSubmission(r) && !isLeadPaid(r) && !!r.lead_id && !!(r.lead_phone ?? '').trim();

type PendingDelete = { scope: 'single' | 'selected' | 'all'; ids: string[]; allowPaid: boolean; label: string };

export function SubmissionsCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { rows, summary, isLoading, error, refetch, deleteRows } = useSubmissions(25);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-row nudge confirm state — only one row can be mid-confirm at a time.
  const [nudgeId, setNudgeId] = useState<string | null>(null);
  const [nudgeName, setNudgeName] = useState('');
  const [nudgeSending, setNudgeSending] = useState(false);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const runDelete = async () => {
    if (!pending) return;
    setDeleting(true);
    try {
      const { deleted, skippedPaid } = await deleteRows(pending.ids, pending.allowPaid);
      setSelected(new Set());
      toast({
        title: deleted ? `Deleted ${deleted} submission${deleted === 1 ? '' : 's'}` : 'Nothing deleted',
        description: skippedPaid > 0
          ? `${skippedPaid} paid customer row${skippedPaid === 1 ? '' : 's'} kept — delete those one at a time if you really mean to.`
          : undefined,
      });
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setDeleting(false);
      setPending(null);
    }
  };

  const openNudge = (r: SubmissionRow) => { setNudgeId(r.id); setNudgeName(''); };

  const sendNudge = async (r: SubmissionRow) => {
    const existingFirst = firstNameFrom(r.lead_contact_name);
    const effectiveFirst = existingFirst || firstNameFrom(nudgeName);
    if (!effectiveFirst || nudgeSending || !r.lead_id) return;
    setNudgeSending(true);
    try {
      /* Save a typed name to the lead FIRST — the server resolves {{1}} from the lead row, not from
         this request, so the send and the record cannot disagree (same as the lead card). */
      if (!existingFirst && nudgeName.trim()) {
        await supabase.from('outreach_leads').update({ contact_name: nudgeName.trim() }).eq('id', r.lead_id);
      }
      const { data, error: e } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: r.lead_id, phone: r.lead_phone ?? '', country: r.lead_country ?? undefined, template_name: 'questionnaire_followup' },
      });
      if (e || !data?.ok) {
        const code = e?.message ?? data?.error ?? 'send failed';
        toast({
          title: 'Not sent',
          description: code === 'pitch_already_sent' ? 'This nudge has already gone to this lead — one per lead, no repeats.'
            : code === 'no_contact_name' ? 'The lead has no contact name saved — add their first name and try again.'
            : code === 'unknown_template' ? 'The send path is not deployed yet (waiting on Meta approval).'
            : String(code),
          variant: 'destructive',
        });
        if (code === 'pitch_already_sent') { setNudgeId(null); void refetch(); }
        return;
      }
      setNudgeId(null);
      toast({ title: 'Nudge sent', description: `questionnaire_followup to ${r.business_name ?? 'the lead'}.` });
      void refetch();
    } finally {
      setNudgeSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Questionnaire submissions
          {/* ⛔ FIRST, AND IN RED. A paid customer whose delivery cannot start is the only row here
              with a refund attached to it, and the whole point is not discovering it at week eight. */}
          {summary.awaitingQ2 > 0 && (
            <Badge variant="outline" className="ml-1 border-red-500/30 bg-red-500/15 text-xs text-red-600">
              {summary.awaitingQ2} awaiting details
            </Badge>
          )}
          {summary.undelivered > 0 && (
            <Badge variant="outline" className="ml-1 border-red-500/30 bg-red-500/15 text-xs text-red-600">
              <MailWarning className="mr-1 h-3 w-3" />
              {summary.undelivered} not emailed
            </Badge>
          )}
          <span className="flex-1" />
          {selected.size > 0 && (
            <Button
              variant="outline" size="sm"
              className="h-7 border-red-500/30 text-xs text-red-600 hover:bg-red-500/10"
              onClick={() => setPending({ scope: 'selected', ids: [...selected], allowPaid: false, label: `${selected.size} selected submission${selected.size === 1 ? '' : 's'}` })}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete selected ({selected.size})
            </Button>
          )}
          {rows.length > 0 && (
            <Button
              variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
              onClick={() => setPending({ scope: 'all', ids: rows.map((r) => r.id), allowPaid: false, label: 'every submission shown' })}
            >
              Delete all
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading submissions&hellip;
          </p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          /* ⛔ SAYS "NONE YET", NOT "ALL CLEAR". This table is read through an endpoint precisely
             because an empty list used to be what a denied read looked like. */
          <p className="text-sm text-muted-foreground">
            Nobody has filled in the questionnaire yet. This list is read straight from the table,
            so it does not depend on an email arriving.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const badge = NOTIFY_BADGE[notifyStateFor(r)];
              const paid = isPaidSubmission(r) || isLeadPaid(r);
              const name = (r.business_name ?? '').trim() || 'Unnamed';
              const existingFirst = firstNameFrom(r.lead_contact_name);
              const effectiveFirst = existingFirst || firstNameFrom(nudgeName);
              return (
                <li key={r.id} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      aria-label={`Select ${name}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className={`font-medium ${r.lead_id ? 'hover:underline' : ''}`}
                      onClick={r.lead_id ? () => navigate(`/outreach?leadId=${r.lead_id}`) : undefined}
                      disabled={!r.lead_id}
                    >
                      {name}
                    </button>
                    {r.confirmed_location && (
                      <span className="text-xs text-muted-foreground">{r.confirmed_location}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{when(r.created_at)}</span>
                    {isPaidSubmission(r)
                      ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-600">paid</Badge>
                      : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-xs text-amber-600">not paid</Badge>}
                    {/* ⛔ ITS OWN STATE, NOT MIXED IN. "paid" alone would read as done; this row is
                        paid AND blocked, and the day count is what turns it into a chase. */}
                    {needsQ2(r) && (
                      <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-xs text-red-600">
                        no details yet &middot; day {daysSince(r.created_at)}
                      </Badge>
                    )}
                    {r.incomplete && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">partial</Badge>
                    )}
                    {/* No lead means NextActionsCard can never chase it — worth saying, because that
                        is the submission most likely to be forgotten entirely. */}
                    {!r.lead_id && (
                      <span className="text-xs text-muted-foreground">no lead attached</span>
                    )}
                    {badge && (
                      <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                    )}

                    <span className="flex-1" />

                    {/* The nudge — same terms as the lead card. Already-sent says so; a live one
                        opens the inline confirm below. */}
                    {canNudge(r) && (
                      r.followup_sent
                        ? <span className="text-xs italic text-muted-foreground">nudge sent</span>
                        : nudgeId !== r.id && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => openNudge(r)}>
                            <MessageCircle className="mr-1 h-3 w-3" /> Nudge
                          </Button>
                        )
                    )}
                    <Button
                      size="icon" variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600"
                      title="Delete this submission"
                      onClick={() => setPending({
                        scope: 'single', ids: [r.id], allowPaid: true,
                        label: paid ? `${name} — a PAID customer's answers` : name,
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {needsQ2(r) && (
                    <p className="mt-1 text-xs text-red-600/80">
                      Delivery cannot start until they give their town, services and address &mdash; and
                      the baseline the guarantee is measured against waits for the same answers.
                    </p>
                  )}
                  {r.notify_error && notifyStateFor(r) === 'failed' && (
                    <p className="mt-1 text-xs text-red-600/80">{r.notify_error}</p>
                  )}

                  {/* Inline nudge confirm, mirroring the lead card: name (if missing) → preview → send. */}
                  {nudgeId === r.id && (
                    <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                      {!existingFirst && (
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                            Their first name (no name saved on this lead — it will be saved as the contact name)
                          </label>
                          <Input value={nudgeName} onChange={(e) => setNudgeName(e.target.value)} placeholder="e.g. Ronnie" className="h-7 text-xs" />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[11px]">
                        {questionnaireFollowupBody(effectiveFirst, r.business_name ?? '')}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" disabled={!effectiveFirst || nudgeSending} onClick={() => void sendNudge(r)}>
                          {nudgeSending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Send it
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNudgeId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !deleting) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pending?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.scope === 'single'
                ? 'This removes the questionnaire submission permanently. It cannot be undone.'
                : 'This removes the selected questionnaire submissions permanently. Paid customers’ rows are kept automatically — delete those one at a time if you really mean to. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); void runDelete(); }}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
