/* LIVE ZZ QA for the sales-to-payment final pass. NOT a test (underscore: never staged, never run by npm test).
   Usage: SUPABASE_MGMT_TOKEN_FILE=<file> npx tsx scripts/_qa_final_pass.ts <phase> [scenario...]
     phase "old"  — before the deploy: reproduce the bad state (a ready sales sign-up refuses the submit, 409)
     phase "new"  — after the deploy: scenarios A–F end to end
   Fixtures are ZZ QA Final … leads (no phone / email of a real person; paul@move37.fun only), excluded from metrics,
   archived at the end. Payment is simulated with scripts/qa-simulate-payment.ts (no Stripe, no money). */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { planQuickCloseSave, type QcRecord, type QuickCloseAnswers } from "../src/lib/quickClose.ts";

const REF = "ruusxpkkmwtljxxulhbq";
const BASE = `https://${REF}.supabase.co`;
const tokFile = process.env.SUPABASE_MGMT_TOKEN_FILE!;
const mgmt = readFileSync(tokFile, "utf8").trim();
const ANON = /"(eyJ[A-Za-z0-9_\-.]+)"/.exec(readFileSync("C:/Users/paulj/findable-site-wt/sales-to-payment-final-pass/functions/agree/[token].ts", "utf8"))![1];
const OWNER = "9d5a7629-3171-4091-b3a4-43010a1d424d"; // the data account (CLAUDE.md §6)
const SALES = "262c1d64-05ad-42e8-a81b-7d25553aeff3"; // Test salesperson (excluded)

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

interface Scn { tag: string; name: string; id: string; answers: Record<string, string>; expectRoute: "build" | "optimise"; expectReady: boolean }
const SCN: Scn[] = [
  { tag: "A", name: "ZZ QA Final A build self-managed", id: "11110000-0000-4000-8000-0000000000a2", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "owner", domain: "yes", rights: "yes", route: "build" } },
  { tag: "B", name: "ZZ QA Final B build agency free", id: "11110000-0000-4000-8000-0000000000b1", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "agency", agency_contract: "free", domain: "agency", rights: "no", route: "build" } },
  { tag: "C", name: "ZZ QA Final C optimise contract blocker", id: "11110000-0000-4000-8000-0000000000c1", expectRoute: "optimise", expectReady: true, answers: { decision_maker: "yes", manager: "agency", agency_contract: "in_contract", domain: "yes", rights: "yes", route: "optimise", access: "yes" } },
  { tag: "D", name: "ZZ QA Final D unknown contract", id: "11110000-0000-4000-8000-0000000000d2", expectRoute: "build", expectReady: false, answers: { decision_maker: "yes", manager: "agency", agency_contract: "not_sure", domain: "yes", rights: "yes", route: "build" } },
  { tag: "E", name: "ZZ QA Final E no website", id: "11110000-0000-4000-8000-0000000000e1", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "no_website", domain: "no_domain", route: "build" } },
  { tag: "F", name: "ZZ QA Final F resend", id: "11110000-0000-4000-8000-0000000000f1", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "owner", domain: "yes", rights: "yes", route: "build" } },
];

