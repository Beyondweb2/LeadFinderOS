/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID CLIENT AUTO-INTAKE — THE REAL RUN, AGAINST AN IN-MEMORY DATABASE (2026-10-06,
   docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md).

   Runs supabase/functions/_shared/client-intake.ts runClientIntake — the exact code the worker runs — on a
   small stand-in for supabase-js that keeps rows in memory and enforces the migration's unique rules
   (client_intake primary key, one 'intake ready' History line, one notification per dedupe key). The crawl
   request to crawl-check is answered by a fake fetch that records every call.
   Proves: a run is claimed once (a second tick inside the lease does nothing) · waiting on a crawl is not an
   attempt and never starts a second crawl · a finished crawl is merged and the intake completes · ONE History
   line and ONE notification however many times it finishes · no website → no crawl, still completes · the
   crawl failing (website down) → carries on · a source read failing → carries on · auto-fill writes a blank
   lead field from the handoff and never a website guess · an ended / refunded client is not researched ·
   the attempt cap stops a retry loop · nothing is sent (the only request is crawl-check).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
let failures = 0;
const ok = (c: unknown, label: string) => { if (!c) failures++; console.log(`${c ? "PASS" : "FAIL"} ${label}`); };

/* ── Deno and fetch stand-ins (the module reads env and calls crawl-check) ── */
(globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => ({ SUPABASE_URL: "https://fake.supabase.co", CRON_SECRET: "secret", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon" } as Record<string, string>)[k] } };
const requests: { url: string; body: Record<string, unknown> }[] = [];
let crawlAnswer: () => { status: number; body: Record<string, unknown> } = () => ({ status: 200, body: { ok: true, mode: "full", job_id: "job-1", status: "running" } });
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}");
  requests.push({ url: String(url), body });
  const a = crawlAnswer();
  if (a.status === 200 && a.body.job_id) db.crawl_jobs.push({ id: a.body.job_id, lead_id: body.lead_id, status: "running", started_at: new Date(clock).toISOString() });
  return { ok: a.status < 400, status: a.status, json: async () => a.body } as unknown as Response;
}) as typeof fetch;

/* ── The in-memory database ── */
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const table = (t: string) => (db[t] ??= []);
const failTables = new Set<string>();
let clock = Date.parse("2026-10-06T12:00:00Z");

