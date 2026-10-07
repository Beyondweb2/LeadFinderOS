/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   THE TEAM LIBRARY'S EIGHT SEEDED TEMPLATES (2026-10-07, fix/seed-team-sales-templates).
   The words are NOT retyped: src/lib/teamTemplateSeed.ts renders the registered bodies (templateBodies.ts) and the picker labels
   (outreach.ts) with variable markers. This file proves the render IS the existing copy (resolve the markers → the same message the
   registered template shows), that the migration is that render, and that nothing else moved. The permissions are proven live by
   supabase/tests/team-seed.sql (a rolled-back run, recorded in docs/pre-sales-certification/team-templates.md).
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { teamSeedRows, teamSeedSql } from '../src/lib/teamTemplateSeed.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { fillTemplate, unresolvedTokens } from '../src/lib/leadUtils.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const WANT = [
  'Initial contact — original opener',
  'Initial contact v2 — newer opener (no business name)',
  'Audit reply (report + competitors)',
  'Audit result hook — with video (outreach)',
  'Competitor hook — names 3 rivals (outreach)',
  'Audit follow-up — "I asked chatgpt" note, no video (outreach)',
  'Audit follow-up + call — "I asked AI" note, no link (outreach)',
  'Audit follow-up + fault — names a site fault + report link (outreach)',
];
const rows = teamSeedRows();

console.log('\n── EXACTLY THE EIGHT, WITH THE PICKER\'S TITLES AND ORDER ──');
ok(rows.length === 8 && new Set(rows.map((r) => r.seedKey)).size === 8, 'eight rows, eight distinct seed keys');
ok(JSON.stringify(rows.map((r) => r.title)) === JSON.stringify(WANT), 'the titles are the eight picker labels, character for character, in the picker\'s order');
ok(rows.every((r) => WHATSAPP_TEMPLATES.find((t) => t.value === r.waName)?.label === r.title), 'and each is read from the live picker list (src/types/outreach.ts), not retyped');
ok(JSON.stringify(rows.map((r) => r.sortOrder)) === '[1,2,3,4,5,6,7,8]', 'sort_order 1..8 = the picker\'s order');
ok(rows.map((r) => r.category).join() === 'initial,initial,audit,audit,audit,follow_up,follow_up,follow_up', 'categories: openers → initial, audit reply / result hook / competitor hook → audit, the three follow-ups → follow_up (no new category)');

console.log('\n── THE WORDS ARE THE REGISTERED WORDS ──');
const LEAD = { business: 'Ace Locksmiths', trade: 'plumber', town: 'Leeds', link: 'https://findable.live/r/abc123', rivals: 'Alpha Ltd, Beta Ltd and Gamma Ltd', fault: 'Your site hides your phone number.' };
/* What each registered body prints for that lead, and what its seed prints once the markers resolve (rep-typed markers filled by hand). */
for (const r of rows) {
  const direct = READABLE_TEMPLATE_BODIES[r.waName](LEAD.business, LEAD.link, r.waName === 'audit_followup_call' || r.waName === 'audit_followup_fault' ? 'plumber' : LEAD.trade, LEAD.rivals, '', LEAD.town, LEAD.fault);
  const viaSeed = fillTemplate(r.content, { businessName: LEAD.business, link: LEAD.link, trade: LEAD.trade, town: LEAD.town })
    .split('{{competitors}}').join(LEAD.rivals).split('{{site_fault}}').join(LEAD.fault);
  /* The registered bodies print "a plumber"/"plumbers" through the same rules fillTemplate uses; compare after the one place they may differ
     (the article rule's own sentence). */
  ok(viaSeed === direct, `${r.waName}: resolving the markers reproduces the registered message word for word${viaSeed === direct ? '' : '\n   seed:   ' + JSON.stringify(viaSeed) + '\n   direct: ' + JSON.stringify(direct)}`);
}

