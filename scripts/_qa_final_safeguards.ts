/* LIVE ZZ QA for the two ways to close. NOT a test (underscore: never staged, never run by npm test).
   Usage: SUPABASE_MGMT_TOKEN_FILE=<file> npx tsx scripts/_qa_two_options.ts <phase> [tag...]
   Fixtures: "ZZ QA Safe" leads (no phone / email of a real person), excluded from metrics, archived at the end.
   Payment is simulated with scripts/qa-simulate-payment.ts (no Stripe, no money). */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { planQuickCloseSave, type QcRecord } from "../src/lib/quickClose.ts";

const REF = "ruusxpkkmwtljxxulhbq";
const BASE = `https://${REF}.supabase.co`;
const tokFile = process.env.SUPABASE_MGMT_TOKEN_FILE!;
const mgmt = readFileSync(tokFile, "utf8").trim();
const ANON = /"(eyJ[A-Za-z0-9_\-.]+)"/.exec(readFileSync("C:/Users/paulj/findable-site-wt/two-close-options/functions/agree/[token].ts", "utf8"))![1];
const OWNER = "9d5a7629-3171-4091-b3a4-43010a1d424d";
const SALES = "262c1d64-05ad-42e8-a81b-7d25553aeff3";
const ROOT = "C:/Users/paulj/LeadFinderOS-wt/two-close-final-safeguards";

async function sql<T = Record<string, unknown>>(q: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  const t = await r.text(); if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 500)}`); return JSON.parse(t) as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
async function fn(name: string, body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/functions/v1/${name}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", origin: "https://findable.live" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as Record<string, any>; return { status: r.status, ...j } as Record<string, any> & { status: number };
}
let fails = 0;
const ok = (c: unknown, l: string) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"} ${l}`); };

interface Scn { tag: string; name: string; id: string; kind: "phone" | "setup"; route: "build" | "optimise"; answers?: Record<string, string>; call?: { jobs: string; areas: string }; submit?: Record<string, unknown>; hold?: boolean; noPay?: boolean }
const COMMON = { services_list: ["Boiler repair", "Servicing"], areas_list: ["Leeds", "Bradford"], confirmed_location: "Leeds", website_manager: "web_company" };
const SCN: Scn[] = [
  { tag: "P1", kind: "phone", route: "build", name: "ZZ QA Safe P1 phone build", id: "11130000-0000-4000-8000-0000000000a1",
    answers: { decision_maker: "yes", manager: "owner", domain: "yes", route: "build" }, call: { jobs: "Emergency lockouts, lock changes", areas: "Canterbury, Whitstable" } },
  { tag: "S1", kind: "setup", route: "build", name: "ZZ QA Safe S1 setup build free", id: "11130000-0000-4000-8000-0000000000b1",
    submit: { ...COMMON, website_addon: true, plan_tier: "new_site", domain_status: "new", agency_contract: "free", dns_permission: true, materials_confirmed: true, authority_confirmed: true } },
  { tag: "S2", kind: "setup", route: "optimise", name: "ZZ QA Safe S2 setup optimise contract", id: "11130000-0000-4000-8000-0000000000b2",
    submit: { ...COMMON, website_addon: false, plan_tier: "keep", domain_status: "existing", agency_contract: "in_contract" } },
  { tag: "S3", kind: "setup", route: "build", name: "ZZ QA Safe S3 setup build in contract", id: "11130000-0000-4000-8000-0000000000b3", hold: true,
    submit: { ...COMMON, website_addon: true, plan_tier: "new_site", domain_status: "new", agency_contract: "in_contract", dns_permission: true, materials_confirmed: true, authority_confirmed: true } },
  { tag: "S4", kind: "setup", route: "build", name: "ZZ QA Safe S4 setup build not sure", id: "11130000-0000-4000-8000-0000000000b4", hold: true, noPay: true,
    submit: { ...COMMON, website_addon: true, plan_tier: "new_site", domain_status: "new", agency_contract: "not_sure", dns_permission: true, materials_confirmed: true, authority_confirmed: true } },
];