async function setup(s: Scn, o: { stage?: "lead" | "qc" | "all" } = {}) {
  const stage = o.stage ?? "all";
  if (stage !== "qc") {
  const [ex] = await sql<{ n: number }>(`select count(*)::int n from outreach_leads where id = ${lit(s.id)}`);
  if (ex.n) throw new Error(`fixture ${s.id} already exists — pick a fresh id`);
  await sql(`insert into outreach_leads (id, user_id, business_name, status, country, list_type, search_keyword, category, search_location, assigned_to_user_id, added_by_user_id, is_archived)
             values (${lit(s.id)}, ${lit(OWNER)}, ${lit(s.name)}, 'contacted', 'UK', 'no_website', 'electrician', 'Electrician', 'Leeds', ${lit(SALES)}, ${lit(SALES)}, false)`);
  await sql(`insert into metric_exclusions (kind, value, reason) values ('lead', ${lit(s.id)}, ${lit("QA fixture 07/10/2026: sales-to-payment final pass scenario " + s.tag + " (no phone, no real contact)")})`);
  if (stage === "lead") return { ob: "", qc: { answers: {} } as QcRecord, cols: {} };
  }
  const [{ quick_close_row: ob }] = await sql<{ quick_close_row: string }>(`select quick_close_row(${lit(s.id)}::uuid, ${lit(s.name)})`);
  // The salesperson's close, through the REAL save planner, one tap at a time (exactly what fn quick-close runs).
  let qc: QcRecord = { answers: {} }; let cols: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.answers)) {
    const plan = planQuickCloseSave(qc, { [k]: v }, { routeChangeConfirmed: true, actorId: SALES, nowIso: new Date().toISOString() });
    if (!plan.ok) throw new Error(`save ${k} refused: ${plan.error}`);
    qc = plan.next; cols = { ...cols, ...plan.cols };
  }
  const sets = Object.entries(cols).map(([k, v]) => `${k} = ${v === null ? "null" : typeof v === "boolean" ? v : lit(String(v))}`);
  await sql(`update onboarding_responses set contact_name = 'ZZ QA Client', contact_email = 'paul@move37.fun', ${sets.length ? sets.join(", ") + "," : ""} quick_close = ${lit(JSON.stringify({ ...qc, rev: 5 }))}::jsonb where id = ${lit(ob)}`);
  return { ob, qc, cols };
}

/** The agreement link: what quick-close asks findable-checkout for, then stores as the link (and the seller's event). */
async function makeLink(s: Scn, ob: string) {
  const r = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "signup_link" });
  const url: string | null = r.ok && r.kind === "signup_link" ? r.url : null;
  if (url) {
    const now = new Date().toISOString(); const exp = new Date(Date.now() + 29 * 24 * 3_600_000).toISOString();
    await sql(`update onboarding_responses set quick_close = quick_close || ${lit(JSON.stringify({ link_url: url, link_kind: "signup", link_generated_at: now, link_expires_at: exp }))}::jsonb where id = ${lit(ob)}`);
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from quick_close_events where onboarding_id = ${lit(ob)} and kind = 'link_generated'`);
    if (!n) await sql(`insert into quick_close_events (lead_id, onboarding_id, actor_user_id, kind, data) values (${lit(s.id)}, ${lit(ob)}, ${lit(SALES)}, 'link_generated', '{"qa":"final-pass"}'::jsonb)`);
  }
  return { r, url };
}
const submitBody = (leadId: string) => ({ action: "submit", lead_id: leadId, answers: { website_addon: false, plan_tier: "keep", services: "electrician", confirmed_location: "Leeds", gbp_consent: "yes_all", contact_email: "paul@move37.fun", contact_name: "ZZ QA Client", website_manager: "direct_access", business_name: "x" } });

async function phaseOld() {
  console.log("\n== BEFORE THE DEPLOY: reproduce the bad state (scenario A fixture, OLD server) ==");
  const s = SCN[0]; const { ob } = await setup(s); const { url } = await makeLink(s, ob);
  ok(!!url, `the salesperson's link exists: ${url?.replace(/[0-9a-f]{64}/, "<token>")}`);
  const pre = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
  ok(pre.ok && pre.sales_signup?.ready === true && pre.sales_signup?.onboarding_id === ob, `prefill: the sign-up is ready on its own row (route ${pre.sales_signup?.route})`);
  const sub = await fn("findable-onboarding", submitBody(s.id));
  console.log(`  >> OLD SERVER: submit on that valid sales sign-up → HTTP ${sub.status} ${JSON.stringify({ ok: sub.ok, error: sub.error })}`);
  ok(sub.status === 409 && sub.error === "signup_in_progress", "REPRODUCED: the old server answers 409 signup_in_progress (the page maps it to 'Your sign-up is already set up with the plan you agreed with us')");
}

