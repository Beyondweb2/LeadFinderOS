import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CONTRACTOR_TYPES, DOCUMENT_STATUSES, LEAVER_REASONS, RTW_CATEGORIES, RTW_METHODS, SCHEDULE2_STATUSES,
  documentVersion, emptyOnboardingRecord, onboardingSummary,
  type ChecklistKey, type DocumentKind, type DocumentVersion, type MemberState, type OnboardingField, type OnboardingRecord, type OnboardingSummary,
} from '@/lib/salespersonOnboarding';

/* SALESPERSON ONBOARDING — one person's checklist on the Team page (admin only, 2026-10-05).
   docs/salesperson-onboarding.md. What is missing shows first; everything else is one line. Every save
   goes to fn admin-users (team_onboarding_save), which validates it with the same rule file; READY TO
   SELL is the SERVER's answer (public.salesperson_onboarding_missing) — it is enforced, not a label.
   Only an APPROVED document version counts; drafts and superseded versions can be recorded for history.
   ⛔ Bank details, passport numbers and copies are never typed here — only that they were received,
   when, and where the evidence is kept. The server refuses text that looks like one. */

type Opt = { value: string; label: string };
interface FieldSpec {
  field: OnboardingField;
  label: string;
  kind: 'date' | 'text' | 'select' | 'yesno';
  options?: Opt[];
  placeholder?: string;
  hint?: string;
  showIf?: (d: OnboardingRecord) => boolean;
}

/* Only the TEAM GUIDE version still decides Ready to Sell. Salesperson paperwork (contractor agreement, privacy
   notice) is handled OUTSIDE LeadFinderOS (Paul, 2026-10-05): its versions are listed for reference, never "does not count". */
const versions = (docs: readonly DocumentVersion[], kind: DocumentKind) => docs.filter((d) => d.kind === kind)
  .map((v) => ({ value: v.id, label: `${v.label} — ${DOCUMENT_STATUSES[v.status]}${kind === 'team_guide' && v.status !== 'approved' ? ' (does not count)' : ''}` }));
const REFERENCE_HINT = 'Optional, for your own reference. This paperwork is handled outside LeadFinderOS and never affects Ready to Sell.';