function getPath(row: Row, path: string): unknown {
  const parts = path.split(/->>?/);
  let v: unknown = row[parts[0]];
  for (const p of parts.slice(1)) v = v && typeof v === "object" ? (v as Row)[p] : undefined;
  return v;
}
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let cur = ""; let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function cond(row: Row, c: string): boolean {
  if (c.startsWith("and(")) return splitTop(c.slice(4, -1)).every((x) => cond(row, x));
  const m = c.match(/^([a-z_]+(?:->>?[a-z_]+)*)\.(eq|neq|is|in|lt|gt|gte|lte)\.(.*)$/);
  if (!m) throw new Error("fake db: cannot read filter " + c);
  const [, col, op, rawV] = m; const v = rawV.replace(/^"|"$/g, ""); const val = getPath(row, col);
  if (op === "is") return v === "null" ? val == null : String(val) === v;
  if (op === "eq") return v === "{}" ? Array.isArray(val) && val.length === 0 : String(val ?? "") === v && val != null || (v === "" && val === "");
  if (op === "neq") return String(val) !== v;
  if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").includes(String(val));
  const a = typeof val === "string" ? Date.parse(val) || Number(val) : Number(val); const b = Date.parse(v) || Number(v);
  return op === "lt" ? a < b : op === "gt" ? a > b : op === "gte" ? a >= b : a <= b;
}
class Q {
  filters: ((r: Row) => boolean)[] = []; op: "select" | "update" | "insert" | "upsert" = "select"; patch: any = null; cols = "*"; lim = Infinity; single = false; returning = false; orderBy: [string, boolean] | null = null; conflict = "";
  constructor(public t: string) {}
  select(c = "*") { if (this.op === "select") this.cols = c; else this.returning = true; return this; }
  update(p: Row) { this.op = "update"; this.patch = p; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.patch = p; return this; }
  upsert(p: Row, o?: { onConflict?: string }) { this.op = "upsert"; this.patch = p; this.conflict = o?.onConflict ?? "id"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => String(getPath(r, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => String(getPath(r, c)) !== String(v)); return this; }
  is(c: string, v: null) { this.filters.push((r) => (v === null ? getPath(r, c) == null : getPath(r, c) === v)); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.map(String).includes(String(getPath(r, c)))); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => Number(getPath(r, c)) > Number(v)); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => String(getPath(r, c)) >= String(v)); return this; }
  or(s: string) { const cs = splitTop(s); this.filters.push((r) => cs.some((c) => cond(r, c))); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orderBy = [c, o?.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.lim = b - a + 1; return this; }
  maybeSingle() { this.single = true; return this; }
  then<T>(res: (v: { data: any; error: any }) => T, rej?: (e: unknown) => T) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  project(r: Row): Row {
    const out: Row = { ...r };
    for (const item of this.cols.split(",")) { const m = item.trim().match(/^([a-z_]+):(.+)$/); if (m) out[m[1]] = getPath(r, m[2]); }
    return out;
  }
  exec(): { data: any; error: any } {
    if (failTables.has(this.t)) return { data: null, error: { message: `relation ${this.t} unavailable (test)` } };
    const rows = table(this.t);
    if (this.op === "insert") {
      for (const p of Array.isArray(this.patch) ? this.patch : [this.patch]) {
        const dup = uniqueClash(this.t, p, rows);
        if (dup) return { data: null, error: { code: "23505", message: "duplicate key" } };
        rows.push({ id: p.id ?? `${this.t}-${rows.length + 1}`, created_at: new Date(clock).toISOString(), ...p });
      }
      return { data: null, error: null };
    }
    if (this.op === "upsert") {
      const keys = this.conflict.split(",");
      const hit = rows.find((r) => keys.every((k) => String(r[k]) === String(this.patch[k])));
      if (hit) Object.assign(hit, this.patch); else rows.push({ ...this.patch });
      return { data: null, error: null };
    }
    let hits = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of hits) Object.assign(r, JSON.parse(JSON.stringify(this.patch)));
      return { data: this.returning ? hits.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.orderBy) { const [c, asc] = this.orderBy; hits = [...hits].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? -1 : 1) * (asc ? 1 : -1)); }
    hits = hits.slice(0, this.lim).map((r) => this.project(r));
    return { data: this.single ? hits[0] ?? null : hits, error: null };
  }
}
function uniqueClash(t: string, p: Row, rows: Row[]): boolean {
  if (t === "lead_activity" && p.kind === "client_intake" && p.data?.event === "ready") return rows.some((r) => r.lead_id === p.lead_id && r.kind === "client_intake" && r.data?.event === "ready");
  if (t === "lead_activity" && p.kind === "handoff_sent") return rows.some((r) => r.lead_id === p.lead_id && r.kind === "handoff_sent");
  if (t === "client_intake") return rows.some((r) => r.lead_id === p.lead_id);
  return false;
}
const service = {
  from: (t: string) => new Q(t),
  rpc: async (name: string, args: Row) => {
    if (name === "notify_person") {
      const n = table("notifications");
      if (!n.some((x) => x.user_id === args._user && x.dedupe_key === args._dedupe)) n.push({ user_id: args._user, kind: args._kind, title: args._title, body: args._body, link: args._link, dedupe_key: args._dedupe });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  },
};

const { runClientIntake, queueIntake } = await import("../supabase/functions/_shared/client-intake.ts");
const iso = (ms: number) => new Date(ms).toISOString();
const PAUL = "00000000-0000-4000-8000-0000000000aa";
table("team_members").push({ user_id: PAUL, is_book_owner: true, display_name: "Paul", status: "active" });
function client(id: string, extra: Row = {}): void {
  table("outreach_leads").push({ id, user_id: PAUL, business_name: `ZZ Intake ${id}`, phone: "07700 900111", email: null, website: "https://intake-test.example", amount_paid: 99, status: "payment_received",
    payment_date: "2026-10-06", place_id: null, services_included: [], service_areas: ["Rugby"], website_control: null, sales_handoff: { site_situation: "client", decision_maker_name: "Sam", saved_at: iso(clock) },
    sold_by_user_id: PAUL, contract_total_payments: 12, service_terminated_at: null, ...extra });
  /* What the paid trigger inserts. */
  table("client_intake").push({ lead_id: id, status: "queued", trigger_source: "payment", queued_at: iso(clock), attempts: 0, lease_until: null, crawl_job_id: null, crawl_started_at: null, steps: [], summary: null, overrides: {}, ready_notified_at: null });
}
const intake = (id: string) => table("client_intake").find((r) => r.lead_id === id)!;
const lead = (id: string) => table("outreach_leads").find((r) => r.id === id)!;
const history = (id: string, kind: string) => table("lead_activity").filter((r) => r.lead_id === id && r.kind === kind);
const notices = (id: string) => table("notifications").filter((n) => String(n.dedupe_key).endsWith(id));

/* ═══ A. The full path: crawl started once, waited on, merged, announced once ═════════════════════ */
console.log("── A. a paid client with a website and no crawl ──");
/* Optimise (6 payments): who controls their website IS a needed item, so the handoff's answer can fill it.
   (On Build it is not needed — and then nothing is filled, which is also right.) */
client("A", { contract_total_payments: 6 });
let r = await runClientIntake(service, "A", clock);
ok(r.ran && r.status === "crawling" && intake("A").crawl_job_id === "job-1", "first run: gathers what we have and starts ONE full crawl (status Crawling website)");
ok(requests.length === 1 && /\/functions\/v1\/crawl-check$/.test(requests[0].url) && requests[0].body.requested_from === "client_intake" && requests[0].body.mode === "full" && !requests[0].body.url, "…through crawl-check's intake door, naming only the lead (never a URL)");
ok(lead("A").website_control === "client_controls" && history("A", "details_set").some((h) => h.data?.auto_intake === true && h.data?.from === "handoff"), "auto-fill: the handoff's 'client controls the website' was written to the blank lead field (no click needed)");
ok((lead("A").services_included ?? []).length === 0, "…and nothing was guessed from the website");
r = await runClientIntake(service, "A", clock + 1000);
ok(!r.ran && requests.length === 1, "a second tick inside the lease does nothing (claimed once — duplicate webhook / refresh / retry)");
clock += 2 * 60_000;
r = await runClientIntake(service, "A", clock);
ok(r.ran && r.status === "crawling" && requests.length === 1 && intake("A").attempts === 1, "while the crawl runs: polled, still Crawling, NO second crawl, and the wait is not an attempt");
/* The crawl finishes: the worker wrote the lead's one crawl row. */
table("crawl_jobs").find((j) => j.id === "job-1")!.status = "complete";
table("lead_crawl_checks").push({ lead_id: "A", url: "https://intake-test.example/", created_at: iso(clock), mode: "full", job_id: "job-1",
  result: { siteInfo: { phone: "01234 567890", towns: ["Rugby", "Daventry"], services: ["Boiler repair"] } }, full_evidence: { completeness: "complete", business: { credentials: [{ value: "Gas Safe — 1", url: "https://intake-test.example/about" }] }, stats: { pagesOk: 12, urlsDiscovered: 14 } } });
clock += 2 * 60_000;
r = await runClientIntake(service, "A", clock);
ok(r.ran && (r.status === "ready" || r.status === "needs_attention") && intake("A").finished_at, "the finished crawl is reused and merged — the intake completes");
ok(history("A", "client_intake").length === 1 && notices("A").length === 1 && notices("A")[0].link === "/paid-clients/A", "ONE 'intake complete' History line and ONE notification to Paul, linking to the client");
ok(r.ran && r.summary!.conflicts.includes("Phone") && r.summary!.conflicts.includes("Service areas"), "the website's different phone and extra town are flagged for review, not silently merged");
await queueIntake(service, "A", "rerun");
r = await runClientIntake(service, "A", clock + 1000);
ok(r.ran && requests.length === 1, "Refresh research: the fresh full crawl is reused — no second crawl");
ok(history("A", "client_intake").length === 1 && notices("A").length === 1, "…and no second History line or notification (no spam)");

/* ═══ B. No website ════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── B. no website ──");
client("B", { website: null });
r = await runClientIntake(service, "B", clock);
ok(r.ran && r.status !== "crawling" && requests.length === 1, "no website → no crawl; the intake completes on everything else");
ok(intake("B").steps.some((s: Row) => s.key === "crawl" && s.status === "not_needed"), "…the crawl step says 'not needed', never failed");

/* ═══ C. The website is down / the crawl cannot start ════════════════════════════════════════════ */
console.log("\n── C. crawl fails ──");
crawlAnswer = () => ({ status: 500, body: { ok: false, error: "fetch failed" } });
client("C", { website: "https://down.example" });
r = await runClientIntake(service, "C", clock);
ok(r.ran && r.status !== "crawling" && intake("C").steps.some((s: Row) => s.key === "crawl" && s.status === "failed"), "the crawl could not start → that step is failed, the intake still finishes");
crawlAnswer = () => ({ status: 200, body: { ok: true, mode: "full", job_id: "job-2", status: "running" } });

/* ═══ D. One source unreadable ═══════════════════════════════════════════════════════════════════ */
console.log("\n── D. a source read fails ──");
failTables.add("client_agreement_acceptances");
client("D", { website: null });
r = await runClientIntake(service, "D", clock);
ok(r.ran && r.status !== "queued" && intake("D").steps.some((s: Row) => s.key === "agreement" && s.status === "failed"), "the agreement table failing marks that one step — every other source is still merged");
failTables.delete("client_agreement_acceptances");

/* ═══ E. Not researched: refunded / ended ═════════════════════════════════════════════════════════ */
console.log("\n── E. closed clients ──");
client("E", { status: "refunded" });
const before = requests.length;
r = await runClientIntake(service, "E", clock);
ok(r.ran && r.status === "needs_attention" && requests.length === before && /Not a paid client|ended/.test(intake("E").error), "a refunded client is not researched (no crawl), and says why");
client("F", { service_terminated_at: iso(clock) });
r = await runClientIntake(service, "F", clock);
ok(r.ran && r.status === "needs_attention" && /ended/.test(intake("F").error), "an ended client is not researched");

/* ═══ F. The attempt cap ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n── F. retry cap ──");
client("G", { website: null });
intake("G").attempts = 8;
r = await runClientIntake(service, "G", clock);
ok(r.ran && r.status === "needs_attention" && /repeated attempts/.test(intake("G").error), "after the attempt cap it stops and asks for Paul — never a runaway loop");

/* ═══ G. Nothing sent ═════════════════════════════════════════════════════════════════════════════ */
console.log("\n── G. nothing sent ──");
ok(requests.every((q) => /\/functions\/v1\/crawl-check$/.test(q.url)), "every outward request was crawl-check (no WhatsApp, no email, no paid API)");
ok(table("notifications").every((n) => n.user_id === PAUL), "every notification went to Paul — none to a client");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall passed");
if (failures) process.exit(1);