console.log('\n── VARIABLES ARE MARKERS, NEVER A PROSPECT\'S DATA ──');
const markers = new Set(rows.flatMap((r) => unresolvedTokens(r.content)));
ok([...markers].every((m) => ['{{business_name}}', '{{link}}', '{{trade}}', '{{trade_plural}}', '{{trade_with_article}}', '{{town}}', '{{competitors}}', '{{site_fault}}'].includes(m)), `only the documented markers appear: ${[...markers].join(' ')}`);
ok(!rows.some((r) => /Ace Locksmiths|Leeds|Alpha Ltd|plumber/i.test(r.content)), 'no prospect-specific text is baked in');
ok(rows[1].content === 'Hey, are you taking on more jobs atm? Cheers' && !/\{\{/.test(rows[1].content), 'the v2 opener has no variables, exactly as registered');
ok(!/trade_plural\}\}s|a \{\{trade_with_article/.test(rows.map((r) => r.content).join('\n')), 'no renderer artefacts (a stray "s" after the plural marker, an article before the article marker)');
const gone = fillTemplate('for {{trade_with_article}} in {{town}} {{competitors}}', { trade: 'accountant', town: 'Leeds' });
ok(gone === 'for an accountant in Leeds {{competitors}}', 'the article marker resolves a vowel trade correctly ("an accountant")');
ok(unresolvedTokens('Hi Ace, nothing left') .length === 0 && unresolvedTokens('x {{ competitors }} y {{competitors}} {{link}}').join() === '{{competitors}},{{link}}', 'unresolved markers are detected (once each, spacing-tolerant)');
const inbox = read('src/pages/Inbox.tsx');
ok(/const left = unresolvedTokens\(body\);[\s\S]{0,200}Fill in the blanks first/.test(inbox) && /return false; \}\s*\}/.test(inbox.slice(inbox.indexOf('Fill in the blanks first'))), 'the Inbox refuses to send a free-text message that still carries a marker');
ok(/link: reportUrl, trade: activeLead\?\.category/.test(inbox), 'inserting a Team template fills the report link, trade and town from the open lead');

console.log('\n── THE MIGRATION IS THE RENDER, IDEMPOTENT, AND TOUCHES NOTHING ELSE ──');
const mig = read('supabase/migrations/20261016200000_seed_team_templates.sql');
ok(mig.includes(teamSeedSql()), 'the migration contains exactly the generated INSERT (any drift from the source copy fails here)');
ok(/on conflict \(seed_key\) where seed_key is not null do nothing/.test(mig) && /create unique index if not exists templates_seed_key_uniq on public\.templates \(seed_key\) where seed_key is not null/.test(mig), 'idempotent: a unique seed_key, ON CONFLICT DO NOTHING (a re-run inserts nothing and overwrites no admin edit)');
ok(/'text', 'team'/.test(mig) && /select min\(user_id::text\)::uuid as user_id from public\.user_roles where role = 'admin'/.test(mig), 'ONE shared team row each, owned by the admin account — no per-person copies');
const body = mig.split('\n').filter((l) => !l.startsWith('--')).join('\n');
ok(!/\bupdate\b|\bdelete\b|\bdrop\b|\btruncate\b/i.test(body), 'no update / delete / drop: existing rows (the old barber defaults and every personal template) are untouched');
ok(!/barber|simple website|get online with|findable_signup_link|findable_onboarding/i.test(body), 'no barber-era or old website-sales copy, and no Meta signup / onboarding template, is in the seed');
ok(rows.every((r) => !/barber|simple website/i.test(r.content)), 'none of the eight carries old barber / website-sales wording');

console.log('\n── THE META TEMPLATES ARE UNTOUCHED ──');
ok(rows.every((r) => WHATSAPP_TEMPLATES.some((t) => t.value === r.waName)) && WHATSAPP_TEMPLATES.length >= 8, 'every one of the eight is still in the code-defined WhatsApp picker list');
const seedSrc = read('src/lib/teamTemplateSeed.ts');
ok(!/WA_TEMPLATES|WHATSAPP_TEMPLATES\s*(=|\.push|\.splice)|writeFileSync/.test(seedSrc.replace(/\/\*[\s\S]*?\*\//g, '')), 'the seed only READS the registered bodies and labels');
ok(!/findable_signup_link|findable_onboarding/.test(seedSrc.replace(/\/\*[\s\S]*?\*\//g, '')), 'findable_signup_link / findable_onboarding appear nowhere in the seed code');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