const editorsFor = (docs: readonly DocumentVersion[]): Partial<Record<ChecklistKey | 'leaving' | 'notes', FieldSpec[]>> => ({
  agreement: [
    { field: 'agreement_version', label: 'Version signed (optional)', kind: 'select', options: versions(docs, 'contractor_agreement'), hint: REFERENCE_HINT },
    { field: 'agreement_signed_on', label: 'Date signed (optional)', kind: 'date' },
    { field: 'agreement_ref', label: 'Where the signed copy is kept (optional)', kind: 'text', placeholder: 'e.g. Secure folder › Agreements › Jane Smith' },
  ],
  privacy_notice: [
    { field: 'privacy_notice_version', label: 'Version given (optional)', kind: 'select', options: versions(docs, 'privacy_notice'), hint: REFERENCE_HINT },
    { field: 'privacy_notice_given_on', label: 'Date given (optional)', kind: 'date' },
  ],
  age_18: [{ field: 'age_18_confirmed_on', label: 'Date confirmed', kind: 'date', hint: 'Record only that it was confirmed — never the date of birth.' }],
  right_to_work: [
    { field: 'rtw_method', label: 'Method actually used', kind: 'select', options: Object.entries(RTW_METHODS).map(([value, m]) => ({ value, label: `${RTW_CATEGORIES[m.category]}: ${m.label}` })) },
    { field: 'rtw_provider', label: 'Provider name', kind: 'text', showIf: (d) => d.rtw_method === 'certified_provider' },
    { field: 'rtw_checked_on', label: 'Date checked', kind: 'date' },
    { field: 'rtw_checked_by', label: 'Checked by', kind: 'text', placeholder: 'Paul James Sales' },
    { field: 'rtw_result', label: 'Result', kind: 'select', options: [{ value: 'pass', label: 'Passed' }, { value: 'fail', label: 'Failed' }] },
    { field: 'rtw_evidence_ref', label: 'Where the evidence is kept', kind: 'text', placeholder: 'e.g. Secure folder › Right to work › Jane Smith', hint: 'A location or reference only — no passport number, no copy.' },
    { field: 'rtw_recheck_due', label: 'Follow-up check due (only if their permission is time-limited)', kind: 'date' },
    { field: 'rtw_notes', label: 'Notes', kind: 'text' },
  ],
  bank_details: [{ field: 'bank_details_received_on', label: 'Date received', kind: 'date', hint: 'They stay on the signed agreement. Never type them here.' }],
  vat: [
    { field: 'vat_registered', label: 'VAT registered?', kind: 'yesno' },
    { field: 'vat_number', label: 'VAT number', kind: 'text', placeholder: 'GB123456789', showIf: (d) => d.vat_registered === true },
  ],
  contractor_status: [
    { field: 'contractor_type', label: 'Works as', kind: 'select', options: Object.entries(CONTRACTOR_TYPES).map(([value, label]) => ({ value, label })) },
    { field: 'company_name', label: 'Company name', kind: 'text', showIf: (d) => d.contractor_type === 'limited_company' },
    { field: 'company_number', label: 'Company number', kind: 'text', showIf: (d) => d.contractor_type === 'limited_company' },
    { field: 'company_contract_confirmed_on', label: 'Date the contract with the company was confirmed', kind: 'date', showIf: (d) => d.contractor_type === 'limited_company' },
  ],
  start_date: [{ field: 'start_date', label: 'Start date', kind: 'date' }],
  team_guide: [
    { field: 'team_guide_version', label: 'Guide version', kind: 'select', options: versions(docs, 'team_guide'), hint: 'The salesperson can also acknowledge the current guide themselves.' },
    { field: 'team_guide_acknowledged_on', label: 'Date acknowledged', kind: 'date' },
  ],
  schedule2: [
    { field: 'schedule2_status', label: 'Existing contacts list', kind: 'select', options: Object.entries(SCHEDULE2_STATUSES).map(([value, label]) => ({ value, label })) },
    { field: 'schedule2_on', label: 'Date', kind: 'date' },
  ],
  leaving: [
    { field: 'end_date', label: 'End date', kind: 'date' },
    { field: 'end_reason', label: 'Reason', kind: 'select', options: Object.entries(LEAVER_REASONS).map(([value, label]) => ({ value, label })) },
    { field: 'end_note', label: 'Note', kind: 'text' },
    { field: 'misconduct_notified_on', label: 'Misconduct found later — date you told them (within 6 months of the end)', kind: 'date', showIf: (d) => !!d.end_date && d.end_reason !== 'misconduct' },
    { field: 'data_deletion_confirmed_on', label: 'They confirmed deleting Findable data on', kind: 'date', showIf: (d) => !!d.end_date },
  ],
  notes: [{ field: 'notes', label: 'Notes', kind: 'text' }],
});

