/* RENDER CHECK — SAMPLE PIXELS, DO NOT READ CSS. Scratch tool, not committed.
   Renders every customer-facing document with REAL data (AD Locksmithing's free check), screenshots
   each in headless Chromium, and samples pixels at the band, the footer, the CTA and the body. Also
   scans every pixel for the retired blues. Run: npx tsx scripts/_render-check.ts [--live]  */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
/* Playwright and pngjs are installed in findable-site, not here; resolve them from there. */
const req = createRequire("C:/Users/paulj/findable-site/scripts/_anchor.js");
const { chromium } = req("playwright") as typeof import("playwright");
const { PNG } = req("pngjs") as typeof import("pngjs");
import { buildReportData, type QueueRow, type RunRow } from "../src/lib/auditReport.ts";
import { renderReportHtml, type AiAuditReportData } from "../src/lib/aiAuditReportHtml.ts";
import { buildWelcomePackHtml } from "../src/lib/welcomePackHtml.ts";
import { renderPagePlanHtml } from "../src/lib/pagePlanReportHtml.ts";
import { renderClientRequestDoc } from "../src/lib/clientRequestDoc.ts";
import { comparisonToPrintableHtml } from "../src/lib/measurementExport.ts";
import { compareMeasurements } from "../src/lib/measurementCompare.ts";
import { isAggregatorUrl } from "../src/lib/aggregators.ts";

const OUT = path.join(process.env.TEMP!, "render-check"); fs.mkdirSync(OUT, { recursive: true });
const AUDIT = "c39bc81c-8f72-4d29-8ad8-28a3b4bca1f9";
const LIVE = process.argv.includes("--live");