async function runScenario(s: Scn, fresh: boolean) {
  console.log(`\n== SCENARIO ${s.tag}: ${s.name} ==`);
  let ob: string;
  if (fresh) ({ ob } = await setup(s)); else ob = (await sql<{ id: string }>(`select id from onboarding_responses where lead_id = ${lit(s.id)} limit 1`))[0].id;
  const { r: linkR, url } = await makeLink(s, ob);
  const token = url ? /([0-9a-f]{64})/.exec(url)![1] : null;
  const rowsCount = async () => (await sql<{ n: number }>(`select count(*)::int n from onboarding_responses where lead_id = ${lit(s.id)}`))[0].n;
  const planCols = async () => (await sql<Record<string, unknown>>(`select plan_tier, website_addon, status from onboarding_responses where id = ${lit(ob)}`))[0];
  const before = await planCols();
  const creationsBefore = (await sql<{ creator_user_id: string }>(`select creator_user_id from sale_creations where onboarding_id = ${lit(ob)}`));
  if (!s.expectReady) {
    /* D — contract "not sure": the Build stops for Paul. The salesperson cannot even make the link until he releases it. */
    ok(!url && (linkR.status === 403 || linkR.status === 409), `the link cannot be made while the contract is unconfirmed (Quick Close's own stop): HTTP ${linkR.status} ${linkR.error}`);
    const sub = await fn("findable-onboarding", submitBody(s.id));
    ok(sub.status === 409 && sub.error === "signup_pending", `the client on their page is told it is being finished (signup_pending), never an error: ${sub.error}`);
    const pre1 = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
    ok(pre1.sales_signup && pre1.sales_signup.ready === false && pre1.sales_signup.route === "build", "prefill: the sign-up is held, not ready, on Build — the page shows the 'finishing your set-up' line, no questionnaire");
    await sql(`update onboarding_responses set quick_close = quick_close || '{"review_approved_at":"${new Date().toISOString()}"}'::jsonb where id = ${lit(ob)}`);
    const l2 = await makeLink(s, ob);
    ok(!!l2.url, "after Paul's release (simulated by SQL on the fixture) the link can be made");
    const pre2 = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
    ok(pre2.sales_signup?.ready === true && pre2.sales_signup?.onboarding_id === ob, "…and the same sign-up is ready");
    return finishCommon(s, ob, l2.url ? /([0-9a-f]{64})/.exec(l2.url)![1] : null, before, creationsBefore, rowsCount);
  }
  ok(!!url && linkR.kind === "signup_link", `the signup link is made: ${url ? "ok" : JSON.stringify(linkR).slice(0, 160)}`);
  const pre = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
  const ss = pre.sales_signup;
  ok(ss && ss.ready === true && ss.route === s.expectRoute, `prefill: sign-up READY, route ${ss?.route}`);
  ok(Array.isArray(ss.confirm?.items) && ss.confirm.items.length === 4, `the confirmation items arrive: ${ss.confirm?.items?.map((i: any) => `${i.key}=${i.value}`).join(", ")}`);
  const rows0 = await rowsCount();
  // Reopen → the questionnaire submit a stale draft would make
  const sub1 = await fn("findable-onboarding", submitBody(s.id));
  ok(sub1.ok === true && sub1.resumed === true && sub1.onboarding_id === ob && sub1.route === s.expectRoute, `submit on the valid link RESUMES the same sign-up (${sub1.status} resumed=${sub1.resumed}, route ${sub1.route})`);
  const sub2 = await fn("findable-onboarding", submitBody(s.id));
  ok(sub2.ok === true && sub2.onboarding_id === ob, "closed and reopened (a second submit): the same sign-up again");
  ok((await rowsCount()) === rows0, `no duplicate sign-up created (rows: ${rows0} → ${await rowsCount()})`);
  const afterSub = await planCols();
  ok(afterSub.plan_tier === before.plan_tier && afterSub.website_addon === before.website_addon, `plan unchanged by the client's page (${afterSub.plan_tier} / ${afterSub.website_addon})`);
  // Tampering
  const tamper = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: { manager: ss.confirm.items.find((i: any) => i.key === "manager").value, route: s.expectRoute === "build" ? "optimise" : "build", plan_tier: "keep", website_addon: false, sold_by_user_id: OWNER } });
  ok(tamper.ok === true, "sales_confirm accepts the four facts and ignores everything else in the request");
  const afterT = await planCols();
  ok(afterT.plan_tier === before.plan_tier && afterT.website_addon === before.website_addon, "TAMPER: a forged route / plan_tier / website_addon / seller changed nothing");
  const wrong = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: "00000000-0000-4000-8000-000000000000", answers: { manager: "owner" } });
  ok(wrong.status === 409 && wrong.error === "not_held", "another sign-up id is refused (not_held)");
  // Light-touch correction (B only): the domain
  if (s.tag === "B") {
    const fix = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: { manager: "agency", agency_contract: "free", domain: "not_sure", rights: "no" } });
    ok(fix.ok === true && fix.ready === true && fix.changed?.join() === "domain", `a harmless correction (domain → not sure): saved, still ready, changed=${fix.changed}`);
  }
  // Scenario A: a correction that makes it unsafe holds it, then Paul's release reopens
  if (s.tag === "A") {
    const bad = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: { manager: "agency", agency_contract: "in_contract", domain: "yes", rights: "yes" } });
    ok(bad.ok === true && bad.ready === false, "CORRECTION that makes Build unsafe (agency, still in contract): saved and the sign-up is HELD for Paul");
    const co = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "pay" });
    ok(co.status === 409 && co.error === "held_for_review", `checkout refuses it (held_for_review): ${co.error}`);
    // Once held, only Paul releases it: the client cannot flip their own answer back and walk out of the hold.
    const back = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: { manager: "owner", domain: "yes", rights: "yes" } });
    ok(back.status === 409 && back.error === "not_held", `a held sign-up cannot be re-confirmed by the client (only Paul releases it): ${back.error}`);
    const hold = await fn("findable-onboarding", submitBody(s.id));
    ok(hold.status === 409 && hold.error === "signup_pending", `the client reopening it meanwhile is told it is being finished: ${hold.error}`);
    await sql(`update onboarding_responses set quick_close = quick_close || '{"review_approved_at":"${new Date().toISOString()}"}'::jsonb where id = ${lit(ob)}`);
    const rel = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
    ok(rel.sales_signup?.ready === true, "after Paul's release (simulated by SQL on the fixture) the same sign-up is ready again");
  } else {
    const looks = await fn("findable-onboarding", { action: "sales_confirm", lead_id: s.id, onboarding_id: ob, answers: Object.fromEntries(ss.confirm.items.filter((i: any) => i.value && (i.key !== "agency_contract" || ["agency", "freelancer"].includes(ss.confirm.items.find((x: any) => x.key === "manager").value))).map((i: any) => [i.key, i.value])) });
    ok(looks.ok === true && looks.ready === true, "Looks right: saved, the sign-up may go on");
  }
  const pre3 = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
  ok(pre3.sales_signup?.ready === true && pre3.sales_signup?.onboarding_id === ob, "reopen after confirming: the same sign-up, ready");
  if (s.tag === "F") {
    const l2 = await makeLink(s, ob);
    ok(l2.url === url, "RESEND: asking for the link again returns the identical URL (one canonical token per client)");
    const pre4 = await fn("findable-onboarding", { action: "prefill", lead_id: s.id });
    ok(pre4.sales_signup?.onboarding_id === ob && (await rowsCount()) === rows0, "…and opening it again resumes the same sign-up; still one row");
  }
  return finishCommon(s, ob, token, before, creationsBefore, rowsCount);
}

