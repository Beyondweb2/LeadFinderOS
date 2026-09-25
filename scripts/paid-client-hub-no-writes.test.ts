/* ============================================================
   THE PAID CLIENT HUB SPENDS NOTHING AND MEASURES NOTHING.

   Opening a Paid Client, building a Welcome Pack and copying the rebuild prompt are all READS. This
   pins that at source, because the failure mode is expensive and silent: the incident that produced
   auditKind.ts was ONE PAYMENT creating TEN paid baselines, ~£3.70 of Apify, on a loop nobody saw.
   A hub action that quietly created an audit would be the same shape of bug.

   Run: npx tsx scripts/paid-client-hub-no-writes.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const hub = read('supabase/functions/paid-client-hub/index.ts');
const clientHub = read('src/pages/ClientHub.tsx');

/** The body of one `if (action === "x") { … }` block, by brace matching. */
function actionBlock(src: string, action: string): string {
  const start = src.indexOf(`if (action === "${action}")`);
  if (start < 0) throw new Error(`action ${action} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces in ${action}`);
}

console.log('\n── 24. OPENING A PAID CLIENT CREATES NOTHING ──');
{
  const get = actionBlock(hub, 'get');
  ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(get), '24. the `get` action performs no write');
  ok(!/create-ai-audit|paid-baseline|process-ai-audit-queue/.test(get), '24. and invokes no audit function');
  ok(/baseline_audit_id/.test(get), 'it reads only the audit the lead already points at');
  ok(!/order\("created_at".*limit\(1\)[\s\S]*ai_audits/.test(get), '24. it never resolves "the newest audit"');
}

console.log('\n── 25. BUILDING THE WELCOME PACK RUNS NO AUDIT ──');
{
  const pack = actionBlock(hub, 'welcome_pack_html');
  ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(pack), '25. no write');
  ok(!/create-ai-audit|run-seo-scan|extract-competitors|functions\.invoke/.test(pack), '25. no audit is run');
  ok(/renderWelcomePack\(/.test(pack), 'it only renders');
}

console.log('\n── 26. COPYING THE REBUILD PROMPT RUNS NO AUDIT ──');
{
  const ctx = actionBlock(hub, 'rebuild_context');
  ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(ctx), '26. no write');
  ok(!/create-ai-audit|run-seo-scan|crawl-check|functions\.invoke/.test(ctx), '26. no audit and no crawl is run');
  ok(/lead_crawl_checks/.test(ctx) && /\.select\(/.test(ctx), '26. the stored crawl is READ, not re-run');
}

console.log('\n── 27. DISCOVERY IS UNTOUCHED ──');
{
  const ctx = actionBlock(hub, 'rebuild_context');
  ok(/eq\("audit_purpose", "discovery"\)/.test(ctx), 'Discovery is read by purpose, deliberately');
  ok(!/update[\s\S]{0,120}discovery/i.test(ctx), '27. and never written');
  const rebuild = read('src/lib/rebuildContext.ts');
  ok(/discoveryAudit: p\.discovery_audit/.test(rebuild), 'Discovery is passed ONLY as a fact source');
  ok(!/buildBaselineSummary\([^)]*discovery/i.test(rebuild), '27. its measurement is never read as a baseline');
}

console.log('\n── THE ONLY WRITE IS THE WEBSITE-BUILD SAVE, AND IT TOUCHES ONE COLUMN ──');
{
  const save = actionBlock(hub, 'save_website_build');
  const updates = save.match(/\.update\(\{[^}]*\}\)/g) ?? [];
  ok(updates.length === 1, `exactly one update (got ${updates.length})`);
  ok(/\.update\(\{ website_build: patch \}\)/.test(save), 'and it sets website_build and nothing else');
  ok(/eq\("user_id", user\.id\)/.test(save), 'scoped to the operator’s own row');
  ok(/normaliseWebsiteBuild/.test(save), 'the saved shape is an allowlist, not whatever was posted');
}

console.log('\n── 28. THE EXISTING PUBLIC REPORT ROUTES ARE UNCHANGED ──');
{
  const reportFn = read('supabase/functions/render-audit-report/index.ts');
  ok(/isShortCode\(slug\)/.test(reportFn), '/r/<code> still resolves on short_code');
  ok(/UUID_RE\.test\(slug\)/.test(reportFn), '/report/<uuid> still resolves directly');
  ok(/auditCodeFromSlug/.test(reportFn), 'the legacy name+8-hex slug still resolves');
  /* CRLF working tree, LF repo (CLAUDE.md §0) — match on whitespace, not on a bare \n. */
  const cfg = read('supabase/config.toml');
  ok(/\[functions\.render-audit-report\]\s+verify_jwt = false/.test(cfg), 'render-audit-report is still public');
  ok(/\[functions\.render-welcome-pack\]\s+verify_jwt = false/.test(cfg),
    'and the new function has its config.toml entry in the same commit');
}

console.log('\n── SECTION 5 KEEPS WHAT IT HAD ──');
ok(/Planned pages/.test(clientHub), 'the planned-pages list is still in Section 5');
ok(/to="\/page-generator"/.test(clientHub), 'the page generator link is still in Section 5');
{
  /* Both must sit INSIDE the Website Build stage, not merely somewhere on the page. */
  const start = clientHub.indexOf('function WebsiteBuildStage');
  const end = clientHub.indexOf('export default function ClientHub');
  const stage = clientHub.slice(start, end);
  ok(start > -1 && stage.includes('Planned pages'), 'planned pages render inside WebsiteBuildStage');
  ok(stage.includes('/page-generator'), 'the page generator link renders inside WebsiteBuildStage');
  ok(stage.includes('/website-build'), 'alongside the link to the Website Build command centre');
}
ok(/<Stage title="5\. Website Build">/.test(clientHub), 'Section 5 is titled Website Build');

console.log('\n── THE PROMPTS ARE NEVER STORED ──');
const websiteBuild = read('src/pages/WebsiteBuild.tsx');
ok(!/from "[^"]*(buildPack|stagePrompts)|buildPack\(|stagePrompts\(|buildRebuildPrompt/.test(hub), 'the server never imports or calls a prompt builder (Build Pack or stage prompts)');
ok(!/rebuild_prompt|prompt_text|master_prompt/.test(hub), 'and there is no column for a stored prompt');
ok(/buildPack\(packInput\)/.test(websiteBuild) && /stagePrompts\(packInput\)/.test(websiteBuild), 'the Build Pack and the stage prompts are assembled in the browser from the loaded records');
ok(/action: 'rebuild_context'/.test(websiteBuild), 'from a fresh rebuild_context read when the page opens');
ok(!/setInterval/.test(websiteBuild), 'and the page never polls');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
