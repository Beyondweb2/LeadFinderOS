import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ATTRIBUTION_NOTE_MAX, ATTRIBUTION_OVERRIDE_REASON_MIN, checkResolution } from '@/lib/saleAttribution';
import {
  ATTRIBUTION_ERRORS, candidateWhy, evidenceView, overrideChoices, resolutionText,
  type AttributionPerson, type AttributionReview,
} from '@/lib/attributionReviewView';

/* ATTRIBUTION REVIEW NEEDED (Team page, admin; docs/pre-sales-certification/attribution-review-admin.md).
   A client paid but who sold it is not clear, so NO seller was stamped. Paul reads the frozen evidence and
   decides once: CONFIRM SELLER (someone the evidence names, or — explicitly, with a reason — anyone else on
   the team) or NOT CREDITED. The server (admin-users → resolve_sale_attribution_with_seller) checks the admin
   role and every rule again; this screen only shows and asks. Resolved reviews stay listed with their record. */

const OVERRIDE = '__override';

export function AttributionReviewsCard({ reviews, people, serverReady = true, call, onChanged }: {
  reviews: readonly AttributionReview[];
  people: readonly AttributionPerson[];
  /** False = the server is the older admin-users (it would confirm the CLAIMED seller whoever is picked): no resolving. */
  serverReady?: boolean;
  call: (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onChanged: (message?: string, error?: string) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const nameOf = (id: string | null | undefined) => (id ? people.find((p) => p.user_id === id)?.name ?? 'A former team member' : 'Nobody');
  const open = reviews.filter((r) => r.status === 'open');
  const resolved = reviews.filter((r) => r.status !== 'open');
  return (
    <div className="space-y-3" data-testid="attribution-reviews">
      {open.length === 0 && <p className="text-xs text-muted-foreground">No sales need an attribution review.</p>}
      {open.length > 0 && !serverReady && <p className="text-xs text-destructive">Deciding is switched off until the server update for attribution reviews is deployed — the older version can only confirm the claimed seller.</p>}
      {open.map((r) => <OpenReview key={r.lead_id} r={r} people={people} nameOf={nameOf} call={call} onChanged={onChanged} locked={!serverReady} />)}
      {resolved.length > 0 && (
        <div>
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowResolved((s) => !s)} aria-expanded={showResolved}>
            {showResolved ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Decided reviews ({resolved.length})
          </button>
          {showResolved && (
            <ul className="mt-2 divide-y rounded-md border text-sm" data-testid="attribution-reviews-resolved">
              {resolved.map((r) => <ResolvedReview key={r.lead_id} r={r} nameOf={nameOf} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-xs">{children}</dd>
    </div>
  );
}

function OpenReview({ r, people, nameOf, call, onChanged, locked }: {
  r: AttributionReview; people: readonly AttributionPerson[]; nameOf: (id: string | null | undefined) => string; locked: boolean;
  call: (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onChanged: (message?: string, error?: string) => void;
}) {
  const ev = evidenceView(r, nameOf);
  const candidates = r.candidates ?? [];
  const others = overrideChoices(people, candidates);
  const [pick, setPick] = useState<string>(candidates.length === 1 ? candidates[0].user_id : '');
  const [overrideTo, setOverrideTo] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sellerId = pick === OVERRIDE ? overrideTo || null : pick || null;
  const confirmCheck = checkResolution({ decision: 'confirmed', sellerId, candidateIds: candidates.map((c) => c.user_id), overrideReason: reason, note });
  const send = async (decision: 'confirmed' | 'not_credited') => {
    const who = sellerId ? nameOf(sellerId) : '';
    const sure = decision === 'confirmed'
      ? `Confirm ${who} as the seller of ${r.business_name || 'this client'}?${pick === OVERRIDE ? '\n\nThis is an ADMIN OVERRIDE — the evidence does not name them. Your reason is kept with the sale.' : ''}\n\nThey become the seller for good and the normal commission rules apply. This cannot be changed later.`
      : `Record that NO salesperson is credited for ${r.business_name || 'this client'}?\n\nThe payment stays business revenue. Nobody's sales, no commission. This cannot be changed later.`;
    if (!window.confirm(sure)) return;
    setBusy(true);
    try {
      const res = await call('attribution_review_resolve', {
        lead_id: r.lead_id, decision, note,
        ...(decision === 'confirmed' ? { seller_user_id: sellerId, override_reason: pick === OVERRIDE ? reason : '' } : {}),
      });
      if (!res.ok) onChanged(undefined, ATTRIBUTION_ERRORS[String(res.error)] ?? String(res.error ?? 'failed'));
      else onChanged(decision === 'confirmed' ? `Seller confirmed: ${who}.` : 'Recorded: not credited to a salesperson.');
    } finally { setBusy(false); }
  };
  return (
    <section className="rounded-md border border-amber-500/40 p-3 space-y-3" data-testid="attribution-review-open">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-medium">{r.business_name || 'A client'}</h3>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 dark:text-amber-300">ATTRIBUTION REVIEW NEEDED</span>
        <span className="text-xs text-muted-foreground">opened {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</span>
      </header>

      <dl className="space-y-1.5">
        <Fact label="Why it needs you">{ev.why}</Fact>
        <Fact label="Payment">{ev.payment}</Fact>
        <Fact label="Sign-up creator">{ev.creators.length === 1 ? ev.creators[0] : <ul className="list-disc pl-4">{ev.creators.map((c) => <li key={c}>{c}</li>)}</ul>}</Fact>
        <Fact label="Claimed seller">{ev.claimed}</Fact>
        <Fact label="Lead owner">At payment: {ev.ownerAtPayment}{ev.ownerNow !== null && ev.ownerNow !== ev.ownerAtPayment ? ` · now: ${ev.ownerNow}` : ''}</Fact>
        {ev.ownerHistory.length > 0 && <Fact label="Ownership history"><ul className="space-y-0.5">{ev.ownerHistory.map((h, i) => <li key={i}>{h}</li>)}</ul></Fact>}
        {ev.links.length > 0 && <Fact label="Sign-up links made"><ul className="space-y-0.5">{ev.links.map((l, i) => <li key={i}>{l}</li>)}</ul></Fact>}
      </dl>

      <fieldset className="space-y-2" disabled={busy || locked}>
        <legend className="text-xs font-semibold">Who sold it?</legend>
        {candidates.length === 0 && <p className="text-xs text-muted-foreground">The evidence names nobody. Choose someone below as an override, or record Not credited.</p>}
        {candidates.map((c) => (
          <label key={c.user_id} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm', pick === c.user_id && 'border-primary bg-primary/5')}>
            <input type="radio" name={`seller-${r.lead_id}`} className="mt-1" checked={pick === c.user_id} onChange={() => setPick(c.user_id)} />
            <span className="min-w-0"><span className="font-medium">{c.name ?? nameOf(c.user_id)}</span><span className="block text-xs text-muted-foreground">{candidateWhy(c)}</span></span>
          </label>
        ))}
        <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border border-dashed p-2 text-sm', pick === OVERRIDE && 'border-amber-500 bg-amber-500/5')}>
          <input type="radio" name={`seller-${r.lead_id}`} className="mt-1" checked={pick === OVERRIDE} onChange={() => setPick(OVERRIDE)} />
          <span className="min-w-0"><span className="font-medium">Someone else — admin override</span><span className="block text-xs text-muted-foreground">Not named by the evidence. Needs a reason, kept with the sale.</span></span>
        </label>
        {pick === OVERRIDE && (
          <div className="space-y-2 pl-6">
            <select className="h-9 w-full max-w-xs rounded-md border bg-background px-2 text-sm" value={overrideTo} onChange={(e) => setOverrideTo(e.target.value)} aria-label="Override seller">
              <option value="">Choose a team member…</option>
              {others.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.status !== 'active' ? ' (ended)' : ''}{p.role === 'admin' ? ' (admin)' : ''}</option>)}
            </select>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={ATTRIBUTION_NOTE_MAX} rows={2} placeholder={`Why this person (at least ${ATTRIBUTION_OVERRIDE_REASON_MIN} characters)`} className="text-sm" aria-label="Override reason" />
          </div>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={ATTRIBUTION_NOTE_MAX} placeholder="Note (optional)" className="h-8 text-sm" aria-label="Note" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || locked || !confirmCheck.ok} onClick={() => void send('confirmed')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm seller'}</Button>
          <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => void send('not_credited')}>Not credited</Button>
          {'error' in confirmCheck && pick !== '' && <span className="self-center text-xs text-muted-foreground">{ATTRIBUTION_ERRORS[confirmCheck.error] ?? ''}</span>}
        </div>
      </fieldset>
    </section>
  );
}

function ResolvedReview({ r, nameOf }: { r: AttributionReview; nameOf: (id: string | null | undefined) => string }) {
  const [open, setOpen] = useState(false);
  const ev = evidenceView(r, nameOf);
  return (
    <li className="p-2.5 space-y-1">
      <button type="button" className="flex w-full items-start gap-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0">
          <span className="font-medium">{r.business_name || 'A client'}</span>
          <span className="block text-xs text-muted-foreground">{resolutionText(r, nameOf)}</span>
        </span>
      </button>
      {open && (
        <dl className="space-y-1.5 pl-5" data-testid="attribution-review-record">
          <Fact label="Why it opened">{ev.why}</Fact>
          <Fact label="Original claim">{ev.claimed}</Fact>
          <Fact label="Sign-up creator">{ev.creators.join(' · ')}</Fact>
          <Fact label="Lead owner at payment">{ev.ownerAtPayment}</Fact>
          {r.resolution_basis === 'admin_override' && r.override_reason && <Fact label="Override reason">{r.override_reason}</Fact>}
          {r.resolution_note && <Fact label="Note">{r.resolution_note}</Fact>}
          {(r.history ?? []).length > 0 && (
            <Fact label="History">
              <ul className="space-y-0.5">{(r.history ?? []).map((h, i) => (
                <li key={i}>{new Date(h.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} · {h.kind === 'opened' ? 'review opened' : h.kind === 'confirmed' ? `seller confirmed: ${nameOf(h.seller_user_id)} (${h.basis === 'admin_override' ? 'admin override' : 'evidence'})` : 'not credited'}{h.actor_user_id ? ` by ${nameOf(h.actor_user_id)}` : ''}</li>
              ))}</ul>
            </Fact>
          )}
        </dl>
      )}
    </li>
  );
}
