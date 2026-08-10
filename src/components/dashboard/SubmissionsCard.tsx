import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardList, Loader2, MailWarning } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubmissions, notifyStateFor, isPaidSubmission, needsQ2, daysSince, type NotifyState } from '@/hooks/useSubmissions';

/* ══ WHO FILLED IN MY FORM? ═══════════════════════════════════════════════════════════════════
   ⛔ THE POINT: email stops being the only thing that says somebody filled the questionnaire in.
   The notifier retries a failed send three times now, but a delivered email can still land in
   spam, and a submission with no lead_id has no trace anywhere else in the app — NextActionsCard's
   chase task is keyed on a lead and only fires after a day. This shows every submission the moment
   it lands, whether or not any email worked.

   ⚠️ IT SHOWS THE NOTIFICATION STATE PER ROW, not a total. "3 notifications lost" would be wrong
   in both directions: rows retired on purpose (they paid inside the delay window, or predate
   outcome recording) sit in the same not-delivered state as a genuine failure, and only the reason
   tells them apart. So the reason is what is rendered. */

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

export function SubmissionsCard() {
  const navigate = useNavigate();
  const { rows, summary, isLoading, error, refetch } = useSubmissions(10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
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
              const paid = isPaidSubmission(r);
              const name = (r.business_name ?? '').trim() || 'Unnamed';
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-sm ${
                    r.lead_id ? 'cursor-pointer hover:bg-muted/50' : ''
                  }`}
                  onClick={r.lead_id ? () => navigate(`/outreach?leadId=${r.lead_id}`) : undefined}
                >
                  <span className="font-medium">{name}</span>
                  {r.confirmed_location && (
                    <span className="text-xs text-muted-foreground">{r.confirmed_location}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{when(r.created_at)}</span>
                  {paid
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
                  {needsQ2(r) && (
                    <span className="w-full text-xs text-red-600/80">
                      Delivery cannot start until they give their town, services and address &mdash; and
                      the baseline the guarantee is measured against waits for the same answers.
                    </span>
                  )}
                  {r.notify_error && notifyStateFor(r) === 'failed' && (
                    <span className="w-full text-xs text-red-600/80">{r.notify_error}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
