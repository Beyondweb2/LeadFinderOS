/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE GRAPH — read a client's stored page graph + its live citation state, from data that already
   exists. Stage 1 of the page-decision database (RECON_PAGEDB.md): proves the store + the
   measurement link + the hub/spoke spine, spending nothing (no OpenAI, no Apify).

   Joins client_pages -> client_page_questions -> ai_audit_queue on the VERBATIM question text
   (baseline_audit_id = audit_id AND question_text = question), reading result[engine].named per run.
   Named-rate per engine per page = named answers / total answers across all baseline runs.

   Run (service-role key from the linked Supabase CLI, never pasted):
     SRV=$(npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json \
       | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(x=>x.name==='service_role').api_key))")
     SRV=$SRV node scripts/page-graph.mjs [lead_id]
   Defaults to RG Locksmiths' lead.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const KEY = process.env.SRV;
const BASE = 'https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1';
const LEAD = process.argv[2] || '800425fe-00cc-46bf-a281-df57de6f8d4e';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => { const r = await fetch(`${BASE}/${p}`, { headers: h }); if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`); return r.json(); };
const enc = (v) => encodeURIComponent(v);

const pages = await get(`client_pages?lead_id=eq.${LEAD}&select=id,page_type,service,town,slug,status,primary_question,parent_page_id,baseline_audit_id&order=parent_page_id.asc.nullsfirst,created_at.asc`);
if (!pages.length) { console.log('No client_pages rows for this lead. Run the capture first.'); process.exit(0); }

const slugById = new Map(pages.map((p) => [p.id, p.slug]));
const links = await get(`client_page_questions?page_id=in.(${pages.map((p) => p.id).join(',')})&select=page_id,question_text,baseline_audit_id,role`);
const qByPage = new Map();
for (const l of links) { if (!qByPage.has(l.page_id)) qByPage.set(l.page_id, []); qByPage.get(l.page_id).push(l); }

// Pull every queue answer for this lead's baseline audits, keyed by exact question text.
const auditIds = [...new Set(pages.map((p) => p.baseline_audit_id).filter(Boolean))];
const queue = auditIds.length
  ? await get(`ai_audit_queue?audit_id=in.(${auditIds.join(',')})&select=audit_id,question,result,created_at`)
  : [];
const answersByKey = new Map(); // `${audit_id}::${question}` -> [{named per engine}]
for (const row of queue) {
  const key = `${row.audit_id}::${String(row.question ?? '').trim()}`;
  if (!answersByKey.has(key)) answersByKey.set(key, []);
  answersByKey.get(key).push(row.result ?? {});
}

const ENGINES = ['gemini', 'chatgpt'];
const rateForPage = (page) => {
  const totals = { gemini: [0, 0], chatgpt: [0, 0] }; // [named, total]
  for (const l of (qByPage.get(page.id) ?? [])) {
    const answers = answersByKey.get(`${l.baseline_audit_id}::${l.question_text.trim()}`) ?? [];
    for (const a of answers) {
      for (const e of ENGINES) {
        if (a && Object.prototype.hasOwnProperty.call(a, e)) {
          totals[e][1] += 1;
          if (a[e]?.named === true) totals[e][0] += 1;
        }
      }
    }
  }
  return totals;
};

const fmt = ([n, t]) => (t === 0 ? 'n/a' : `${n}/${t}`);

console.log(`\n═══ PAGE GRAPH — lead ${LEAD} ═══`);
console.log(`${pages.length} pages\n`);
for (const p of pages) {
  const isHub = p.parent_page_id == null;
  const hubLabel = isHub ? 'HUB' : `spoke → ${slugById.get(p.parent_page_id) ?? p.parent_page_id}`;
  const r = rateForPage(p);
  const qs = qByPage.get(p.id) ?? [];
  console.log(`${isHub ? '◆' : '  ·'} [${p.slug}]  type=${p.page_type}  status=${p.status}  (${hubLabel})`);
  console.log(`     service=${JSON.stringify(p.service)}  town=${JSON.stringify(p.town)}  intent="${p.primary_question}"`);
  console.log(`     Gemini named: ${fmt(r.gemini)}   ChatGPT named: ${fmt(r.chatgpt)}   (across ${qs.length} measured question(s) × baseline runs)`);
  for (const l of qs) console.log(`        • "${l.question_text}"`);
}
console.log('\n(named-rate = named answers / total answers across all baseline runs, per engine)');
