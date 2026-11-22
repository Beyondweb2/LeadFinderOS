/* ============================================================
   CAMPAIGN PERFORMANCE (2026-11-22, docs/campaign-performance.md) — the bot filter, the real-reply rule, the per-template
   fold, the tracked-link wrap and the wiring that makes them run.
   ============================================================ */
import { readFileSync } from "node:fs";
import { botReasonFor, isHumanHit, FAST_OPEN_MS, REPORT_VIEW_LOG_START } from "../src/lib/engagementBots.ts";
import { isRealReplyAt, AUTO_REPLY_WINDOW_MS } from "../src/lib/realReply.ts";
import { campaignPerformance, MIN_SENDS_TO_JUDGE, pct, type PerfLeadInput } from "../src/lib/campaignPerformance.ts";
import { creditRepliesByTemplate } from "../src/lib/templateAttribution.ts";
import { isTrackableReportLink } from "../supabase/functions/_shared/tracked-link.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const T0 = Date.parse("2026-11-22T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

console.log("── Link-preview user agents are bots ──");
const BOTS: Array<[string, string]> = [
  ["WhatsApp/2.23.20.0 A", "whatsapp"],
  ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "facebook"],
  ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "slack"],
  ["Twitterbot/1.0", "twitter"],
  ["TelegramBot (like TwitterBot)", "telegram"],
  ["Mozilla/5.0 (compatible; Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/))", "google"],
  ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "google"],
  ["Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "discord"],
  ["LinkedInBot/1.0", "linkedin"],
  ["curl/8.4.0", "script"],
  ["", "no_user_agent"],
];
for (const [ua, why] of BOTS) ok(botReasonFor(ua) === why, `"${ua.slice(0, 40)}" → ${why}`);
console.log("\n── Real phones and browsers are not ──");
for (const ua of [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
]) ok(botReasonFor(ua) === null, `person: ${ua.slice(13, 60)}`);

console.log("\n── Too fast with no script = a preview; a script that ran = a person ──");
ok(!isHumanHit({ at: iso(T0 + 2_000), bot_reason: null, js_at: null }, [T0]), `no-JS load ${2}s after our send is a preview`);
ok(isHumanHit({ at: iso(T0 + 2_000), bot_reason: null, js_at: iso(T0 + 3_000) }, [T0]), "a load 2s after the send whose script ran is a person");
ok(isHumanHit({ at: iso(T0 + FAST_OPEN_MS + 1_000), bot_reason: null, js_at: null }, [T0]), "a no-JS load after the window is a person");
ok(!isHumanHit({ at: iso(T0 + 60_000), bot_reason: "whatsapp", js_at: iso(T0 + 61_000) }, [T0]), "a marked bot is never a person, even with a ping");
ok(!isHumanHit({ at: "not a date", bot_reason: null, js_at: null }, [T0]), "an unreadable time is never a person");
ok(isHumanHit({ at: iso(T0 - 1_000), bot_reason: null, js_at: null }, [T0]), "a load BEFORE the send is not inside the window");
ok(REPORT_VIEW_LOG_START === Date.parse("2026-11-22T00:00:00Z"), "the view log start is fixed, never derived");

console.log("\n── A real reply ──");
const out = (ms: number, template: string | null = "initial_contact", status = "delivered") => ({ direction: "outbound", template_name: template, status, created_at: iso(ms), body: "hi" });
const inn = (ms: number, body = "Yes please, tell me more") => ({ direction: "inbound", template_name: null, status: "received", created_at: iso(ms), body });
{
  const m = [out(T0), inn(T0 + 20_000)];
  ok(!isRealReplyAt(m, 1), "a reply 20s after our send is an auto-reply");
  const m2 = [out(T0), inn(T0 + AUTO_REPLY_WINDOW_MS + 5_000)];
  ok(isRealReplyAt(m2, 1), "a reply after a minute is real");
  const m3 = [out(T0), inn(T0 + 10 * 60_000, "Thanks for contacting us, we will get back to you")];
  ok(!isRealReplyAt(m3, 1), "auto-reply wording is not real, however late");
  const m4 = [out(T0, "initial_contact", "failed"), inn(T0 + 10_000)];
  ok(isRealReplyAt(m4, 1), "a FAILED send does not start the one-minute window");
  ok(!isRealReplyAt(m2, 0), "an outbound message is never a reply");
}

console.log("\n── The existing attribution is unchanged by default ──");
{
  const m = [out(T0), inn(T0 + 10_000)];
  ok(creditRepliesByTemplate(m).length === 1, "the default rule still credits a fast human-looking reply (other screens unchanged)");
}