async function fixture(s: Scn) {
  const [ex] = await sql<{ n: number }>(`select count(*)::int n from outreach_leads where id = ${lit(s.id)}`);
  if (ex.n) throw new Error(`fixture ${s.id} already exists`);
  await sql(`insert into outreach_leads (id, user_id, business_name, status, country, list_type, search_keyword, category, search_location, assigned_to_user_id, added_by_user_id, is_archived)
             values (${lit(s.id)}, ${lit(OWNER)}, ${lit(s.name)}, 'contacted', 'UK', 'no_website', 'electrician', 'Electrician', 'Leeds', ${lit(SALES)}, ${lit(SALES)}, false)`);
  await sql(`insert into metric_exclusions (kind, value, reason) values ('lead', ${lit(s.id)}, ${lit("QA fixture 07/10/2026: two-close-options scenario " + s.tag + " (no phone, no real contact)")})`);
}
async function phoneSetup(s: Scn) {
  await fixture(s);
  const [{ quick_close_row: ob }] = await sql<{ quick_close_row: string }>(`select quick_close_row(${lit(s.id)}::uuid, ${lit(s.name)})`);
  let qc: QcRecord = { answers: {} }; let cols: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.answers!)) {
    const plan = planQuickCloseSave(qc, { [k]: v }, { routeChangeConfirmed: true, actorId: SALES, nowIso: new Date().toISOString() });
    if (!plan.ok) throw new Error(`save ${k} refused: ${plan.error}`);
    qc = plan.next; cols = { ...cols, ...plan.cols };
  }
  const sets = Object.entries(cols).map(([k, v]) => `${k} = ${v === null ? "null" : typeof v === "boolean" ? v : lit(String(v))}`);
  await sql(`update onboarding_responses set contact_name = 'ZZ QA Client', contact_email = 'paul@move37.fun', ${sets.length ? sets.join(", ") + "," : ""} quick_close = ${lit(JSON.stringify({ ...qc, call: s.call, rev: 5 }))}::jsonb where id = ${lit(ob)}`);
  await sql(`update outreach_leads set services_included = ${lit(JSON.stringify(s.call!.jobs.split(", ")))}::jsonb, service_areas = ${lit(JSON.stringify(s.call!.areas.split(", ")))}::jsonb where id = ${lit(s.id)}`).catch(() => {});
  return ob;
}
async function makeLink(s: Scn, ob: string) {
  const r = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "signup_link" });
  const url: string | null = r.ok && r.kind === "signup_link" ? r.url : null;
  if (url) {
    const now = new Date().toISOString(); const exp = new Date(Date.now() + 29 * 24 * 3_600_000).toISOString();
    await sql(`update onboarding_responses set quick_close = quick_close || ${lit(JSON.stringify({ link_url: url, link_kind: "signup", link_generated_at: now, link_expires_at: exp, close_route: "phone" }))}::jsonb where id = ${lit(ob)}`);
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from quick_close_events where onboarding_id = ${lit(ob)} and kind = 'link_generated'`);
    if (!n) await sql(`insert into quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values (${lit(s.id)}, ${lit(ob)}, ${lit(SALES)}, 'link_generated', '{"qa":"final"}'::jsonb)`);
  }
  return { r, url };
}
const rowsCount = async (id: string) => (await sql<{ n: number }>(`select count(*)::int n from onboarding_responses where lead_id = ${lit(id)} and coalesce(source,'') <> 'free_check'`))[0].n;

async function finish(s: Scn, ob: string, token: string, selfServe: boolean) {
  const unsigned = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "pay" });
  ok(unsigned.ok === true && unsigned.kind === "agreement_required", `payment before signing → the agreement, no Stripe session: kind=${unsigned.kind}`);
  const page = await fetch(`https://findable.live/agree/${token}`, { redirect: "manual" });
  const html = await page.text();
  const routeName = s.route === "build" ? "Findable Build" : "Findable Optimise";
  ok(page.status === 200 && html.includes("Client Service Agreement") && html.includes(routeName) && /v4/.test(html), `agreement page: ${page.status}, ${routeName}, v4`);
  ok(/name="s" value="([0-9a-f-]{36})"/.exec(html)?.[1] === ob, "…and it signs THIS sign-up");
  const sign = await fetch(`https://findable.live/agree/${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ s: ob, legalName: "ZZ QA Safe Ltd", companyNumber: "00000000", contactName: "ZZ QA Client", role: "Owner", address: "1 Test Street, Leeds LS1 1AA", email: "paul@move37.fun", phone: "07700900123", websiteDomain: "zzqa.example", agree: "yes", authority: "yes" }).toString() });
  const signHtml = await sign.text();
  ok(sign.status === 200 && /Accepted on/.test(signHtml), `signed v4: ${sign.status}`);
  const [acc] = await sql<{ n: number; v: string; r: string }>(`select count(*)::int n, max(agreement_version) v, max(service_route) r from client_agreement_acceptances where lead_id = ${lit(s.id)} and onboarding_id = ${lit(ob)}`);
  ok(acc.n === 1 && acc.v === "v4" && acc.r === s.route, `one acceptance: ${acc.v} / ${acc.r}`);
  const run = spawnSync("npx", ["tsx", "scripts/qa-simulate-payment.ts", "--lead", s.id, "--onboarding", ob, "--times", "2"], { env: { ...process.env, SUPABASE_MGMT_TOKEN_FILE: tokFile }, encoding: "utf8", shell: true, cwd: ROOT });
  const out = (run.stdout ?? "") + (run.stderr ?? "");
  console.log(out.split("\n").filter((l) => /READ-BACK|lead  |ledger|counts|refus|ERROR|error/i.test(l)).map((l) => "    " + l.trim()).join("\n"));
  const [lead] = await sql<Record<string, any>>(`select status, amount_paid, contract_total_payments, sold_by_user_id from outreach_leads where id = ${lit(s.id)}`);
  ok(lead.status === "payment_received" || lead.status === "paid" || Number(lead.amount_paid) === 99, `PAID CLIENT: status ${lead.status}, £${lead.amount_paid}`);
  ok(Number(lead.contract_total_payments) === (s.route === "build" ? 12 : 6), `contract: ${lead.contract_total_payments} payments (${s.route})`);
  const creations = await sql<{ creator_user_id: string }>(`select creator_user_id from sale_creations where onboarding_id = ${lit(ob)}`);
  if (!selfServe) ok(creations.length === 1 && creations[0].creator_user_id === SALES, `SELLER: one sign-up creation, by the Test salesperson (${creations.length})`);
  else {
    ok(lead.sold_by_user_id === SALES, `STORED ATTRIBUTION: outreach_leads.sold_by_user_id = the sender (${lead.sold_by_user_id})`);
    const led = await sql<Record<string, any>>(`select sold_by_user_id, commission_rule, commission_rate from payment_ledger where lead_id = ${lit(s.id)}`);
    ok(led.length === 1 && led[0].sold_by_user_id === SALES, `payment_ledger seller + commission rule: ${JSON.stringify(led)}`);
    const rev = await sql<{ n: number }>(`select count(*)::int n from sale_attribution_reviews where lead_id = ${lit(s.id)}`);
    ok(rev[0].n === 0, "no attribution review opened (nothing held, nothing for Paul)");
    const [dec] = await sql<{ d: any }>(`select public.sale_attribution_decision(l) d from outreach_leads l where l.id = ${lit(s.id)}`);
    console.log("    decision:", JSON.stringify({ seller: dec.d?.seller, source: dec.d?.source, reason: dec.d?.reason }));
  }
  ok((await rowsCount(s.id)) === 1, "ONE sign-up row for the client, start to finish");
}

async function phone(s: Scn) {
  console.log(`\n== ${s.tag}: ${s.name} (CLOSE ON THE PHONE) ==`);
  const ob = await phoneSetup(s);
  const { r, url } = await makeLink(s, ob);
  ok(!!url && /^https:\/\/findable\.live\/agree\/[0-9a-f]{64}$/.test(url ?? ""), `the Agreement & Payment link is a findable.live /agree/ link, never Stripe: ${url ? url.replace(/[0-9a-f]{64}/, "<token>") : JSON.stringify(r).slice(0, 160)}`);
  const pre = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
  const ss = pre.sales_signup;
  ok(ss?.ready === true && ss.route === s.route && ss.onboarding_id === ob, `customer's page: sign-up READY on the salesperson's row, plan ${ss?.route}`);
  const keys = (ss?.confirm?.items ?? []).map((i: any) => i.key).join();
  ok(keys === "manager,agency_contract,domain", `confirmation items (no reuse question): ${keys}`);
  const sum = ss?.confirm?.summary ?? [];
  console.log("    summary:", JSON.stringify(sum));
  ok(sum.map((x: any) => x.label).join("|") === "What you offer|Where you want to be found|Your plan" && sum[0].text === s.call!.jobs && sum[1].text === s.call!.areas && sum[2].text === (s.route === "build" ? "Findable Build" : "Findable Optimise"), "summary shows services, areas and the plan");
  ok(!JSON.stringify(pre).includes("checkout.stripe.com"), "no Stripe URL anywhere in what the customer's page is given");
  const rows0 = await rowsCount(s.id);
  const sub = await fn("findable-onboarding", { action: "submit", lead_id: s.id, answers: { website_addon: false, plan_tier: "keep", services: "x", confirmed_location: "Leeds", gbp_consent: "yes_all", contact_email: "paul@move37.fun", contact_name: "ZZ QA Client", business_name: "x" } });
  ok(sub.ok === true && sub.resumed === true && sub.onboarding_id === ob, "RESUME: the customer opening the full questionnaire lands on the SAME sign-up");
  ok((await rowsCount(s.id)) === rows0, "no duplicate sign-up");
  const l2 = await makeLink(s, ob);
  ok(l2.url === url, "RESEND: the same link again → identical URL");
  const looks = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: Object.fromEntries((ss.confirm.items as any[]).filter((i) => i.value && (i.key !== "agency_contract" || ["agency", "freelancer"].includes((ss.confirm.items as any[]).find((x) => x.key === "manager").value))).map((i) => [i.key, i.value])) });
  ok(looks.ok === true && looks.ready === true, "Looks right → saved, ready");
  const [qrow] = await sql<{ cr: string | null }>(`select quick_close->>'close_route' cr from onboarding_responses where id = ${lit(ob)}`);
  ok(qrow.cr === "phone", "the route is recorded: phone");
  await finish(s, ob, /([0-9a-f]{64})/.exec(url!)![1], false);
}

async function setup(s: Scn) {
  console.log(`\n== ${s.tag}: ${s.name} (SEND FULL SETUP — the client's own page) ==`);
  await fixture(s);
  /* what quick-close share_setup writes when the salesperson sends the link (event "link_shared", variant "setup") */
  await sql(`insert into quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values (${lit(s.id)}, null, ${lit(SALES)}, 'link_shared', '{"channel":"whatsapp","variant":"setup","status":"sent","qa":"final-safeguards"}'::jsonb)`);
  const pre = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
  ok(pre.ok === true && !pre.sales_signup, "customer opens their own link: no sales sign-up held, the full page runs");
  const body = { action: "submit", lead_id: s.id, answers: { services: "x", gbp_consent: "yes_all", contact_email: "paul@move37.fun", contact_name: "ZZ QA Client", confirmed_phone: "07700900123", business_name: s.name, ...s.submit } };
  const sub = await fn("findable-onboarding", body);
  ok(sub.ok === true && !!sub.onboarding_id, `submit: saved ${sub.ok ? "" : JSON.stringify(sub).slice(0, 200)}`);
  const ob = sub.onboarding_id as string;
  const [row] = await sql<Record<string, any>>(`select agency_contract, services_list, areas_list, plan_tier, website_addon from onboarding_responses where id = ${lit(ob)}`);
  ok(row.agency_contract === s.submit!.agency_contract, `agency_contract stored: ${row.agency_contract}`);
  ok(JSON.stringify(row.services_list) === JSON.stringify(s.submit!.services_list) && JSON.stringify(row.areas_list) === JSON.stringify(s.submit!.areas_list), `services + areas stored before payment: ${JSON.stringify(row.services_list)} / ${JSON.stringify(row.areas_list)}`);
  ok(row.plan_tier === (s.route === "build" ? "new_site" : "keep"), `plan on the row: ${row.plan_tier}`);
  const sub2 = await fn("findable-onboarding", body);
  console.log(`    second identical submit → HTTP ${sub2.status} ${sub2.error ?? "ok"} (cooldown or a second row is the existing behaviour; not a close-option change)`);
  const ev = await sql<{ actor_user_id: string; n: number }>(`select actor_user_id, count(*) over () n from quick_close_events where onboarding_id = ${lit(ob)} and kind = 'link_generated'`);
  ok(ev.length === 1 && ev[0].actor_user_id === SALES, `FULL SETUP KEEPS ITS SELLER: the client's new sign-up carries exactly one creation event, by the sender (${ev.length})`);
  const sc = await sql<{ creator_user_id: string; creator_role: string; creator_ready: boolean }>(`select creator_user_id, creator_role, creator_ready from sale_creations where onboarding_id = ${lit(ob)}`);
  ok(sc.length === 1 && sc[0].creator_user_id === SALES, `sale_creations snapshot: ${JSON.stringify(sc)}`);
  if (s.hold) {
    const held = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "pay" });
    ok(held.status === 409 && held.error === "held_for_review", `Build + agency + ${s.submit!.agency_contract} → payment HELD for Paul: ${held.status} ${held.error}`);
    const nt = await sql<{ n: number }>(`select count(*)::int n from notifications where dedupe_key = ${lit("self_serve_review:" + ob)}`);
    ok(nt[0].n >= 1, "Paul was notified (same notification kind as a phone-close review)");
    if (s.noPay) { console.log("    (held and left held — no release)"); return; }
    await sql(`update onboarding_responses set quick_close = coalesce(quick_close, '{}'::jsonb) || ${lit(JSON.stringify({ review_approved_at: new Date().toISOString() }))}::jsonb where id = ${lit(ob)}`);
    console.log("    Paul's release simulated by SQL on the fixture (the field quick-close approve_review writes)");
  }
  const co = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "pay" });
  ok(co.ok === true && co.kind === "agreement_required" && /\/agree\/[0-9a-f]{64}/.test(co.url ?? ""), `checkout → the agreement first: kind=${co.kind} ${co.error ?? ""} ${co.reason ?? ""}`);
  const token = /([0-9a-f]{64})/.exec(co.url ?? "")?.[1];
  if (!token) { ok(false, "no agreement token — cannot continue"); return; }
  await finish(s, ob, token, true);
}

async function archive() {
  for (const s of SCN) await sql(`update outreach_leads set is_archived = true, phone = null, email = null where id = ${lit(s.id)}`).catch(() => {});
  const rows = await sql(`select l.business_name, l.is_archived, (l.phone is null and l.email is null) as no_contact, exists (select 1 from metric_exclusions e where e.kind = 'lead' and e.value = l.id::text) as excluded from outreach_leads l where l.business_name ilike 'ZZ QA Safe%' order by 1`);
  console.log("\nFIXTURES:", JSON.stringify(rows));
}

const only = process.argv.slice(2);
for (const s of SCN) {
  if (only.length && !only.includes(s.tag)) continue;
  try { if (s.kind === "phone") await phone(s); else await setup(s); } catch (e) { fails++; console.log("  FAIL (threw)", (e as Error).message.slice(0, 300)); }
}
await archive();
console.log(fails ? `\n${fails} QA FAILURES` : "\nQA ALL PASS");
process.exit(fails ? 1 : 0);
