-- SEED THE TEAM LIBRARY (2026-10-07, fix/seed-team-sales-templates). The eight current Findable sales templates as ordinary Team rows.
-- GENERATED from src/lib/teamTemplateSeed.ts, which renders src/lib/templateBodies.ts (the registered wording) and the picker labels in
-- src/types/outreach.ts with variable markers — so the words are the existing copy byte for byte. scripts/team-template-seed.test.ts fails
-- if this file ever differs from that render.
-- ⛔ ONE shared row each, never a copy per person; owned by the admin; IDEMPOTENT (seed_key is unique): running it again inserts nothing and
--    never overwrites an edit an admin made since. The old barber-era defaults and every personal row are not touched.
-- ⛔ The Meta WhatsApp templates are code-defined and are NOT touched; this only ALSO offers the same wording as editable text.
alter table public.templates add column if not exists seed_key text;
create unique index if not exists templates_seed_key_uniq on public.templates (seed_key) where seed_key is not null;

insert into public.templates (user_id, template_type, scope, seed_key, title, category, sort_order, content, is_default)
select a.user_id, 'text', 'team', v.seed_key, v.title, v.category, v.sort_order, v.content, false
from (select min(user_id::text)::uuid as user_id from public.user_roles where role = 'admin') a
cross join (values
  ($tpl$findable_sales_initial_contact$tpl$, $tpl$Initial contact — original opener$tpl$, $tpl$initial$tpl$, 1, $tpl$Hi, is this {{business_name}}?

Cheers$tpl$),
  ($tpl$findable_sales_initial_opener_v2$tpl$, $tpl$Initial contact v2 — newer opener (no business name)$tpl$, $tpl$initial$tpl$, 2, $tpl$Hey, are you taking on more jobs atm? Cheers$tpl$),
  ($tpl$findable_sales_audit_reply$tpl$, $tpl$Audit reply (report + competitors)$tpl$, $tpl$audit$tpl$, 3, $tpl$Hi, thanks for getting back.
We asked AI tools like ChatGPT to recommend a {{trade}} in your area, it's naming {{competitors}} - not {{business_name}}.
We ran a full report on your business for AI and SEO visibility: {{link}}
We could get you showing up in those results - it's mostly stuff we handle at our end.
Want me to explain?$tpl$),
  ($tpl$findable_sales_video_template$tpl$, $tpl$Audit result hook — with video (outreach)$tpl$, $tpl$audit$tpl$, 4, $tpl$Hi {{business_name}} 👋

I ran a quick AI visibility check on your business and found something you'll probably want to see.

When people ask ChatGPT or Gemini for a {{trade}} in {{town}}, you're not showing up as often as you should be.

I've put the full findings together for you here:

📋 *Your free AI visibility audit*
{{link}}

🌐 https://findable.live/

It's completely free to look through, no signup or obligation.

Have a read, and if you want I'll explain what's causing it and how we'd fix it.

Paul, Findable.$tpl$),
  ($tpl$findable_sales_competitor_hook$tpl$, $tpl$Competitor hook — names 3 rivals (outreach)$tpl$, $tpl$audit$tpl$, 5, $tpl$Hi {{business_name}},

I asked ChatGPT and Gemini to find {{trade_plural}} in your area.

They came back with businesses including {{competitors}}.

I checked whether your business was being mentioned too.

📋 Here's your free AI visibility audit:
{{link}}

It shows exactly what AI sees about your business and where you stand.

🌐 https://findable.live/

Find out how we get you into those searches on our website, or I can explain more here if you'd like?

Paul.$tpl$),
  ($tpl$findable_sales_audit_followup$tpl$, $tpl$Audit follow-up — "I asked chatgpt" note, no video (outreach)$tpl$, $tpl$follow_up$tpl$, 6, $tpl$I asked chatgpt for {{trade_plural}} in {{town}} this morning.

It came back with {{competitors}}.

Ran you a free audit, you can see the results here:
{{link}}

45% of people now use AI to find local businesses. Same on Gemini, and I know how to get you showing up in those searches.

Want me to explain?$tpl$),
  ($tpl$findable_sales_audit_followup_call$tpl$, $tpl$Audit follow-up + call — "I asked AI" note, no link (outreach)$tpl$, $tpl$follow_up$tpl$, 7, $tpl$Hi mate, i was looking for {{trade_with_article}} in {{town}} so i asked AI and it mentioned {{competitors}}

I know how to get you showing up more in those answers so people are more likely to find you

Happy to explain it here or jump on a quick call if you'd rather

Paul✌️$tpl$),
  ($tpl$findable_sales_audit_followup_fault$tpl$, $tpl$Audit follow-up + fault — names a site fault + report link (outreach)$tpl$, $tpl$follow_up$tpl$, 8, $tpl$Hi mate, i was looking for {{trade_with_article}} in {{town}} so i asked AI and it mentioned {{competitors}}

Here's the main thing holding you back.

{{site_fault}}

I know how to get you showing up more in those answers so people are more likely to find you

Here's the proof: {{link}}

Happy to explain more here or jump on a quick call if you'd rather

Paul✌️$tpl$)
) as v(seed_key, title, category, sort_order, content)
where a.user_id is not null
on conflict (seed_key) where seed_key is not null do nothing;