const keys = JSON.parse(execSync("npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const K = keys.find((k: { name: string }) => k.name === "service_role").api_key;
const U = "https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1";
const get = async (q: string) => (await fetch(`${U}/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json();

const [audit] = await get(`ai_audits?select=*&id=eq.${AUDIT}`);
const runs = await get(`ai_audit_runs?select=id,audit_id,run_number,status,mention_rate,results,created_at&audit_id=eq.${AUDIT}&order=run_number`);
const qrows = await get(`ai_audit_queue?select=id,run_id,question,status,result,engines&audit_id=eq.${AUDIT}&order=created_at`);
const latest = runs[runs.length - 1] as RunRow;
const data = buildReportData(qrows as QueueRow[], latest, {
  businessName: audit.business_name, businessType: audit.business_type ?? "", locationText: audit.location_text ?? "",
  specialisms: "", isAggregatorUrl, ownWebsite: "", hasWebsite: null, seoStyle: "issues",
})!;
data.showOffer = true; data.offerUrl = "https://findable.live/onboarding/ad-locksmithing/?lead=test";

const docs: Record<string, string> = {
  "client-report (live report / before-after iframe)": renderReportHtml({ ...data, internal: false }),
  "in-app preview (internal)": renderReportHtml({ ...data, internal: true }),
  "welcome pack": buildWelcomePackHtml({ businessName: audit.business_name, reviewLink: null, report: data }),
  "page plan": renderPagePlanHtml({
    businessName: audit.business_name, businessType: audit.business_type, generatedAtLabel: "13 Sep 2026", internal: false,
    waves: [{ wave: 1, items: [
      { job: "Lock repairs in Newcastle", topic: "Lock repairs", labelKind: "build", label: "Build", winnability: "open", questions: [{ text: "lock repairs newcastle", chatgpt: "0/3", gemini: "0/3" }], sources: [{ domain: "checkatrade.com", count: 4 }], heldReason: null, score: 80, rationale: null, scoreReasons: [] },
      { job: "Emergency locksmith Gateshead", topic: "Emergency", labelKind: "gap", label: "Build — Gemini gap", winnability: "contested", questions: [{ text: "emergency locksmith gateshead", chatgpt: "2/3", gemini: "0/3" }], sources: [{ domain: "yell.com", count: 2 }], heldReason: null, score: 40, rationale: null, scoreReasons: [] },
      { job: "Best locksmiths", topic: "Best", labelKind: "defend", label: "Defend", winnability: "named", questions: [{ text: "best locksmiths newcastle", chatgpt: "3/3", gemini: "3/3" }], sources: [], heldReason: "Held — already named", score: 10, rationale: null, scoreReasons: [] },
      { job: "Safe engineers", topic: "Safes", labelKind: "locked", label: "Held — market locked", winnability: "locked", questions: [{ text: "safe engineer newcastle", chatgpt: "0/3", gemini: "0/3" }], sources: [{ domain: "timpson.co.uk", count: 6 }], heldReason: "Held — market locked: Timpson dominates", score: 5, rationale: null, scoreReasons: [] },
    ] }],
  }),
  "client request sheet": renderClientRequestDoc({
    businessName: audit.business_name, trade: "Locksmith", town: "Newcastle upon Tyne",
    fields: [{ name: "Phone number", value: "", held: false, why: "so directories can verify you" }, { name: "Trading address", value: "12 High St", held: true }],
    services: ["Lock repairs", "Emergency lockouts"], areas: ["Gateshead"], seo: null, naming: { named: data.named, total: data.total },
  }),
  "before/after export": comparisonToPrintableHtml(
    compareMeasurements(
      (qrows as any[]).filter((q) => q.run_id === runs[0].id),
      (qrows as any[]).filter((q) => q.run_id === runs[runs.length - 1].id),
      { businessName: audit.business_name },
    ),
    { businessName: audit.business_name, exportedAt: "2026-09-13T06:00:00Z", beforeMeasuredAt: runs[0].created_at, afterMeasuredAt: latest.created_at } as any,
  ),
};

const OLD_BLUES = new Set(["1a3d7c", "2a5aa8", "102a58", "eaf1fc", "e8eefb", "0f2547"]);
const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const pixelAt = (png: PNG, x: number, y: number) => { const i = (Math.round(y) * png.width + Math.round(x)) * 4; return hex(png.data[i], png.data[i + 1], png.data[i + 2]); };
const scan = (png: PNG) => {
  const counts: Record<string, number> = {}; let charcoal = 0, gold = 0, oldBlue = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const h = hex(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (OLD_BLUES.has(h)) { oldBlue++; counts[h] = (counts[h] ?? 0) + 1; }
    if (h === "101114" || h === "0a0b0d") charcoal++;
    if (h === "ffd13f") gold++;
  }
  return { charcoal, gold, oldBlue, counts };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
async function check(label: string, target: { html?: string; url?: string }, media: "screen" | "print") {
  const file = path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, "-")}-${media}`);
  if (target.html) fs.writeFileSync(file + ".html", target.html);
  await page.emulateMedia({ media });
  await page.goto(target.url ?? "file:///" + (file + ".html").replace(/\\/g, "/"), { waitUntil: "networkidle" });
  const shot = await page.screenshot({ fullPage: true });
  fs.writeFileSync(file + ".png", shot);
  const png = PNG.sync.read(shot);
  const box = async (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height } : null; }, sel);
  const sample = async (sel: string, dx: number, dy: number) => { const b = await box(sel); return b ? pixelAt(png, b.x + dx, b.y + dy) : "(absent)"; };
  const bodySel = (await box(".explainer")) ? ".explainer" : (await box(".wp-wrap")) ? ".wp-wrap" : (await box(".ba-wrap")) ? ".ba-wrap" : (await box(".pp-wrap")) ? ".pp-wrap" : ".sheet";
  const res = {
    band: await sample(".band", 6, 6), footer: await sample(".site-foot", 6, 6), cta: await sample(".cta", 6, 6),
    body: await sample(bodySel, 4, 2), startBtn: await sample(".cta-btn.start", 6, 6), wordmarkText: await page.evaluate(() => { const el = document.querySelector(".wordmark"); return el ? getComputedStyle(el).color : "(absent)"; }),
    videoBox: !!(await box(".vid video")), posterBox: !!(await box(".vid .vid-poster img")),
    ...scan(png),
  };
  console.log(`\n${label} [${media}] ${png.width}x${png.height}`);
  console.log(`  band ${res.band}  footer ${res.footer}  cta ${res.cta}  body ${res.body}  start-btn ${res.startBtn}  wordmark ${res.wordmarkText}`);
  console.log(`  video element visible: ${res.videoBox}  poster visible: ${res.posterBox}`);
  console.log(`  pixels — charcoal ${res.charcoal}  gold ${res.gold}  OLD BLUE ${res.oldBlue}${res.oldBlue ? " " + JSON.stringify(res.counts) : ""}`);
}
for (const [label, html] of Object.entries(docs)) {
  await check(label, { html }, "screen");
  if (label.startsWith("client-report") || label.startsWith("welcome") || label.startsWith("before/after")) await check(label + " PDF", { html }, "print");
}
if (LIVE) {
  await check("LIVE findable.live/report", { url: `https://findable.live/report/${AUDIT}` }, "screen");
  await check("LIVE findable.live/report PDF", { url: `https://findable.live/report/${AUDIT}` }, "print");
}
await browser.close();
console.log(`\nscreenshots in ${OUT}`);