console.log("\n── The per-template fold ──");
const lead = (id: string, msgs: ReturnType<typeof out | typeof inn>[], extra: Partial<PerfLeadInput> = {}): PerfLeadInput =>
  ({ id, interested: false, messages: msgs, views: [], clicks: [], ...extra });
{
  const leads: PerfLeadInput[] = [];
  // 25 leads on opener A: 10 read, 5 real replies (2 min later), 3 auto replies (10s), 4 report opens via audit_reply
  for (let i = 0; i < 25; i++) {
    const t = T0 + i * 3_600_000;
    const msgs: ReturnType<typeof out | typeof inn>[] = [out(t, "initial_contact", i < 10 ? "read" : "delivered")];
    if (i < 5) msgs.push(inn(t + 120_000));
    else if (i < 8) msgs.push(inn(t + 10_000));
    leads.push(lead(`a${i}`, msgs, { interested: i < 2 }));
  }
  // 30 leads on opener B: 9 real replies
  for (let i = 0; i < 30; i++) {
    const t = T0 + i * 3_600_000;
    leads.push(lead(`b${i}`, i < 9 ? [out(t, "initial_contact_short"), inn(t + 300_000)] : [out(t, "initial_contact_short")]));
  }
  // 3 leads on C, all replied — too few to judge
  for (let i = 0; i < 3; i++) leads.push(lead(`c${i}`, [out(T0 + i, "webdev_hook"), inn(T0 + i + 600_000)]));
  // a report-link follow-up with a JS-confirmed open, a preview-only open, and a tracked click
  leads.push(lead("d1", [out(T0, "audit_reply")], { views: [{ at: iso(T0 + 1_000), bot_reason: null, js_at: null }, { at: iso(T0 + 600_000), bot_reason: null, js_at: iso(T0 + 601_000) }] }));
  leads.push(lead("d2", [out(T0, "audit_reply")], { views: [{ at: iso(T0 + 1_000), bot_reason: "whatsapp" }] }));
  leads.push(lead("d3", [out(T0, "audit_reply")], { clicks: [{ at: iso(T0 + 900_000), bot_reason: null, template_name: "audit_reply" }] }));
  leads.push(lead("d4", [out(T0, "initial_contact")], { views: [{ at: iso(T0 + 900_000), bot_reason: null, js_at: iso(T0 + 900_500) }] }));

  const p = campaignPerformance(leads);
  const row = (t: string) => p.rows.find((r) => r.template === t)!;
  const A = row("initial_contact"), B = row("initial_contact_short"), C = row("webdev_hook"), D = row("audit_reply");
  ok(A.sent === 26 && A.read === 10, `opener A: 26 sent, 10 read (got ${A.sent}/${A.read})`);
  ok(A.repliedRaw === 8 && A.repliedReal === 5, `opener A: raw 8, real 5 (got ${A.repliedRaw}/${A.repliedReal})`);
  ok(A.interested === 2, "opener A: 2 interested, both real repliers");
  ok(B.repliedReal === 9 && B.judged, "opener B: 9 real of 30, judged");
  ok(!C.judged && C.repliedReal === 3, `webdev_hook: ${C.sent} sends < ${MIN_SENDS_TO_JUDGE} → not judged, even at 100%`);
  ok(p.best === "initial_contact_short", `best = the judged template with the highest real-reply rate (got ${p.best})`);
  ok(D.sent === 3 && D.opened === 2, `audit_reply: 2 of 3 opened (JS-confirmed view + a tracked click; the preview never) — got ${D.opened}`);
  ok(p.botHits === 2, `two preview hits left out (got ${p.botHits})`);
  ok(p.unattributedOpens === 1, "a view after a template with no report link is not credited to it");
  ok(pct(1, 3) === 33.3 && pct(0, 0) === null, "pct rounds to one decimal and is empty for no sends");
  ok(campaignPerformance([lead("x", [out(T0, null)])]).rows.length === 0, "a free-text send makes no template row");
  const tiny = campaignPerformance([lead("y", [out(T0, "initial_contact"), inn(T0 + 600_000)])]);
  ok(tiny.best === null, "nothing judged → no best");
}

console.log("\n── The tracked link ──");
ok(isTrackableReportLink("https://findable.live/r/k4m2p9"), "a findable.live report link is wrapped");
ok(isTrackableReportLink("https://app.leadfinderos.com/r/k4m2p9"), "a LeadFinderOS report link is wrapped");
for (const u of ["https://findable.live/agree/abcdef0123456789", "https://findable.live/details/abc", "https://findable.live/w/k4m2p9", "https://findable.live/report/0b6f3e2a-1111-2222-3333-444455556666", "https://evil.example/r/k4m2p9", "http://findable.live/r/k4m2p9", "https://findable.live/r/example"])
  ok(!isTrackableReportLink(u), `never wrapped: ${u}`);

