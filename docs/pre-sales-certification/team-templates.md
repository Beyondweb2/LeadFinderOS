# Team templates (2026-10-07, feature/shared-sales-templates)

**What they are.** The free-text sales templates in `public.templates` (the Templates page, Inbox *Quick reply*, the WhatsApp composer's template button).
**Not** the Meta-approved WhatsApp Business templates (`findable_signup_link`, `findable_onboarding`, `WHATSAPP_TEMPLATES`) — a different system, untouched.

**Before.** One table, one owner per row, `user_id = auth.uid()` for every operation (a salesperson saw only their own; since 2026-10-04 nobody is seeded).
Paul's rows: nine barber-era defaults ("I help local businesses get online with simple websites…") + "Barbers". The eight named openers / audit hooks
(Initial contact, Competitor hook, Audit follow-up…) are Meta WhatsApp templates defined in code (`src/types/outreach.ts`), not rows in this table; they were
already available to everyone through the Inbox's *Send a template* list.

**Now.** Same table; `scope` ('personal' default | 'team'), `archived_at`, `sort_order`. ONE row per Team template, never a copy per person.
RLS (migration `20261016100000_team_templates.sql`): everyone reads their own + every ACTIVE Team template (admin or salesperson); only an admin creates / edits /
archives / deletes a Team row; a salesperson cannot write a Team row or promote their own. Proof: `supabase/tests/team-templates.sql` (rolled-back DO block, 23 checks, all PASS live).
Rules for the screens: `src/lib/teamTemplates.ts`. Using a template only writes a draft (`fillTemplate`: `{{business_name}}`, `{{link}}` as before). *Save as my template*
creates a NEW personal row. Admin: Team / Just me on create, **Share with the team** on his own rows, Archive / Restore, Delete.
Where they appear: Templates page (TEAM TEMPLATES then MY TEMPLATES), Inbox Quick reply, the WhatsApp composer's template picker.

**Nothing was promoted automatically.** Paul's nine existing rows are barber-era copy the team should not be handed; the Team library starts empty and
Paul shares what he wants with one click (Share with the team).

## Seeded 2026-10-07 (fix/seed-team-sales-templates)
The eight current sales templates are Team rows (migration `20261016200000_seed_team_templates.sql`, GENERATED from `src/lib/teamTemplateSeed.ts`, which renders the registered bodies in
`templateBodies.ts` and the picker labels in `outreach.ts` with markers — `{{business_name}}`, `{{link}}`, `{{trade}}` / `{{trade_plural}}` / `{{trade_with_article}}`, `{{town}}`, and the two the rep types:
`{{competitors}}`, `{{site_fault}}`). Idempotent (unique `seed_key`, ON CONFLICT DO NOTHING). The Inbox fills link / trade / town from the open lead (`leadUtils.fillTemplate`, the same trade rules as
the WhatsApp templates) and refuses to send a message that still carries a marker (`unresolvedTokens`). Live proof: `supabase/tests/team-seed.sql`; the live rows were compared to the source byte for byte.
Old barber defaults stay personal; the Meta templates (including findable_signup_link / findable_onboarding) are untouched.
