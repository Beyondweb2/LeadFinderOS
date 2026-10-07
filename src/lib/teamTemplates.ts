/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEAM TEMPLATES vs MY TEMPLATES (2026-10-07, feature/shared-sales-templates) — the ONE place the rules read.
   One table (public.templates), one row per Team template. scope 'team' = the shared Findable library an admin manages and every
   salesperson can use; 'personal' (the default, every row that existed before) = one person's own. The database enforces it
   (migration 20261016100000 — a salesperson's policy can neither write a team row nor promote their own row to one); these helpers
   only decide what the screens OFFER, and can never grant more than the policies allow.
   ⛔ A Team template is USED by inserting its text into a composer (variables resolve there, leadUtils.fillTemplate), never edited
      through it. Using one never writes to the table. DUPLICATING one creates a NEW personal row.
   ⛔ These are the free-text sales templates. They are NOT the Meta-approved WhatsApp Business templates (findable_signup_link,
      findable_onboarding, the WHATSAPP_TEMPLATES list) — those are a separate system and are untouched here.
   Pure: no imports of the app's wiring.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export type TemplateScope = 'personal' | 'team';

export interface ScopedTemplate {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  template_type: string;
  scope?: string | null;
  archived_at?: string | null;
  sort_order?: number | null;
  created_at?: string;
}

/** The small marker on a Team row. */
export const TEAM_MARK = 'TEAM';
export const TEAM_HEADING = 'TEAM TEMPLATES';
export const MINE_HEADING = 'MY TEMPLATES';

/** ⛔ Positive: only the exact word 'team' is a team template; anything else (null, unknown) is personal. */
export const isTeamTemplate = (t: Pick<ScopedTemplate, 'scope'> | null | undefined): boolean => t?.scope === 'team';
export const isArchived = (t: Pick<ScopedTemplate, 'archived_at'> | null | undefined): boolean => !!t?.archived_at;

/** The two lists a picker shows: active Team templates (library order), then the person's own. */
export function splitTemplates<T extends ScopedTemplate>(rows: readonly T[], userId: string | null | undefined): { team: T[]; mine: T[] } {
  const team = rows.filter((t) => isTeamTemplate(t) && !isArchived(t))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const mine = rows.filter((t) => !isTeamTemplate(t) && !!userId && t.user_id === userId);
  return { team, mine };
}

/** May this person edit / delete / archive this template? Team → admins only; personal → its owner only. */
export function canManageTemplate(t: Pick<ScopedTemplate, 'scope' | 'user_id'>, who: { isAdmin: boolean; userId: string | null | undefined }): boolean {
  if (isTeamTemplate(t)) return who.isAdmin === true;
  return !!who.userId && t.user_id === who.userId;
}

/** "Save as my template": the NEW personal row. Never carries the id, the owner or the scope of the original. */
export function duplicateAsPersonal(t: Pick<ScopedTemplate, 'title' | 'content' | 'category' | 'template_type'>): { title: string; content: string; category: string; template_type: string; scope: 'personal' } {
  return { title: `${t.title} (my copy)`, content: t.content, category: t.category, template_type: t.template_type, scope: 'personal' };
}
