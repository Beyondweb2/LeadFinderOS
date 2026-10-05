/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAMPAIGNS: OWNED, PRIVATE, GLOBALLY UNIQUE, SIMPLE (2026-10-03). The live, role-by-role proof (Paul / rep A /
   rep B, every cross-owner call refused, every duplicate-name variant refused) is supabase/tests/campaign-
   ownership.sql, run rolled back. This suite fences the CODE so the rules cannot quietly come apart:
     1. the words: the name key, the owner in brackets (display only, admin only), the derived status, and a
        name_taken message that never says whose;
     2. the database: one unique index on campaign_name_key; SELECT own-or-admin; every campaign_* function
        role-checked first and ownership-checked before it acts; the owner from auth.uid(), never a parameter;
        a duplicate → name_taken; the three lead entry points refuse another owner's campaign; launch only
        through sales_queue_opener with the approved opener;
     3. the screens: the list and detail read ONLY the role-checked functions (no browser filter by owner);
        the rep's creation flow asks four things and none of the old settings;
     4. the side doors: the Sales dashboard and Quick Close never name another owner's campaign to a rep.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  campaignNameKey, campaignDisplayName, campaignStatus, campaignNextStep, campaignErrorText, CAMPAIGN_ERROR_TEXT, launchSkipLine,
} from "../src/lib/campaignRules.ts";
import { SALES_ROUTE_PATTERNS, SALES_NAV_ORDER, SALES_SECONDARY_NAV, canOpenRoute } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const SQL = read("supabase/migrations/20261006120000_campaign_ownership.sql");

