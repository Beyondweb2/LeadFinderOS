/* THROWAWAY, UNTRACKED (scripts/_*.ts is never staged). Read-only live harness for the presence engine:
   gathers the SAME free evidence directory-presence gathers (lead row, phone_cache, stored crawl, the
   homepage + contact page fetched now, this lead's audit citations, the trade citation fold) through the
   Management API SQL route, runs the real src/lib engine, prints the decision. Writes nothing. */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import {
  assemblePresence, buildIdentity, claimedCredentials, extractSiteSignals, foldClientCitations, mergePresence, presenceQueries, presenceSummary,
  tradeKeys, type CitationRow, type ListingCandidate,
} from "../src/lib/directoryPresence.ts";
import { sourceForUrl } from "../src/lib/presenceSources.ts";

const S = process.env.SCRATCH!;
function sql<T = any>(q: string): T[] {
  writeFileSync(`${S}/h.sql`, q);
  spawnSync("powershell", ["-NoProfile", "-File", `${S}/sql.ps1`, "-QueryFile", `${S}/h.sql`, "-OutFile", `${S}/h.json`], { encoding: "utf8" });
  const out = JSON.parse(readFileSync(`${S}/h.json`, "utf8"));
  if (!Array.isArray(out)) throw new Error(JSON.stringify(out).slice(0, 300));
  return out;
}
const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

async function fetchPage(url: string) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" } });
    clearTimeout(t);
    return { html: (await r.text()).slice(0, 1_000_000), finalUrl: r.url || url, status: r.status };
  } catch { return null; }
}

