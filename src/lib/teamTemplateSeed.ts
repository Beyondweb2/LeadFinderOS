/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE EIGHT FINDABLE SALES TEMPLATES, AS THE TEAM LIBRARY'S SEED (2026-10-07, fix/seed-team-sales-templates).

   ⛔ NOT A SECOND COPY OF THE WORDS. The words live in src/lib/templateBodies.ts (READABLE_TEMPLATE_BODIES — the registered
   WhatsApp bodies) and the titles in src/types/outreach.ts (WHATSAPP_TEMPLATES labels). This file RENDERS those with variable
   markers instead of one prospect's values, so the seed is the existing copy byte for byte; scripts/team-template-seed.test.ts
   fails if the migration (supabase/migrations/20261016200000_seed_team_templates.sql) ever differs from this render.
   ⛔ THE META TEMPLATES ARE NOT TOUCHED. They stay code-defined and keep sending exactly as before; this only ALSO offers the
   same wording as ordinary editable text in the Team library (inserted into a composer, edited by the rep, sent as a normal message).
   Variable markers (resolved by leadUtils.fillTemplate from the open lead; the two rep-supplied ones are left for the rep, and
   unresolveTokens refuses to send a message that still carries one):
     {{business_name}}  {{link}} (the lead's report link)  {{trade}} / {{trade_plural}} / {{trade_with_article}}  {{town}}
     {{competitors}} (three rival names, typed by the rep)  {{site_fault}} (the one-sentence site fault, typed by the rep)
   Pure; node/tsx only (the generator prints the migration's INSERT).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { READABLE_TEMPLATE_BODIES } from './templateBodies.ts';
import { WHATSAPP_TEMPLATES } from '../types/outreach.ts';

export interface TeamSeedRow { seedKey: string; waName: string; title: string; category: 'initial' | 'audit' | 'follow_up'; sortOrder: number; content: string }

/** The picker's order, and how each maps onto the library's categories. */
const PLAN: { waName: string; category: TeamSeedRow['category']; trade: string }[] = [
  { waName: 'initial_contact', category: 'initial', trade: '{{trade}}' },
  { waName: 'initial_opener_v2', category: 'initial', trade: '{{trade}}' },
  { waName: 'audit_reply', category: 'audit', trade: '{{trade}}' },
  { waName: 'video_template', category: 'audit', trade: '{{trade}}' },
  { waName: 'competitor_hook', category: 'audit', trade: '{{trade_plural}}' },
  { waName: 'audit_followup', category: 'follow_up', trade: '{{trade_plural}}' },
  { waName: 'audit_followup_call', category: 'follow_up', trade: '{{trade_with_article}}' },
  { waName: 'audit_followup_fault', category: 'follow_up', trade: '{{trade_with_article}}' },
];

export function teamSeedRows(): TeamSeedRow[] {
  return PLAN.map((p, i) => {
    const label = WHATSAPP_TEMPLATES.find((t) => t.value === p.waName)?.label;
    const body = READABLE_TEMPLATE_BODIES[p.waName];
    if (!label || !body) throw new Error(`team seed: ${p.waName} is not in the picker / bodies any more`);
    /* The bodies run their own trade rules over whatever they are given, so the markers come back with a stray "s" (the plural rule) or
       a leading "a" (the article rule). Those two are the renderer's, not the wording: the marker stands for the WHOLE phrase. */
    const content = body('{{business_name}}', '{{link}}', p.trade, '{{competitors}}', '', '{{town}}', '{{site_fault}}')
      .replace(/\{\{trade_plural\}\}s/g, '{{trade_plural}}')
      .replace(/\ban? \{\{trade_with_article\}\}/g, '{{trade_with_article}}');
    return { seedKey: `findable_sales_${p.waName}`, waName: p.waName, title: label, category: p.category, sortOrder: i + 1, content };
  });
}

/** The migration's INSERT, generated (never hand-typed). */
export function teamSeedSql(): string {
  const lit = (s: string) => `$tpl$${s}$tpl$`;
  const values = teamSeedRows().map((r) => `  (${lit(r.seedKey)}, ${lit(r.title)}, ${lit(r.category)}, ${r.sortOrder}, ${lit(r.content)})`).join(',\n');
  return `insert into public.templates (user_id, template_type, scope, seed_key, title, category, sort_order, content, is_default)
select a.user_id, 'text', 'team', v.seed_key, v.title, v.category, v.sort_order, v.content, false
from (select min(user_id::text)::uuid as user_id from public.user_roles where role = 'admin') a
cross join (values
${values}
) as v(seed_key, title, category, sort_order, content)
where a.user_id is not null
on conflict (seed_key) where seed_key is not null do nothing;`;
}
