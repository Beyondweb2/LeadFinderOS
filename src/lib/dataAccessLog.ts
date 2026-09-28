// dataAccessLog — ask the server BEFORE Copy Numbers or a CSV download, and do nothing on a refusal
// (2026-09-29, docs/abuse-cost-protection.md). public.log_data_access decides and records:
//   · Sales: Copy Numbers only for their OWN leads (every id checked), per-copy / per-hour / per-day
//     limits, a warning on a large copy; CSV export refused outright (Paul, 2026-09-29).
//   · Admin: always allowed, always logged (who, when, how many rows, which filter).
// ⛔ FAIL CLOSED: an unanswered or failed log is a refusal — nothing is copied or downloaded. The UI
// hiding a button is presentation; this call is the boundary a direct browser request also meets.
import type { SupabaseClient } from '@supabase/supabase-js';

export type DataAccessKind = 'copy_numbers' | 'export_csv';

/** ok=false carries the sentence to show; ok=true carries ''. (One shape: the app is not strict-null, so a
 *  discriminated union would not narrow at the call sites.) */
export type DataAccessResult = { ok: boolean; message: string };

/** The sentence for a refusal. Never a cost or a provider (a salesperson may read it). */
export function dataAccessRefusalMessage(r: { error?: unknown; detail?: unknown; max_rows?: unknown } | null | undefined): string {
  const code = typeof r?.error === 'string' ? r.error : '';
  if (code === 'too_many_rows') {
    const n = typeof r?.max_rows === 'number' ? r.max_rows : null;
    return n ? `Copy at most ${n} numbers at a time — select fewer and copy again.` : 'Too many at once — select fewer and try again.';
  }
  if (code === 'not_your_leads') return 'Some of the selected leads are not yours, so nothing was copied.';
  if (code === 'lead_ids_required') return 'Nothing was copied — try again.';
  if (typeof r?.detail === 'string' && r.detail.trim()) return r.detail;
  return 'Usage temporarily paused — contact Paul';
}

export async function logDataAccess(
  client: SupabaseClient,
  kind: DataAccessKind,
  rows: number,
  leadIds: string[] | null,
  filter: Record<string, unknown> = {},
): Promise<DataAccessResult> {
  try {
    const { data, error } = await client.rpc('log_data_access', {
      _kind: kind, _rows: rows, _lead_ids: leadIds, _filter: filter,
    });
    if (error) return { ok: false, message: 'Could not record this, so nothing was copied or downloaded. Try again.' };
    const r = data as { ok?: unknown; error?: unknown; detail?: unknown; max_rows?: unknown } | null;
    if (r && r.ok === true) return { ok: true, message: '' };
    return { ok: false, message: dataAccessRefusalMessage(r) };
  } catch {
    return { ok: false, message: 'Could not record this, so nothing was copied or downloaded. Try again.' };
  }
}
