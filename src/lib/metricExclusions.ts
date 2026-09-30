/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INTERNAL / TEST DATA KEPT OUT OF THE BUSINESS NUMBERS (Admin control centre, 2026-09-30).
   Paul's decision (2026-09-30, not to be re-asked): the accounts "test1" and "Test" are excluded
   from every performance and attribution number — team comparison, WhatsApps, calls, replies,
   interested, meetings, conversions, API cost and revenue attribution. The businesses they added are
   NOT deleted or hidden: they stay in the CRM and count in lead INVENTORY.
   ⛔ EXCLUSION IS EXPLICIT, never guessed from a name: the rows live in table metric_exclusions (kind
   user / lead / phone / email + a reason), the dashboard shows what was excluded, and nothing is
   deleted. On top of the table, two facts the data already carries:
   - a WhatsApp row with test_mode = true, or status 'simulated', was never a real message;
   - the operator's own sign-up preview is page 'onboarding_preview' and is never a prospect.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type ExclusionKind = 'user' | 'lead' | 'phone' | 'email';
export interface ExclusionRow { kind: ExclusionKind | string; value: string; reason: string | null }

export interface Exclusions {
  users: ReadonlySet<string>;
  leads: ReadonlySet<string>;
  /** Last 10 digits — the same comparison the inbound matcher uses for UK numbers. */
  phones: ReadonlySet<string>;
  emails: ReadonlySet<string>;
  rows: readonly ExclusionRow[];
}

export const phoneKey = (p: string | null | undefined): string => String(p ?? '').replace(/\D/g, '').slice(-10);

export function buildExclusions(rows: readonly ExclusionRow[]): Exclusions {
  const users = new Set<string>(); const leads = new Set<string>(); const phones = new Set<string>(); const emails = new Set<string>();
  for (const r of rows) {
    const v = String(r.value ?? '').trim();
    if (!v) continue;
    if (r.kind === 'user') users.add(v);
    else if (r.kind === 'lead') leads.add(v);
    else if (r.kind === 'phone') { const k = phoneKey(v); if (k.length >= 9) phones.add(k); }
    else if (r.kind === 'email') emails.add(v.toLowerCase());
  }
  return { users, leads, phones, emails, rows };
}

export const NO_EXCLUSIONS: Exclusions = buildExclusions([]);

/** Is this person's activity internal/test? A null actor is automation — never excluded by identity. */
export const isExcludedUser = (ex: Exclusions, userId: string | null | undefined): boolean => !!userId && ex.users.has(userId);

/** Is this lead a test lead (by id, phone or email)? The lead still exists — this only keeps its
 *  activity out of performance numbers. */
export function isExcludedLead(ex: Exclusions, lead: { id: string; phone?: string | null; email?: string | null }): boolean {
  if (ex.leads.has(lead.id)) return true;
  const p = phoneKey(lead.phone);
  if (p && ex.phones.has(p)) return true;
  const e = String(lead.email ?? '').trim().toLowerCase();
  return !!e && ex.emails.has(e);
}

/** Was this WhatsApp row a real message from a real person? test_mode / simulated rows never were. */
export function isTestMessage(m: { test_mode?: boolean | null; status?: string | null }): boolean {
  return m.test_mode === true || m.status === 'simulated';
}

/** The line the dashboard shows under every attributed number. */
export function exclusionNote(ex: Exclusions, teamNames: Map<string, string>): string {
  const users = [...ex.users].map((u) => teamNames.get(u) ?? 'a test account');
  const parts: string[] = [];
  if (users.length) parts.push(`${users.length} test account${users.length === 1 ? '' : 's'} (${users.join(', ')})`);
  const other = ex.leads.size + ex.phones.size + ex.emails.size;
  if (other) parts.push(`${other} test lead${other === 1 ? '' : 's'}/number${other === 1 ? '' : 's'}`);
  parts.push('test-mode messages');
  return `Internal/test activity excluded: ${parts.join(', ')}.`;
}