async function run(leadId: string) {
  const [lead] = sql(`select id, business_name, phone, website, address, derived_town, search_location, search_keyword, category, place_id, google_maps_url, facebook_url, facebook_method, instagram_url, instagram_method from outreach_leads where id = ${lit(leadId)}`);
  if (!lead) { console.log("no lead", leadId); return; }
  const [places] = lead.place_id ? sql(`select phone, website, address, category, google_maps_uri from phone_cache where place_id = ${lit(lead.place_id)}`) : [];
  const [crawl] = sql(`select result->'siteInfo'->'socialLinks' social, full_evidence->'business'->'profiles' profiles, full_evidence->'business'->'credentials' creds from lead_crawl_checks where lead_id = ${lit(leadId)}`);
  const audits = sql(`select id, business_type from ai_audits where lead_id = ${lit(leadId)} order by created_at desc`);
  const auditTrade = audits.find((a) => a.business_type)?.business_type ?? null;

  const website = String(lead.website ?? "").trim();
  const ownSite = website && sourceForUrl(website)?.source.kind === "other" ? (/^https?:/i.test(website) ? website : `https://${website}`) : "";
  const pages: Array<{ url: string; html: string }> = [];
  const home = ownSite ? await fetchPage(ownSite) : null;
  if (home?.html) {
    pages.push({ url: home.finalUrl, html: home.html });
    const host = new URL(home.finalUrl).hostname;
    const extra = extractSiteSignals(home.html, home.finalUrl).links.filter((u) => { try { const x = new URL(u); return x.hostname === host && /contact|about|find-us|reviews/i.test(x.pathname); } catch { return false; } }).slice(0, 2);
    for (const p of await Promise.all(extra.map(fetchPage))) if (p?.html) pages.push({ url: p.finalUrl, html: p.html });
  }
  const signals = pages.map((p) => extractSiteSignals(p.html, p.url));

  const identity = buildIdentity({ lead, auditTrade, places: places ?? null, site: { servedUrl: home?.html ? home.finalUrl : null, phones: signals.flatMap((s) => s.phones), postcodes: signals.flatMap((s) => s.postcodes) } });

  const rows: CitationRow[] = audits.length ? sql(`select question, (select jsonb_object_agg(k, jsonb_build_object('citations', v->'citations', 'competitors', v->'competitors')) from jsonb_each(result) e(k, v) where jsonb_typeof(v) = 'object' and k not like '\\_%') result from ai_audit_queue where status = 'done' and audit_id in (${audits.map((a) => lit(a.id)).join(",")})`) : [];

  const keys = tradeKeys(identity.trade);
  const cond = keys.includes("plumber") ? "business_type ilike '%plumb%'" : keys.includes("electrician") ? "business_type ilike '%electric%'" : keys.includes("accountant") ? "business_type ~* '(accountant|accountancy|bookkeep)'" : `lower(trim(business_type)) in (${keys.map(lit).join(",") || "''"})`;
  const tk = keys[0] ?? "";
  const ev = sql(`with a as (select id from ai_audits where ${cond}), c as (select a.id aid, lower(regexp_replace(split_part(split_part(regexp_replace(cit->>'url', '^https?://', ''), '/', 1), '?', 1), '^www\\.', '')) host from a join ai_audit_runs r on r.audit_id = a.id join ai_audit_queue q on q.run_id = r.id, jsonb_each(q.result) e(k, v), jsonb_array_elements(case when jsonb_typeof(v->'citations') = 'array' then v->'citations' else '[]'::jsonb end) cit where k not like '\\_%') select ${lit(tk)} trade, host, count(*)::int citations, count(distinct aid)::int audits from c where host <> '' group by host having count(distinct aid) >= 2`);
  const [tot] = sql(`select count(*)::int n from ai_audits where ${cond}`);

  const cands: ListingCandidate[] = [];
  for (const s of signals) for (const url of s.links) { const src = sourceForUrl(url); if (src && src.source.kind !== "other") cands.push({ url, via: "website", linkedFromSite: true }); }
  for (const l of crawl?.social ?? []) if (l?.url) cands.push({ url: l.url, via: "website", linkedFromSite: true });
  for (const p of crawl?.profiles ?? []) { const u = String(p?.value ?? "").match(/https?:\/\/\S+/)?.[0]; if (u) cands.push({ url: u, via: "website", linkedFromSite: true }); }
  if (lead.facebook_url) cands.push({ url: lead.facebook_url, via: "lead_record", operatorRecorded: lead.facebook_method === "manual" });
  if (lead.instagram_url) cands.push({ url: lead.instagram_url, via: "lead_record", operatorRecorded: lead.instagram_method === "manual" });
  if (lead.place_id) cands.push({ url: lead.google_maps_url || places?.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${lead.place_id}`, via: "places", placeIdMatch: true, details: places ?? null });

  const fold = foldClientCitations(rows, identity);
  const claimed = claimedCredentials([...signals.map((s) => s.text), ...(crawl?.creds ?? []).map((c: any) => String(c?.value ?? ""))].join(" | "));
  const { findings, review } = assemblePresence({ identity, candidates: cands, citations: fold, tradeEvidence: ev, tradeAuditTotals: { [tk]: tot?.n ?? 0 }, claimed, searched: false });
  const s = presenceSummary(leadId, mergePresence(leadId, [], findings, new Date().toISOString(), null), { finished_at: new Date().toISOString(), searched: false, review });

  console.log(`\n════ ${lead.business_name} — ${identity.town} — trade "${identity.trade}" (${keys.join("/")}), ${tot?.n ?? 0} trade audits`);
  console.log(`  site: ${home ? `${home.status} ${home.finalUrl}` : ownSite ? "UNREADABLE" : "none"} · pages ${pages.length} · site phones ${signals.flatMap((x) => x.phones).slice(0, 3).join(",") || "-"} · GBP ${places ? `${places.phone ?? "-"} ${places.website ?? "-"}` : lead.place_id ? "(no cache)" : "no place_id"}`);
  console.log(`  identity: domain=${identity.domain} aliases=${identity.domainAliases.join(",") || "-"} phones=${identity.phones.map((p) => `${p.value}[${p.from}]`).join(" ")} postcodes=${identity.postcodes.map((p) => p.value).join(",")} distinctiveName=${(await import("../src/lib/directoryPresence.ts")).nameIsDistinctive(identity)}`);
  console.log(`  own audits: ${audits.length} · citation rows ${rows.length} · questions ${fold.questionsCounted} · claimed ${claimed.map((c) => c.credential).join(", ") || "-"}`);
  console.log(`  search queries it WOULD run: ${presenceQueries(identity).join("  |  ")}`);
  console.log(`  COUNTS ${JSON.stringify(s.counts)}`);
  for (const [g, list] of [["ALREADY ON", s.already_on], ["NEEDS ATTENTION", s.needs_attention], ["WORTH ADDING", s.worth_adding]] as const) {
    console.log(`  ── ${g}`);
    for (const i of list) console.log(`     ${i.label} [${i.confidence ?? "-"}${i.priority ? ` · ${i.priority}` : ""}] ${i.listing_url ?? ""}\n        ${i.reason}${i.issues.length ? `\n        ISSUES: ${i.issues.map((x) => `${x.field}: ${x.note}${x.found ? ` (found ${x.found}${x.expected ? `; we hold ${x.expected}` : ""})` : ""}`).join(" / ")}` : ""}`);
  }
  if (s.review.length) console.log(`  ── REVIEW (never tasks): ${s.review.map((r) => `${r.source_key} (${r.client_questions}q)`).join(", ")}`);
}

for (const id of process.argv.slice(2)) await run(id);