console.log("\n── The wiring ──");
const swm = read("supabase/functions/send-whatsapp-message/index.ts");
ok(/if \(!dryRun && \(tvars\.includes\("url"\) \|\| tvars\.includes\("audit_url"\)\)\) \{\n\s+a = \{ \.\.\.a, link: await trackReportLink\(/.test(swm), "send-whatsapp-message wraps the report link (never on a dry run)");
ok(swm.indexOf("trackReportLink(service") < swm.indexOf("payload = claimTemplatePayload(templateName, lang, a.business, a.link"), "…before the payload is built");
const pwq = read("supabase/functions/process-whatsapp-queue/index.ts");
ok(/vars = \{ \.\.\.vars, link: await trackReportLink\(service, \{ leadId: row\.lead_id/.test(pwq), "the queue wraps it the same way");
const tl = read("supabase/functions/_shared/tracked-link.ts");
ok(/return opts\.url;/.test(tl) && !/throw /.test(tl), "the wrap is fail-open: it never throws, it returns the original link");
const rar = read("supabase/functions/render-audit-report/index.ts");
ok((rar.match(/htmlResponse\(page\(/g) ?? []).length === 4, "every successful report page carries the view ping");
ok(/viewId = await logReportView\(/.test(rar.slice(rar.indexOf('url.searchParams.get("preview") !== "1"'))), "views are logged only without preview=1");
const te = read("supabase/functions/track-engagement/index.ts");
ok(/OUR_TARGET_RE\.test\(data\)/.test(te), "track-engagement only ever returns one of our own addresses");
for (const p of ["functions/l/[code].ts", "C:/Users/paulj/findable-site-wt/tracked-link/functions/l/[code].ts"]) {
  let src = ""; try { src = read(p); } catch { /* other repo not here */ }
  if (!src) { console.log(`SKIP ${p} (not on this machine)`); continue; }
  ok(/OUR_TARGET_RE\.test\(body\.url\)/.test(src) && /"user-agent": visitorUa/.test(src), `${p}: forwards the visitor's agent and redirects only to our addresses`);
}
const mig = read("supabase/migrations/20261226090000_campaign_engagement_tracking.sql");
for (const fn of ["log_report_view(uuid, text, text)", "report_view_ping(uuid)", "create_tracked_link(uuid, text, text)", "log_link_click(text, text, text)"])
  ok(mig.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), `${fn} is service-role only`);
ok(!/for (insert|update|delete|all)/i.test(mig.replace(/--.*$/gm, "")), "no browser write policy on the three logs");
const cp = read("supabase/functions/campaign-performance/index.ts");
ok(/resolveActor\(req, /.test(cp) && /camp\.created_by === actor\.id/.test(cp) && /q\.eq\("assigned_to_user_id", actor\.id\)/.test(cp), "campaign-performance: admin any; a salesperson only their own campaign and leads");
ok(!/body\b/.test(cp.slice(cp.indexOf("return json({\n      ok: true"))), "campaign-performance returns counts, never message text");
const cfg = read("supabase/config.toml");
ok(/\[functions\.campaign-performance\]\nverify_jwt = true/.test(cfg) && /\[functions\.track-engagement\]\nverify_jwt = false/.test(cfg), "both new functions have their verify_jwt entry");

console.log("\n── initial_with_link (leadfinderos.com/go/<code>) ──");
{
  const { claimTemplatePayload, WA_TEMPLATES } = await import("../supabase/functions/_shared/whatsapp-send.ts");
  const { openerApproved, isInitialOpener } = await import("../src/lib/openerVariant.ts");
  const { WHATSAPP_TEMPLATES } = await import("../src/types/outreach.ts");
  const { isColdOutreachTemplate } = await import("../src/lib/coldOutreach.ts");
  ok(JSON.stringify(WA_TEMPLATES.initial_with_link) === JSON.stringify({ lang: "en", vars: ["go_code"] }), "registered: English, one variable (the tracking code)");
  ok(/initial_with_link: \{ lang: "en", vars: \["go_code"\] \}/.test(read("supabase/functions/process-whatsapp-queue/index.ts")), "the queue's mirror matches");
  ok(openerApproved("initial_with_link") && isInitialOpener("initial_with_link") && isColdOutreachTemplate("initial_with_link"), "an approved cold opener (Paul: treat as approved)");
  ok(WHATSAPP_TEMPLATES.some((t) => t.value === "initial_with_link"), "in the one picker list");
  const p = claimTemplatePayload("initial_with_link", "en", "Acme Web", "", { goCode: "ab12cd34" }) as { template: { components: Array<{ type: string; parameters: Array<{ text: string }> }> } };
  ok(p.template.components.length === 1 && p.template.components[0].type === "body" && p.template.components[0].parameters[0].text === "ab12cd34", "{{1}} = the code, nothing else");
  let threw = ""; try { claimTemplatePayload("initial_with_link", "en", "Acme Web", "", {}); } catch (e) { threw = (e as Error).message; }
  ok(threw.startsWith("unsafe_template_var:no_tracking_code"), "no code → a visible hold, never a send with a broken link");
  const tl2 = read("supabase/functions/_shared/tracked-link.ts");
  ok(/style !== "leadfinderos"/.test(tl2) && /p_target: GO_LINK_DESTINATION/.test(tl2), "a code only for a LeadFinderOS-style campaign, landing on leadfinderos.com");
  ok(/if \(!gc\.ok\) return json\(\{ ok: false, error: "go_link_unavailable"/.test(swm) || /if \(!gc\.ok\) return json\(\{ ok: false, error: "go_link_unavailable"/.test(read("supabase/functions/send-whatsapp-message/index.ts")), "send-whatsapp-message refuses without a code");
  ok(/whatsapp_delivery_status: "go_link_unavailable"/.test(read("supabase/functions/process-whatsapp-queue/index.ts")), "the queue takes the lead out with the reason");
  const te2 = read("supabase/functions/track-engagement/index.ts");
  ok(/status: 302, headers: \{ location: GO_LINK_DESTINATION/.test(te2), "?go= always lands on https://leadfinderos.com/");
  const m2 = read("supabase/migrations/20261226100000_initial_with_link.sql");
  ok(m2.includes("'initial_contact_short', 'initial_with_link', 'ai_visibility_report_offer'") && m2.includes("v_reason := public.opener_contact_block(v_id);"), "queueable as a cold opener; opt-out / Do Not Contact block unchanged");
  /* 2026-11-22 (fix/initial-with-link-text): the Inbox shows Meta's approved words — DISPLAY ONLY. */
  const { readableTemplateBody } = await import("../src/lib/templateBodies.ts");
  const APPROVED = "Hey ✌️, fellow web dev here\n\nIf you sell websites, SEO or AI visibility you might wanna check this out\n\nhttps://leadfinderos.com/go/<tracking code>\n\nAll the best\nPaul";
  ok(readableTemplateBody("[initial_with_link]", "initial_with_link", { businessName: "Acme Web", url: "https://x.test/onboard" }) === APPROVED, "the Inbox shows the approved wording, not [initial_with_link]");
  const { renderTemplateBody } = await import("../supabase/functions/_shared/whatsapp-send.ts");
  ok(renderTemplateBody("initial_with_link", "Acme Web", "") === "[initial_with_link]", "with no code the renderer still gives the placeholder (never words with a broken link)");
  /* 2026-11-22b (fix/initial-with-link-parity): parity with the other templates — the real words with this lead's real link. */
  const { initialWithLinkBody } = await import("../src/lib/initialWithLink.ts");
  const { freeTextVersionOf, inWindowShape } = await import("../src/lib/inWindowFreeText.ts");
  const REAL = initialWithLinkBody("ab12cd34");
  ok(REAL === APPROVED.replace("<tracking code>", "ab12cd34"), "the plain-text version is the approved wording with https://leadfinderos.com/go/<the code>");
  const v = freeTextVersionOf(p, REAL);
  ok(v.ok === true && v.text === REAL, "it has a plain-text version (no 'No plain-text version')");
  const open = inWindowShape({ origin: "inbox", windowOpen: true, allowClosedText: false, typed: false, version: v });
  ok(open.as === "text" && (open as { text: string }).text === REAL, "window open → goes as free text, those words (no template charge)");
  ok(inWindowShape({ origin: "inbox", windowOpen: false, allowClosedText: false, typed: false, version: v }).as === "template", "window closed → the Meta template ({{1}} = the code)");
  const swm2 = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(/if \(goCode\) storedBody = initialWithLinkBody\(goCode\);/.test(swm2), "send-whatsapp-message stores / previews the real words");
  ok(!/dryrun00/.test(swm2), "the dry run (preview, Put in message box) uses the lead's real code, not a stand-in");
  ok(/if \(templateExtra\.goCode\) campaignBody = initialWithLinkBody\(templateExtra\.goCode\);/.test(read("supabase/functions/process-whatsapp-queue/index.ts")), "the queue stores the real words too");
  ok(/from\("tracked_links"\)\.select\("code"\)[\s\S]{0,200}eq\("template_name", template\)/.test(tl2) && tl2.indexOf('from("tracked_links").select("code")') < tl2.indexOf('rpc("create_tracked_link"'), "one code per lead + template: reused before a new one is made (preview link = sent link)");
  ok(/sendCheckBody\.current\.get\(sendCheckId\)/.test(read("src/pages/Inbox.tsx")), "the Inbox eye shows the dry run's real link for it");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
