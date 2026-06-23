import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pre-sign-in barber edits (Phase 2: colour only). Held in the browser while the
 * barber tries their site on /s/:token, then APPLIED ON CLAIM once they're
 * authenticated (owner-RLS content write). Safe-wrapped storage (no-op if blocked).
 *
 * Single global key (a barber claims one site at a time) so the /s/ share-token
 * page and the /claim page — which use different tokens — can both reach it.
 */
const KEY = 'leadfinder_barber_pending_edit';

export interface PendingBarberEdit {
  /** Chosen accent hex (drives content.accentColor). */
  accentColor?: string;
}

export function readPendingBarberEdit(): PendingBarberEdit {
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PendingBarberEdit;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writePendingBarberEdit(patch: PendingBarberEdit): void {
  try {
    const next = { ...readPendingBarberEdit(), ...patch };
    const raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);
    sessionStorage.setItem(KEY, raw);
  } catch {
    // ignore quota / privacy-mode / blocked storage
  }
}

export function clearPendingBarberEdit(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

/**
 * APPLY-ON-CLAIM. Call right after a successful claim + sign-in (authenticated).
 * Writes the held accent colour onto the barber's just-claimed site via the
 * owner-RLS content update, then clears the pending edit. Best-effort — never
 * throws (a failed apply must not block the redirect to the dashboard).
 */
export async function applyPendingBarberEdits(client: SupabaseClient): Promise<void> {
  const pending = readPendingBarberEdit();
  if (!pending.accentColor) { clearPendingBarberEdit(); return; }
  try {
    // The owner can only see their own sites (RLS); the most-recently-claimed is
    // the one they just claimed. Untyped: tracking cols aren't in generated types.
    const { data: rows } = await client
      .from('generated_sites')
      .select('id, content')
      .order('claimed_at', { ascending: false })
      .limit(1);
    const site = (rows ?? [])[0] as { id: string; content: Record<string, unknown> | null } | undefined;
    if (!site) return;
    const nextContent = { ...(site.content ?? {}), accentColor: pending.accentColor };
    await client.from('generated_sites').update({ content: nextContent }).eq('id', site.id);
  } catch {
    // best-effort; leave the pending edit so a later load could retry if desired
    return;
  }
  clearPendingBarberEdit();
}