function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  if (spec.kind === 'select' || spec.kind === 'yesno') {
    const options = spec.kind === 'yesno' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : spec.options ?? [];
    const v = value === null || value === undefined ? '' : String(value);
    return (
      <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={v}
        onChange={(e) => onChange(e.target.value === '' ? null : spec.kind === 'yesno' ? e.target.value === 'true' : e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return <Input className="h-8 text-sm" type={spec.kind === 'date' ? 'date' : 'text'} value={value === null || value === undefined ? '' : String(value)} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />;
}

function Editor({ specs, record, docs, onSave, onCancel }: { specs: FieldSpec[]; record: OnboardingRecord; docs: readonly DocumentVersion[]; onSave: (patch: Partial<OnboardingRecord>) => Promise<boolean>; onCancel: () => void }) {
  const [draft, setDraft] = useState<OnboardingRecord>(record);
  const [busy, setBusy] = useState(false);
  const visible = specs.filter((s) => !s.showIf || s.showIf(draft));
  const save = async () => {
    /* Only this item's fields; a field hidden by its condition is SENT as cleared, so a hidden answer never survives. */
    const patch: Record<string, unknown> = {};
    for (const s of specs) {
      const v = s.showIf && !s.showIf(draft) ? null : draft[s.field];
      if (v !== record[s.field]) patch[s.field] = v;
    }
    if (!Object.keys(patch).length) { onCancel(); return; }
    setBusy(true);
    try { if (await onSave(patch as Partial<OnboardingRecord>)) onCancel(); } finally { setBusy(false); }
  };
  const guide = documentVersion(docs, draft.team_guide_version, 'team_guide');
  const method = draft.rtw_method ? RTW_METHODS[draft.rtw_method] : null;
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
      {visible.map((s) => (
        <label key={s.field} className="block space-y-1">
          <span className="text-xs text-muted-foreground">{s.label}</span>
          <FieldInput spec={s} value={draft[s.field]} onChange={(v) => setDraft((d) => ({ ...d, [s.field]: v }))} />
          {s.hint && <span className="block text-[11px] text-muted-foreground">{s.hint}</span>}
        </label>
      ))}
      {([['team_guide_version', guide]] as const).map(([f, d]) => specs.some((s) => s.field === f) && d && d.status !== 'approved' && (
        <div key={f} className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p className="font-medium">This version is {d.status === 'draft' ? 'a draft' : 'superseded'} and does not count{d.outstanding.length ? '. Outstanding:' : '.'}</p>
          {d.outstanding.length > 0 && <ul className="ml-4 list-disc">{d.outstanding.map((o) => <li key={o}>{o}</li>)}</ul>}
        </div>
      ))}
      {specs.some((s) => s.field === 'rtw_method') && method?.caution && <p className="text-xs text-amber-700 dark:text-amber-400">{method.caution}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** The badge on the Team row. */
export function OnboardingBadge({ summary }: { summary: OnboardingSummary }) {
  if (summary.readyToSell) return <Badge variant="secondary" title="Every onboarding item is on file and the login is live">Ready to sell</Badge>;
  return <Badge variant="outline" title={summary.inactiveReason ?? `${summary.missing.length} onboarding items missing`}>{summary.inactiveReason ? `Not active · ${summary.done}/${summary.total}` : `Onboarding ${summary.done}/${summary.total}`}</Badge>;
}

export function SalespersonOnboardingPanel({ userId, record, member, docs, serverMissing, onSave }: {
  userId: string;
  record: OnboardingRecord | null;
  member: MemberState;
  docs: readonly DocumentVersion[];
  /** The gate's own answer for this person (null = could not be read). */
  serverMissing: readonly string[] | null;
  onSave: (patch: Partial<OnboardingRecord>) => Promise<boolean>;
}) {
  const r = record ?? emptyOnboardingRecord(userId);
  const summary = onboardingSummary(record, member, docs, undefined, serverMissing);
  const EDITORS = editorsFor(docs);
  const [editing, setEditing] = useState<string | null>(null);
  const ordered = [...summary.items.filter((i) => i.blocking && !i.done), ...summary.items.filter((i) => !(i.blocking && !i.done))];
  return (
    <div className="w-full space-y-3 rounded-md border p-3" data-testid="salesperson-onboarding">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={`text-sm font-semibold tracking-wide ${summary.readyToSell ? '' : 'text-muted-foreground'}`}>{summary.readyToSell ? 'READY TO SELL' : 'NOT READY TO SELL — sales actions are blocked'}</span>
        <span className="text-sm">{summary.done} / {summary.total} complete</span>
        {summary.inactiveReason && <span className="text-xs text-destructive">{summary.inactiveReason}</span>}
      </div>
      {summary.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">Missing: {summary.missing.map((m) => m.label).join(' · ')}</p>
      )}
      <ul className="divide-y text-sm">
        {ordered.map((i) => (
          <li key={i.key} className="py-1.5">
            <div className="flex items-start gap-2">
              {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${i.blocking ? 'text-destructive' : 'text-muted-foreground'}`} />}
              <div className="min-w-0 flex-1">
                <span className={i.done ? 'text-muted-foreground' : 'font-medium'}>{i.label}</span>
                {!i.blocking && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                <span className="block text-xs text-muted-foreground">{i.detail}</span>
              </div>
              {EDITORS[i.key] && editing !== i.key && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(i.key)}><Pencil className="h-3.5 w-3.5" /></Button>}
            </div>
            {editing === i.key && EDITORS[i.key] && <Editor specs={EDITORS[i.key]!} record={r} docs={docs} onSave={onSave} onCancel={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      {summary.notes.length > 0 && (
        <ul className="ml-4 list-disc space-y-0.5 text-xs text-amber-700 dark:text-amber-400">{summary.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-2">
        {(['leaving', 'notes'] as const).map((k) => editing === k ? null : (
          <Button key={k} size="sm" variant="outline" onClick={() => setEditing(k)}>
            {k === 'leaving' ? (summary.leaver.recorded ? `Leaving: ${LEAVER_REASONS[summary.leaver.reason!]}, ${summary.leaver.endDate}` : 'Record leaving') : (r.notes ? 'Edit notes' : 'Add notes')}
          </Button>
        ))}
      </div>
      {(editing === 'leaving' || editing === 'notes') && (
        <>
          {editing === 'leaving' && <p className="text-xs text-muted-foreground">From the end date they are no longer Ready to Sell, so sales actions stop. Their login stays until you press Disable. Commission is not changed here.</p>}
          <Editor specs={EDITORS[editing]!} record={r} docs={docs} onSave={onSave} onCancel={() => setEditing(null)} />
        </>
      )}
    </div>
  );
}

export interface AttributionReview {
  lead_id: string;
  business_name: string | null;
  claimed_seller_user_id: string | null;
  reason: 'no_authorised_creator' | 'creator_not_authorised' | 'claimed_seller_mismatch' | 'conflicting_creators' | 'ambiguous_manual_payment';
  status: 'open' | 'confirmed' | 'not_credited';
  evidence: { claimed_seller_readiness?: string[] | null };
  resolution_note: string | null;
  created_at: string;
}

/* ATTRIBUTION REVIEW NEEDED (Team page, admin): a client paid but no AUTHORISED creator of the sale is on
   record (SALE CREATOR ≠ CURRENT LEAD OWNER). No seller was stamped. Paul confirms the claimed seller, or
   records that nobody is credited. Whether anyone is paid stays with the commission rules. */
const REVIEW_REASON: Record<AttributionReview['reason'], string> = {
  no_authorised_creator: 'no sign-up link from an authorised salesperson is on record for this payment',
  creator_not_authorised: 'the sign-up link was made by someone who was not Ready to Sell at the time',
  claimed_seller_mismatch: 'the seller written with the payment does not match who created the sign-up link',
  /* F + H integration (migration 20261010130000): never guessed. */
  conflicting_creators: 'more than one person made the sign-up link this client paid through (claimed: the first)',
  ambiguous_manual_payment: 'marked paid by hand, and more than one sign-up is on record for this client (claimed: the latest salesperson)',
};
export function AttributionReviewsCard({ reviews, sellerName, call, onChanged }: {
  reviews: readonly AttributionReview[];
  sellerName: (id: string) => string;
  call: (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onChanged: (message?: string, error?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const open = reviews.filter((r) => r.status === 'open');
  const decide = async (r: AttributionReview, decision: 'confirmed' | 'not_credited') => {
    const note = window.prompt(decision === 'confirmed' ? 'Confirm the claimed seller. They become this sale\'s seller for good. Note (optional):' : 'Record that the salesperson is NOT credited for this sale. Note (optional):', '');
    if (note === null) return;
    setBusy(true);
    try {
      const res = await call('attribution_review_resolve', { lead_id: r.lead_id, decision, note });
      if (!res.ok) onChanged(undefined, String(res.error ?? 'failed'));
      else onChanged(decision === 'confirmed' ? 'Attribution confirmed.' : 'Recorded: not credited to the salesperson.');
    } finally { setBusy(false); }
  };
  if (!open.length) return <p className="text-xs text-muted-foreground">No sales need an attribution review.</p>;
  return (
    <ul className="divide-y text-sm" data-testid="attribution-reviews">
      {open.map((r) => (
        <li key={r.lead_id} className="flex flex-wrap items-center gap-2 py-2">
          <div className="min-w-0 mr-auto">
            <div className="font-medium">{r.business_name || 'A client'} <span className="text-xs font-normal text-amber-700 dark:text-amber-400">ATTRIBUTION REVIEW NEEDED</span></div>
            <div className="text-xs text-muted-foreground">Claimed seller: {r.claimed_seller_user_id ? sellerName(r.claimed_seller_user_id) : 'nobody'} — {REVIEW_REASON[r.reason] ?? r.reason}. No seller has been recorded.</div>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !r.claimed_seller_user_id} onClick={() => void decide(r, 'confirmed')}>Confirm seller</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void decide(r, 'not_credited')}>Not credited</Button>
        </li>
      ))}
    </ul>
  );
}

/* DOCUMENTS (Team page, admin): every version of the contractor agreement, the privacy notice and the team
   guide. Paul adds the final version himself (never invented here), clears its outstanding items, and
   approves it — which supersedes the previous approved one. */
export function SalespersonDocumentsCard({ docs, call, onChanged }: {
  docs: readonly DocumentVersion[];
  call: (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onChanged: (message?: string, error?: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const blank = { kind: 'contractor_agreement', id: '', label: '', document_ref: '', outstanding: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const run = async (action: string, body: Record<string, unknown>, ok: string, kind?: DocumentKind) => {
    setBusy(true);
    try {
      const r = await call(action, body);
      if (!r.ok) { onChanged(undefined, String(r.error ?? 'failed')); return false; }
      const affected = typeof r.affected === 'number' ? r.affected : 0;
      /* Only a new TEAM GUIDE changes Ready to Sell; agreement / notice versions are reference only. */
      onChanged(affected > 0 && kind === 'team_guide' ? `${ok} ${affected} salesperson(s) acknowledged the old guide and are not Ready to Sell until they acknowledge the new one.` : ok);
      return true;
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-testid="salesperson-documents">
      <ul className="divide-y text-sm">
        {docs.map((d) => (
          <li key={d.id} className="py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{d.label}</span>
              <Badge variant={d.status === 'approved' ? 'secondary' : 'outline'}>{DOCUMENT_STATUSES[d.status]}</Badge>
              <span className="text-xs text-muted-foreground">{d.id}{d.document_ref ? ` · ${d.document_ref}` : ''}</span>
            </div>
            {d.outstanding.length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-xs text-amber-700 dark:text-amber-400">{d.outstanding.map((o) => <li key={o}>{o}</li>)}</ul>
            )}
            {d.status === 'draft' && (
              <div className="mt-1 flex flex-wrap gap-2">
                {d.outstanding.length > 0 ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => {
                    if (!window.confirm(`Mark all ${d.outstanding.length} outstanding items on "${d.label}" as resolved? Only do this once the document itself has been fixed.`)) return;
                    void run('team_document_outstanding', { id: d.id, outstanding: [] }, 'Outstanding items cleared.');
                  }}>Mark outstanding items resolved</Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => {
                    if (!window.confirm(d.kind === 'team_guide'
                      ? `Approve "${d.label}" as the current team guide? The previous guide becomes superseded, and anyone who only acknowledged that one stops being Ready to Sell until they acknowledge this one.`
                      : `Mark "${d.label}" as the current version for your records? This paperwork is handled outside LeadFinderOS and does not affect Ready to Sell.`)) return;
                    void run('team_document_approve', { id: d.id }, 'Approved.', d.kind);
                  }}>Approve as current</Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!adding ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add a document version</Button> : (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            <option value="contractor_agreement">Contractor agreement</option>
            <option value="privacy_notice">Salesperson privacy notice</option>
            <option value="team_guide">Team guide</option>
          </select>
          <Input className="h-8 text-sm" placeholder="Version id, as on the document (e.g. contractor-agreement-v3)" value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} />
          <Input className="h-8 text-sm" placeholder="Name (e.g. Independent Sales Contractor Agreement v3)" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <Input className="h-8 text-sm" placeholder="Where the document is kept (file name or folder)" value={form.document_ref} onChange={(e) => setForm((f) => ({ ...f, document_ref: e.target.value }))} />
          <textarea className="min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm" placeholder="Anything still outstanding, one per line (leave empty if it is final)" value={form.outstanding} onChange={(e) => setForm((f) => ({ ...f, outstanding: e.target.value }))} />
          <p className="text-xs text-muted-foreground">A new version starts as a draft. Approve it once it is final.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !form.id.trim() || !form.label.trim()} onClick={async () => {
              const ok = await run('team_document_add', { document: { ...form, outstanding: form.outstanding.split('\n') } }, 'Version added as a draft.');
              if (ok) { setAdding(false); setForm(blank); }
            }}>Add as draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