console.log("── 1. the words ──");
{
  ok(["Roofers - Manchester", " roofers - manchester ", "Roofers - Manchester ", "ROOFERS  -   MANCHESTER", "\tRoofers - Manchester\n"].every((n) => campaignNameKey(n) === "roofers - manchester"), "case, outer and inner whitespace variants share one key");
  ok(campaignNameKey("Roofers - Manchester") !== campaignNameKey("Roofers - Manchester 2"), "a genuinely different name is a different key");
  ok(/lower\(regexp_replace\(btrim\(coalesce\(_name, ''\)\), '\\s\+', ' ', 'g'\)\)/.test(SQL), "…the SAME rule as SQL campaign_name_key (trim, collapse whitespace, lower)");
  ok(campaignDisplayName({ name: "Roofers - Manchester", is_mine: false, owner_name: "Sarah" }, true) === "Roofers - Manchester (Sarah)", "admin: another owner's campaign shows the owner in brackets");
  ok(campaignDisplayName({ name: "Roofers - Manchester", is_mine: true, owner_name: "Paul" }, true) === "Roofers - Manchester", "admin: their own stays plain");
  ok(campaignDisplayName({ name: "Roofers - Manchester", is_mine: false, owner_name: "Sarah" }, false) === "Roofers - Manchester", "a salesperson never sees a bracket");
  ok(campaignDisplayName({ name: "X", is_mine: false, owner_name: null }, true) === "X (another user)", "an owner with no name is still marked as someone else's");
  const s = (o: Partial<{ leads: number; ready: number; queued: number; contacted: number; replied: number }>) => ({ leads: 0, ready: 0, queued: 0, contacted: 0, replied: 0, ...o });
  ok(campaignStatus(s({})) === "draft" && campaignStatus(s({ leads: 3 })) === "draft", "no leads, or none that can go → draft");
  ok(campaignStatus(s({ leads: 3, ready: 3 })) === "ready", "new leads, nothing sent → ready");
  ok(campaignStatus(s({ leads: 3, queued: 2, contacted: 1 })) === "sending", "anything waiting in the queue → sending");
  ok(campaignStatus(s({ leads: 3, contacted: 3 })) === "sent" && campaignStatus(s({ leads: 4, contacted: 3, ready: 1 })) === "partly_sent", "all sent → sent; sent + new ones → partly sent");
  ok(/Answer replies/.test(campaignNextStep(s({ leads: 3, contacted: 3, replied: 1 }))), "the next step follows the state");
  ok(CAMPAIGN_ERROR_TEXT.name_taken === "A campaign with this name already exists. Choose a different name.", "the duplicate message, word for word");
  ok(!Object.values(CAMPAIGN_ERROR_TEXT).some((t) => /owned by|belongs to|created by|Paul's|another salesperson/i.test(t)), "no refusal names an owner");
  ok(campaignErrorText("weird_code") === "Not done (weird_code)." && launchSkipLine({ no_phone: 2, opted_out: 1 }) === "Not sent: 2 no phone number, 1 asked not to be contacted.", "unknown codes are quoted in a sentence; skips in words");
}

console.log("\n── 2. the database ──");
{
  ok(/create unique index if not exists campaigns_name_key_unique on public\.campaigns \(public\.campaign_name_key\(name\)\)/.test(SQL), "ONE unique index on the name key — the race is decided by the database");
  ok(/campaign_name_key\(_name text\)\s*returns text language sql immutable/.test(SQL), "the key function is immutable (usable in an index)");
  ok(/drop policy if exists "Authenticated users can view all campaigns"/.test(SQL) && /for select to authenticated\s*using \(\(select public\.my_role\(\)\) = 'admin' or created_by = \(select auth\.uid\(\)\)\)/.test(SQL), "READ: the admin all, anyone else only their own");
  const fns = [...SQL.matchAll(/create or replace function public\.(campaign_\w+|my_campaigns)\(([^)]*)\)[\s\S]*?\$\$;/g)];
  const names = fns.map((m) => m[1]);
  for (const need of ["campaign_create", "campaign_rename", "campaign_delete", "campaign_detail", "campaign_leads", "campaign_candidates", "campaign_add_leads", "campaign_launch", "campaign_stop", "campaign_name_available", "my_campaigns", "campaign_usable"]) ok(names.includes(need), `function ${need} exists`);
  for (const m of fns) {
    const body = m[0];
    if (m[1] === "campaign_name_key" || m[1] === "campaign_usable") continue;
    ok(/security definer set search_path = public/.test(body), `${m[1]}: security definer, fixed search_path`);
    const begin = body.indexOf("\nbegin");
    ok(begin > 0 && /if (v_role|public\.my_role\(\)) is null then raise exception 'no_role'/.test(body.slice(begin, begin + 160)), `${m[1]}: the role check is the first thing it does`);
    if (/_campaign_id uuid/.test(m[2])) ok(/if (?:_campaign_id is not null and )?not public\.campaign_usable\(_campaign_id\) then return jsonb_build_object\('ok', false, 'error', 'not_found'\)/.test(body), `${m[1]}: refuses another owner's campaign as not_found (no existence leak)`);
  }
  const usable = SQL.slice(SQL.indexOf("create or replace function public.campaign_usable"), SQL.indexOf("$$;", SQL.indexOf("create or replace function public.campaign_usable")));
  ok(/when 'sales' then exists \(select 1 from public\.campaigns where id = _campaign_id and created_by = auth\.uid\(\)\)/.test(usable) && /else false/.test(usable), "a salesperson may use ONLY their own; no role → nothing");
  const create = SQL.slice(SQL.indexOf("create or replace function public.campaign_create"), SQL.indexOf("create or replace function public.campaign_rename"));
  ok(/values \(v_name, auth\.uid\(\),/.test(create) && !/_owner|_created_by/.test(create), "the owner is the signed-in account, never a parameter");
  ok(/exception when unique_violation then\s*return jsonb_build_object\('ok', false, 'error', 'name_taken'\)/.test(create), "a duplicate (incl. the concurrent one) → name_taken");
  const rename = SQL.slice(SQL.indexOf("create or replace function public.campaign_rename"), SQL.indexOf("create or replace function public.campaign_delete"));
  ok(/exception when unique_violation then\s*return jsonb_build_object\('ok', false, 'error', 'name_taken'\)/.test(rename), "rename respects the same uniqueness");
  const avail = SQL.slice(SQL.indexOf("create or replace function public.campaign_name_available"), SQL.indexOf("create or replace function public.campaign_create"));
  ok(/id is distinct from _except/.test(avail) && !/created_by|owner/.test(avail.replace(/\/\*[\s\S]*?\*\//g, "")), "availability says taken / free — never whose; a campaign may keep its own name");
  ok(/if public\.my_role\(\) <> 'admin' and exists \(select 1 from public\.outreach_leads where campaign_id = _campaign_id\) then\s*return jsonb_build_object\('ok', false, 'error', 'has_leads'\)/.test(SQL), "a salesperson deletes only an empty campaign");
  ok(/v_r := public\.sales_queue_opener\(v_chunk, v_template\);/.test(SQL) && /select initial_opener_template into v_template from public\.whatsapp_outreach_state/.test(SQL), "launch = the existing safeguarded queue function, with the current approved opener only");
  ok(!/insert into public\.whatsapp_messages|functions\/v1|graph\.facebook/.test(SQL), "nothing here sends — the queue does, unchanged");
  ok(/set status = coalesce\(o\.previous_status, 'not_contacted'\), previous_status = null, queued_at = null, contact_method = null\s*where o\.campaign_id = _campaign_id and o\.status = 'queued'/.test(SQL), "stop takes only still-queued leads back to how they were");
  ok((SQL.match(/if not public\.campaign_usable\(_campaign_id\) then return jsonb_build_object\('ok', false, 'error', 'unknown_campaign'\)/g) ?? []).length === 1 && /if _campaign_id is not null and not public\.campaign_usable\(_campaign_id\) then\s*return jsonb_build_object\('ok', false, 'error', 'unknown_campaign'\)/.test(SQL), "lead_set_campaign and leads_set_campaign refuse another owner's campaign");
  ok(/not public\.campaign_usable\(nullif\(_lead->>'campaign_id', ''\)::uuid\) then\s*return jsonb_build_object\('ok', false, 'error', 'unknown_campaign'\)/.test(SQL), "sales_add_lead refuses another owner's campaign");
  ok(/'owner_id', _c\.created_by,/.test(SQL) && /else '\{\}'::jsonb end/.test(SQL), "owner fields go to the admin only");
}

console.log("\n── 3. the screens ──");
{
  const hook = read("src/hooks/useMyCampaigns.ts");
  ok(!/from\('campaigns'\)|created_by/.test(hook), "the Campaigns screens read only the role-checked functions — no browser filter by owner");
  /* Sales workspace v2 (Paul, 2026-10-05): no wizard. A campaign is four fields; leads come from Find Leads. */
  ok(!fs.existsSync(path.join(root, "src/components/campaigns/CampaignWizard.tsx")) && !fs.existsSync(path.join(root, "src/components/campaigns/LeadChooser.tsx")), "v2: the Name → Leads → Message → Review wizard and its lead chooser are gone");
  const form = read("src/components/campaigns/CampaignEditDialog.tsx");
  ok(/campaign-trade/.test(form) && /campaign-method-/.test(form) && /campaign-area/.test(form) && /campaign-name-input/.test(form) && !/LeadChooser|WHATSAPP_TEMPLATES|TemplateSnippet/.test(form), "v2: the one form is name · niche · Call/WhatsApp · optional area — no lead step, no message step");
  const detail = read("src/pages/CampaignDetail.tsx");
  ok(/<Navigate to=\{campaignId \? `\/outreach\?campaign=\$\{encodeURIComponent\(campaignId\)\}` : '\/campaigns'\} replace \/>/.test(detail) && !/Advanced settings|CampaignFormDialog/.test(detail), "v2: a campaign link opens Outreach filtered to it — no second lead screen, no admin side settings");
  const picker = read("src/components/CampaignPicker.tsx");
  ok(/\{label\(c\)\}/.test(picker) && /campaignDisplayName\(/.test(picker), "the shared dropdown shows the owner in brackets to the admin");
  const uc = read("src/hooks/useCampaigns.ts");
  ok(!/\.insert\(|\.update\(|\.delete\(/.test(uc) && /archived_at/.test(uc), "v2: no direct create / edit / hard delete for anyone — every write is a role-checked function; deleted campaigns are hidden from pickers");
  ok(/queryKey = useMemo\(\(\) => \['campaigns', user\?\.id \?\? 'anon'\] as const/.test(uc), "the list cache is per person (RLS returns each a different list)");
  ok(SALES_ROUTE_PATTERNS.includes("/campaigns") && canOpenRoute("sales", "/campaigns/abc") && !SALES_SECONDARY_NAV.includes("/campaigns") && !SALES_NAV_ORDER.includes("/campaigns"), "a salesperson can open Campaigns — from the top right of Find Leads / Outreach, never a menu item (Paul, 2026-10-03)");
  ok(!/url: '\/campaigns'/.test(read("src/components/AppSidebar.tsx")) && !/url: '\/campaigns'/.test(read("src/components/MobileBottomNav.tsx")), "no Campaigns item in the sidebar or the phone menu, for either role");
  ok(/<CampaignsButton \/>/.test(read("src/pages/Outreach.tsx")) && /<CampaignsButton \/>/.test(read("src/pages/Index.tsx")), "the Campaigns button sits top right of Outreach and Find Leads");
}

console.log("\n── 4. the side doors ──");
{
  const perf = read("supabase/functions/sales-performance/index.ts");
  ok(/actor\.role === "sales" && l\.campaign_id && !campaigns\.some\(\(c\) => c\.id === l\.campaign_id && c\.created_by === actor\.id\) \? ASSIGNED_CAMPAIGN_KEY/.test(perf), "Sales dashboard: a rep's leads in someone else's campaign are 'Leads assigned to you'");
  ok(/campaigns\.filter\(\(c\) => actor\.role !== "sales" \|\| c\.created_by === actor\.id\)/.test(perf), "…and no other owner's name reaches a rep");
  const qc = read("supabase/functions/quick-close/index.ts");
  ok(/actor\.role === "sales" \? service\.from\("campaigns"\)\.select\("name"\)\.eq\("id", lead\.campaign_id\)\.eq\("created_by", actor\.id\)/.test(qc), "Quick Close tells a rep only their own campaign's name");
}

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall campaign ownership checks passed");