async function finishCommon(s: Scn, ob: string, token: string | null, before: Record<string, unknown>, creationsBefore: { creator_user_id: string }[], rowsCount: () => Promise<number>) {
  // Agreement before payment
  const unsigned = await fn("findable-checkout", { onboarding_id: ob, lead_id: s.id, purpose: "pay" });
  ok(unsigned.ok === true && unsigned.kind === "agreement_required", `payment before signing → the agreement (no Stripe session): kind=${unsigned.kind}`);
  const page = await fetch(`https://findable.live/agree/${token}`, { redirect: "manual" });
  const html = await page.text();
  const routeName = s.expectRoute === "build" ? "Findable Build" : "Findable Optimise";
  ok(page.status === 200 && html.includes("Client Service Agreement") && html.includes(routeName) && /v4/.test(html), `the agreement page opens on the exact link: ${page.status}, ${html.length} bytes, ${routeName}, v4`);
  const signupId = /name="s" value="([0-9a-f-]{36})"/.exec(html)?.[1];
  ok(signupId === ob, "…and signs THIS sign-up (the salesperson's)");
  const sign = await fetch(`https://findable.live/agree/${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ s: ob, legalName: "ZZ QA Final Ltd", companyNumber: "00000000", contactName: "ZZ QA Client", role: "Owner", address: "1 Test Street, Leeds LS1 1AA", email: "paul@move37.fun", phone: "07700900123", websiteDomain: "zzqa.example", agree: "yes", authority: "yes" }).toString() });
  const signHtml = await sign.text();
  ok(sign.status === 200 && /Accepted on/.test(signHtml), `signed v4: ${sign.status}${/Accepted on[^<]*/.exec(signHtml)?.[0] ? " — " + /Accepted on[^<]*/.exec(signHtml)![0].slice(0, 60) : ""}`);
  const [acc] = await sql<{ n: number; v: string; r: string }>(`select count(*)::int n, max(agreement_version) v, max(service_route) r from client_agreement_acceptances where lead_id = ${lit(s.id)} and onboarding_id = ${lit(ob)}`);
  ok(acc.n === 1 && acc.v === "v4" && acc.r === s.expectRoute, `one write-once acceptance: ${acc.v} / ${acc.r}`);
  // Payment (simulated twice — duplicate webhook safe)
  const run = spawnSync("npx", ["tsx", "scripts/qa-simulate-payment.ts", "--lead", s.id, "--onboarding", ob, "--times", "2"], { env: { ...process.env, SUPABASE_MGMT_TOKEN_FILE: tokFile }, encoding: "utf8", shell: true, cwd: "C:/Users/paulj/LeadFinderOS-wt/sales-to-payment-final-pass" });
  const out = (run.stdout ?? "") + (run.stderr ?? "");
  console.log(out.split("\n").filter((l) => /READ-BACK|lead  |ledger|counts|refus|ERROR|error/i.test(l)).map((l) => "    " + l.trim()).join("\n"));
  const [lead] = await sql<Record<string, any>>(`select status, amount_paid, contract_total_payments, sold_by_user_id, paid_signup_id from outreach_leads where id = ${lit(s.id)}`);
  ok(lead.status === "payment_received" || lead.status === "paid" || Number(lead.amount_paid) === 99, `PAID CLIENT: status ${lead.status}, £${lead.amount_paid}`);
  ok(Number(lead.contract_total_payments) === (s.expectRoute === "build" ? 12 : 6), `contract: ${lead.contract_total_payments} payments (${s.expectRoute})`);
  const [led] = await sql<{ n: number }>(`select count(*)::int n from payment_ledger where lead_id = ${lit(s.id)} and kind = 'initial'`).catch(async () => [{ n: -1 }]);
  console.log(`    payment_ledger initial rows: ${led.n}`);
  const [terms] = await sql<{ aid: string | null }>(`select agreement_acceptance_id aid from client_service_terms where lead_id = ${lit(s.id)} limit 1`).catch(() => [{ aid: "?" }]);
  ok(!!terms?.aid, `the payment is tied to the signature (client_service_terms.agreement_acceptance_id = ${String(terms?.aid).slice(0, 8)}…)`);
  const creations = await sql<{ creator_user_id: string }>(`select creator_user_id from sale_creations where onboarding_id = ${lit(ob)}`);
  ok(creations.length === 1 && creations[0].creator_user_id === SALES && creationsBefore.length <= creations.length, `SELLER: exactly one sign-up creation, by the Test salesperson, unchanged by the client's page (${creations.length})`);
  ok(lead.sold_by_user_id === SALES || lead.sold_by_user_id === null, `sold_by_user_id = ${lead.sold_by_user_id === SALES ? "the salesperson" : "null (held for attribution review — Test is not Ready to Sell)"}`);
  const [pc] = await sql<Record<string, any>>(`select status, plan_tier, website_addon from onboarding_responses where id = ${lit(ob)}`);
  ok(pc.plan_tier === before.plan_tier && pc.website_addon === before.website_addon, `plan on the row never changed: ${pc.plan_tier}/${pc.website_addon}`);
  ok((await rowsCount()) === 1, "ONE sign-up row for the client, start to finish");
}

async function archive() {
  for (const s of SCN) {
    await sql(`update outreach_leads set is_archived = true, phone = null, email = null where id = ${lit(s.id)}`).catch(() => {});
  }
  const rows = await sql(`select l.business_name, l.is_archived, (l.phone is null and l.email is null) as no_contact, exists (select 1 from metric_exclusions e where e.kind = 'lead' and e.value = l.id::text) as excluded from outreach_leads l where l.business_name ilike 'ZZ QA Final%' order by 1`);
  console.log("\nFIXTURES:", JSON.stringify(rows));
}

const phase = process.argv[2]; const only = process.argv.slice(3);
if (phase === "old") await phaseOld();
else if (phase === "new") {
  for (const s of SCN) {
    if (only.length && !only.includes(s.tag)) continue;
    const exists = (await sql<{ n: number }>(`select count(*)::int n from outreach_leads where id = ${lit(s.id)}`))[0].n > 0;
    await runScenario(s, !exists);
  }
  await archive();
} else if (phase === "render") {
  /* An UNPAID ready sales sign-up to look at in a browser (desktop + 390px). Archive it afterwards: phase "archive-render". */
  const s: Scn = { tag: "R", name: "ZZ QA Final R render", id: "11110000-0000-4000-8000-0000000000b9", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "agency", agency_contract: "free", domain: "agency", rights: "yes", route: "build" } };
  const exists = (await sql<{ n: number }>(`select count(*)::int n from outreach_leads where id = ${lit(s.id)}`))[0].n > 0;
  const ob = exists ? (await sql<{ id: string }>(`select id from onboarding_responses where lead_id = ${lit(s.id)} limit 1`))[0].id : (await setup(s)).ob;
  const { url } = await makeLink(s, ob);
  console.log("RENDER", JSON.stringify({ lead: s.id, ob, url }));
} else if (phase === "stale1" || phase === "stale2") {
  /* THE ROOT CAUSE, IN A REAL BROWSER: a lead that is self-service first (the client starts the questionnaire; a draft is
     saved in the tab), THEN a salesperson closes it. stale1 = the lead only; stale2 = the salesperson's sign-up + link. */
  const s: Scn = { tag: "S", name: "ZZ QA Final S stale draft", id: "11110000-0000-4000-8000-0000000000b8", expectRoute: "build", expectReady: true, answers: { decision_maker: "yes", manager: "owner", domain: "yes", rights: "yes", route: "build" } };
  if (phase === "stale1") { await setup(s, { stage: "lead" }); console.log("STALE1", s.id); }
  else { const r = await setup(s, { stage: "qc" }); const { url } = await makeLink(s, r.ob); console.log("STALE2", JSON.stringify({ ob: r.ob, url })); }
} else if (phase === "archive-render") {
  await sql(`update outreach_leads set is_archived = true, phone = null, email = null where id = '11110000-0000-4000-8000-0000000000b8'`);
  await sql(`update outreach_leads set is_archived = true, phone = null, email = null where id = '11110000-0000-4000-8000-0000000000b9'`);
  console.log("render fixture archived");
} else if (phase === "archive") await archive();
console.log(fails ? `\n${fails} QA FAILURES` : "\nQA ALL PASS");
process.exit(fails ? 1 : 0);
