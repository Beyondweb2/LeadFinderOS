import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CONTRACTOR_AGREEMENT_VERSIONS, CONTRACTOR_TYPES, LEAVER_REASONS, PRIVACY_NOTICE_VERSIONS, RTW_METHODS, SCHEDULE2_STATUSES,
  TEAM_GUIDE_VERSIONS, documentVersion, emptyOnboardingRecord, onboardingSummary,
  type ChecklistKey, type MemberState, type OnboardingField, type OnboardingRecord, type OnboardingSummary,
} from '@/lib/salespersonOnboarding';

/* SALESPERSON ONBOARDING — one person's checklist on the Team page (admin only, 2026-10-05).
   docs/salesperson-onboarding.md. What is missing shows first; everything else is one line. Every save
   goes to fn admin-users (team_onboarding_save), which validates it with the same rule file; READY TO
   SELL is worked out from the record and the live login every time, never stored.
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

const versions = (list: typeof CONTRACTOR_AGREEMENT_VERSIONS) => list.map((v) => ({ value: v.id, label: `${v.label}${v.final ? '' : ' — DRAFT, not final'}` }));

const EDITORS: Partial<Record<ChecklistKey | 'leaving' | 'notes', FieldSpec[]>> = {
  agreement: [
    { field: 'agreement_version', label: 'Version signed', kind: 'select', options: versions(CONTRACTOR_AGREEMENT_VERSIONS) },
    { field: 'agreement_signed_on', label: 'Date signed', kind: 'date' },
  ],
  privacy_notice: [
    { field: 'privacy_notice_version', label: 'Version given', kind: 'select', options: versions(PRIVACY_NOTICE_VERSIONS), hint: 'Record the version they actually received. A draft is recorded honestly but does not complete this item.' },
    { field: 'privacy_notice_given_on', label: 'Date given', kind: 'date' },
  ],
  age_18: [{ field: 'age_18_confirmed_on', label: 'Date confirmed', kind: 'date', hint: 'Record only that it was confirmed — never the date of birth.' }],
  right_to_work: [
    { field: 'rtw_method', label: 'Method', kind: 'select', options: Object.entries(RTW_METHODS).map(([value, m]) => ({ value, label: m.label })) },
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
    { field: 'team_guide_version', label: 'Guide version', kind: 'select', options: versions(TEAM_GUIDE_VERSIONS) },
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
};

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

function Editor({ specs, record, onSave, onCancel }: { specs: FieldSpec[]; record: OnboardingRecord; onSave: (patch: Partial<OnboardingRecord>) => Promise<boolean>; onCancel: () => void }) {
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
  const notice = documentVersion(PRIVACY_NOTICE_VERSIONS, draft.privacy_notice_version);
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
      {specs.some((s) => s.field === 'privacy_notice_version') && notice && !notice.final && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p className="font-medium">This notice is a draft. Before it can be issued:</p>
          <ul className="ml-4 list-disc">{notice.outstanding.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
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

export function SalespersonOnboardingPanel({ userId, record, member, onSave }: {
  userId: string;
  record: OnboardingRecord | null;
  member: MemberState;
  onSave: (patch: Partial<OnboardingRecord>) => Promise<boolean>;
}) {
  const r = record ?? emptyOnboardingRecord(userId);
  const summary = onboardingSummary(record, member);
  const [editing, setEditing] = useState<string | null>(null);
  const ordered = [...summary.items.filter((i) => i.blocking && !i.done), ...summary.items.filter((i) => !(i.blocking && !i.done))];
  return (
    <div className="w-full space-y-3 rounded-md border p-3" data-testid="salesperson-onboarding">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={`text-sm font-semibold tracking-wide ${summary.readyToSell ? '' : 'text-muted-foreground'}`}>{summary.readyToSell ? 'READY TO SELL' : 'NOT READY TO SELL'}</span>
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
            {editing === i.key && EDITORS[i.key] && <Editor specs={EDITORS[i.key]!} record={r} onSave={onSave} onCancel={() => setEditing(null)} />}
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
          {editing === 'leaving' && <p className="text-xs text-muted-foreground">Recording an end does not remove access — press Disable on their end date. Commission is not changed here.</p>}
          <Editor specs={EDITORS[editing]!} record={r} onSave={onSave} onCancel={() => setEditing(null)} />
        </>
      )}
    </div>
  );
}
