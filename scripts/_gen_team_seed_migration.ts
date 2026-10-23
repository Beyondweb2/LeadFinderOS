/* Generates supabase/migrations/20261016200000_seed_team_templates.sql from the live source (never hand-typed). Untracked tool. */
import fs from 'node:fs';
import path from 'node:path';
import { teamSeedSql } from '../src/lib/teamTemplateSeed.ts';

const header = `-- SEED THE TEAM LIBRARY (2026-10-07, fix/seed-team-sales-templates). The eight current Findable sales templates as ordinary Team rows.
-- GENERATED from src/lib/teamTemplateSeed.ts, which renders src/lib/templateBodies.ts (the registered wording) and the picker labels in
-- src/types/outreach.ts with variable markers — so the words are the existing copy byte for byte. scripts/team-template-seed.test.ts fails
-- if this file ever differs from that render.
-- ⛔ ONE shared row each, never a copy per person; owned by the admin; IDEMPOTENT (seed_key is unique): running it again inserts nothing and
--    never overwrites an edit an admin made since. The old barber-era defaults and every personal row are not touched.
-- ⛔ The Meta WhatsApp templates are code-defined and are NOT touched; this only ALSO offers the same wording as editable text.
alter table public.templates add column if not exists seed_key text;
create unique index if not exists templates_seed_key_uniq on public.templates (seed_key) where seed_key is not null;

`;
const out = path.resolve(import.meta.dirname, '../supabase/migrations/20261016200000_seed_team_templates.sql');
fs.writeFileSync(out, header + teamSeedSql() + '\n');
console.log('wrote', out);
