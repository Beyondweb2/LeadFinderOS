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

/* --------------------------- pre-sign-in photos --------------------------- */

export type BarberImageSlot = 'hero' | 'about';

const IMAGE_BUCKET = 'barber-site-images';
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
// content field each slot maps to (mirrors SiteImageManager).
const IMAGE_FIELD: Record<BarberImageSlot, string> = {
  hero: 'heroImageUrl',
  about: 'aboutImageUrl',
};

/**
 * Held in a MODULE singleton, NOT localStorage: a photo File is far too big for
 * the ~5 MB storage quota, and it only needs to survive the in-app navigation
 * from /s/ to /claim (same JS context, so a module variable persists). A hard
 * refresh drops it — the colour (localStorage) survives, the photo reverts to
 * default. Anon can't upload to the bucket, so the File is uploaded ON CLAIM
 * once the barber owns the site (owner storage RLS, <siteId>/ folder).
 */
const pendingImages: Partial<Record<BarberImageSlot, File>> = {};

/** Validate a picked photo. Returns a user-facing error, or null if OK. */
export function validateBarberImage(file: File): string | null {
  if (!IMAGE_ALLOWED.includes(file.type)) return 'Photo must be a JPEG, PNG or WebP.';
  if (file.size > IMAGE_MAX_BYTES) return 'Photo must be under 5 MB.';
  return null;
}

export function setPendingBarberImage(slot: BarberImageSlot, file: File | null): void {
  if (file) pendingImages[slot] = file;
  else delete pendingImages[slot];
}

function pendingImageSlots(): BarberImageSlot[] {
  return Object.keys(pendingImages) as BarberImageSlot[];
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
 * Writes the held accent colour AND uploads any held photos onto the barber's
 * just-claimed site (owner-RLS content update + owner storage RLS), then clears
 * the pending edit. Best-effort — never throws (a failed apply must not block the
 * redirect to the dashboard).
 */
export async function applyPendingBarberEdits(client: SupabaseClient): Promise<void> {
  const pending = readPendingBarberEdit();
  const slots = pendingImageSlots();
  if (!pending.accentColor && slots.length === 0) { clearPendingBarberEdit(); return; }
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

    const nextContent: Record<string, unknown> = { ...(site.content ?? {}) };
    if (pending.accentColor) nextContent.accentColor = pending.accentColor;

    // Upload each held photo to the owner's site folder (<siteId>/), then point
    // content at the public bucket URL. Per-photo best-effort: a failed upload is
    // skipped (its slot keeps the default) rather than aborting the whole apply.
    for (const slot of slots) {
      const file = pendingImages[slot];
      if (!file) continue;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${site.id}/${slot}-${Date.now()}-${Math.floor(performance.now())}.${ext}`;
      const { error } = await client.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) continue;
      nextContent[IMAGE_FIELD[slot]] = client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      delete pendingImages[slot];
    }

    await client.from('generated_sites').update({ content: nextContent }).eq('id', site.id);
  } catch {
    // best-effort; leave the pending edit so a later load could retry if desired
    return;
  }
  clearPendingBarberEdit();
}
