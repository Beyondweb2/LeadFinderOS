import { useEffect, useState } from 'react';
import { Loader2, ClipboardList, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { firstNameFrom, questionnaireFollowupBody } from '@/lib/questionnaireFollowup';
import { isPaidLead } from '@/lib/leadPayment';
import type { OutreachLead } from '@/types/outreach';

/* ============================================================
   THE QUESTIONNAIRE, ON THE LEAD CARD — read-only answers + the one manual nudge (2026-08-17).

   ⛔ WHY THIS FETCHES THROUGH THE `submissions` ENDPOINT: onboarding_responses has RLS enabled
   with NO policies, so a direct SPA read returns HTTP 200 with [] — indistinguishable from "never
   filled in" (CLAUDE.md §8, three recorded casualties). The endpoint also returns followup_sent
   from the message log, so the send button's guard and this fetch are one round trip.

   ⛔ ABSENCE IS NEVER WORDED AS A REFUSAL. An unanswered question renders "Not asked yet" (or
   "Not answered yet" once they've paid and Q2 is theirs to fill) — the serveGate wording lesson,
   applied here from day one. A field from before the form carried it says "Not captured".

   ⛔ THE NUDGE IS MANUAL, ONCE PER LEAD, NO OVERRIDE. The server enforces both (pitchEverSent with
   no allow_resend); the disabled button is the courtesy copy of that rule, never the enforcement.
   Until Meta approves the template AND the send path deploys, a press fails safe with the server's
   own refusal — nothing can go out early.
   ============================================================ */

interface QRow {
  id: string;
  status: string | null;
  created_at: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  gbp_consent?: string | null;
  services?: string | null;
  services_list?: string[] | null;
  confirmed_location?: string | null;
  areas_list?: string[] | null;
  business_address?: string | null;
  confirmed_phone?: string | null;
  website_platform?: string | null;
  website_platform_other?: string | null;
  website_manager?: string | null;
  website_manager_email?: string | null;
  willing_to_migrate?: string | null;
  gbp_exists?: string | null;
  gbp_status?: string | null;
  gbp_verified?: string | null;
  photos_status?: string | null;
  must_not_say?: string | null;
  competitor_name?: string | null;
  accreditations?: string | null;
}

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';

function held(v: unknown): string | null {
  if (Array.isArray(v)) { const parts = v.map((x) => String(x).trim()).filter(Boolean); return parts.length ? parts.join(', ') : null; }
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

export function LeadQuestionnaireSection({ lead, onUpdateLead }: {
  lead: OutreachLead;
  onUpdateLead: (leadId: string, updates: Partial<OutreachLead>) => Promise<OutreachLead | null> | void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<QRow | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [followupSent, setFollowupSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typedFirstName, setTypedFirstName] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke('submissions', { body: { lead_id: lead.id } });
        if (!alive) return;
        if (e || !data?.ok) { setError(e?.message ?? data?.error ?? 'could not read'); setLoading(false); return; }
        setRow((data.row ?? null) as QRow | null);
        setRowCount(Number(data.row_count) || 0);
        setFollowupSent(data.followup_sent === true);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'could not read');
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [lead.id]);

  const rowPaid = row?.status === 'paid';
  const leadPaid = isPaidLead(lead);
  const q2Done = !!(held(row?.confirmed_location) && held(row?.services) && held(row?.business_address));

  /* One wording for every empty Q2 answer, decided by whose turn it is: before payment the
     question literally has not been asked; after payment it is theirs to answer. */
  const q2Absent = rowPaid || leadPaid ? 'Not answered yet' : 'Not asked yet (comes after payment)';
  const q1Absent = 'Not captured'; // old rows predate some Q1 fields — absence is not refusal

  const val = (v: unknown, absent: string) => {
    const h = held(v);
    return h
      ? <span className="text-foreground/90">{h}</span>
      : <span className="italic text-muted-foreground/70">{absent}</span>;
  };

  const stateLabel = !row
    ? 'Not started'
    : rowPaid || leadPaid
      ? (q2Done ? 'Paid — details complete' : 'Paid — awaiting details (the post-payment questions)')
      : 'Submitted, not paid';

  const existingFirst = firstNameFrom(lead.contact_name);
  const effectiveFirst = existingFirst || firstNameFrom(typedFirstName);
  const showNudge = !!row && !rowPaid && !leadPaid;

  const doSend = async () => {
    if (!effectiveFirst || sending) return;
    setSending(true);
    try {
      /* Save a typed name to the lead FIRST — the server resolves {{1}} from the lead row, not
         from this request, so the send and the record cannot disagree. */
      if (!existingFirst && typedFirstName.trim()) {
        await onUpdateLead(lead.id, { contact_name: typedFirstName.trim() } as Partial<OutreachLead>);
      }
      const { data, error: e } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: lead.id, phone: lead.phone ?? '', country: lead.country ?? undefined, template_name: 'questionnaire_followup' },
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
        if (code === 'pitch_already_sent') setFollowupSent(true);
        return;
      }
      setFollowupSent(true);
      setConfirming(false);
      toast({ title: 'Nudge sent', description: `questionnaire_followup to ${lead.business_name}.` });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={CARD}>
      <div className="flex items-center gap-1.5 mb-2">
        <ClipboardList className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Questionnaire</span>
      </div>

      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> reading answers…</div>}
      {!loading && error && <p className="text-xs text-destructive">Couldn't read the questionnaire: {error}</p>}
      {!loading && !error && !row && (
        <p className="text-xs text-muted-foreground">Not started — no submission from this lead yet.</p>
      )}

      {!loading && !error && row && (
        <div className="space-y-3 text-xs">
          <p>
            <span className="font-medium">{stateLabel}</span>
            <span className="text-muted-foreground"> · submitted {row.created_at ? new Date(row.created_at).toLocaleDateString('en-GB') : '—'}</span>
            {rowCount > 1 && <span className="text-muted-foreground"> · latest of {rowCount} submissions</span>}
          </p>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1">Before payment</p>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Name</dt><dd>{val(row.contact_name, q1Absent)}</dd>
              <dt className="text-muted-foreground">Email</dt><dd>{val(row.contact_email, q1Absent)}</dd>
              <dt className="text-muted-foreground">Consent</dt><dd>{val(row.gbp_consent, q1Absent)}</dd>
            </dl>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1">After payment</p>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Services</dt><dd>{val(row.services_list ?? row.services, q2Absent)}</dd>
              <dt className="text-muted-foreground">Main town</dt><dd>{val(row.confirmed_location, q2Absent)}</dd>
              <dt className="text-muted-foreground">Other areas</dt><dd>{val(row.areas_list, q2Absent)}</dd>
              <dt className="text-muted-foreground">Address</dt><dd>{val(row.business_address, q2Absent)}</dd>
              <dt className="text-muted-foreground">Phone (confirmed)</dt><dd>{val(row.confirmed_phone, q2Absent)}</dd>
              <dt className="text-muted-foreground">Platform</dt><dd>{val(row.website_platform === 'other' ? row.website_platform_other : row.website_platform, q2Absent)}</dd>
              <dt className="text-muted-foreground">Site managed by</dt><dd>{val(row.website_manager, q2Absent)}</dd>
              <dt className="text-muted-foreground">Web company email</dt><dd>{val(row.website_manager_email, q2Absent)}</dd>
              <dt className="text-muted-foreground">Happy to migrate</dt><dd>{val(row.willing_to_migrate, q2Absent)}</dd>
              <dt className="text-muted-foreground">Google profile</dt><dd>{val(row.gbp_exists, q2Absent)}</dd>
              <dt className="text-muted-foreground">Profile access</dt><dd>{val(row.gbp_status, q2Absent)}</dd>
              <dt className="text-muted-foreground">Profile verified</dt><dd>{val(row.gbp_verified, q2Absent)}</dd>
              <dt className="text-muted-foreground">Photos</dt><dd>{val(row.photos_status, q2Absent)}</dd>
              <dt className="text-muted-foreground">Must not say</dt><dd>{val(row.must_not_say, q2Absent)}</dd>
              <dt className="text-muted-foreground">Competitor</dt><dd>{val(row.competitor_name, q2Absent)}</dd>
              <dt className="text-muted-foreground">Accreditations</dt><dd>{val(row.accreditations, q2Absent)}</dd>
            </dl>
          </div>

          {showNudge && (
            <div className="pt-1 border-t border-border/50">
              {followupSent ? (
                <p className="text-muted-foreground italic">Nudge already sent — one per lead, no repeats.</p>
              ) : !confirming ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirming(true)}>
                  <MessageCircle className="h-3 w-3 mr-1.5" /> WhatsApp nudge — form in, payment pending
                </Button>
              ) : (
                <div className="space-y-2">
                  {!existingFirst && (
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        Their first name (no name saved on this lead — it will be saved as the contact name)
                      </label>
                      <Input value={typedFirstName} onChange={(e) => setTypedFirstName(e.target.value)} placeholder="e.g. Ronnie" className="h-7 text-xs" />
                    </div>
                  )}
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 whitespace-pre-wrap text-[11px]">
                    {questionnaireFollowupBody(effectiveFirst, lead.business_name ?? '')}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" disabled={!effectiveFirst || sending} onClick={() => void doSend()}>
                      {sending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Send it
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
