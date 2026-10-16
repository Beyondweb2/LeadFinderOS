/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GENERATES the V5 block of src/lib/clientAgreement.ts and scripts/fixtures/client-agreement-v5-source.txt
   FROM Paul's approved Findable_Client_Service_Agreement_v5_clean.docx (Jess approved 2026-10-16).
   Never type a clause: regenerate.

   Usage: node scripts/generate-client-agreement-v5.mjs <path-to-v5_clean.docx> [--write]
     without --write: prints the V5 block and the fixture's line count, changes nothing.
     with --write:    writes the fixture and replaces the text between the GENERATED V5 markers in
                      src/lib/clientAgreement.ts.

   The only things this script decides rather than reads:
     · `lead` (the bold run-in at the start of a clause in the HTML / PDF). The document carries no bold
       for these, so they are the same phrases v4 used plus v5's new "Current providers." (LEADS below).
       The canonical text is identical either way: blockText prints `num lead text`.
     · the client-details label KEYS (the labels themselves are the document's, in its order).
     · `signatures`, which is the PDF's signature page and not part of the document (reuses v4's).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docx = process.argv[2];
const write = process.argv.includes('--write');
if (!docx) throw new Error('usage: node scripts/generate-client-agreement-v5.mjs <docx> [--write]');
const sha = crypto.createHash('sha256').update(fs.readFileSync(docx)).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v5docx-'));
execFileSync('python', ['-c', 'import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', docx, tmp]);
const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function elements(src, tag) {
  const out = [];
  const re = new RegExp(`<(/?)w:${tag}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  let depth = 0, start = -1, m;
  while ((m = re.exec(src))) {
    const closing = m[1] === '/', selfClose = m[2] === '/';
    if (selfClose && !closing) { if (depth === 0) out.push(m[0]); continue; }
    if (!closing) { if (depth === 0) start = m.index; depth++; }
    else { depth--; if (depth === 0) out.push(src.slice(start, re.lastIndex)); }
  }
  return out;
}
/** A paragraph's text, tabs dropped (they are layout between a clause number and its text). */
function paraText(p) {
  let text = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(p))) text += unesc(m[1]);
  return text;
}

/* Top-level body children in order: a paragraph is a string, a table is rows of cells of paragraph strings. */
const body = xml.slice(xml.indexOf('<w:body>') + 8, xml.lastIndexOf('</w:body>'));
const blocks = [];
const re = /<w:(p|tbl)(?=[\s>/])/g;
let pos = 0;
while (pos < body.length) {
  re.lastIndex = pos;
  const m = re.exec(body);
  if (!m) break;
  const el = elements(body.slice(m.index), m[1])[0];
  pos = m.index + el.length;
  if (m[1] === 'p') blocks.push(paraText(el));
  else blocks.push(elements(el, 'tr').map((tr) => elements(tr, 'tc').map((tc) => elements(tc, 'p').map(paraText))));
}

/* ── The fixture: one line per paragraph / table-cell paragraph, the shape of the v4 fixture. ── */
const fixtureLines = [];
for (const b of blocks) {
  if (typeof b === 'string') fixtureLines.push(b);
  else for (const row of b) for (const cell of row) for (const p of cell) fixtureLines.push(p);
}
const fixture = '﻿' + fixtureLines.join('\n') + '\n';

/* ── The V5 block ── */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const paras = blocks.filter((b) => typeof b === 'string').map(norm).filter(Boolean);
const tables = blocks.filter((b) => typeof b !== 'string');
const cell = (c) => norm((c ?? []).join(' '));
const [findableT, clientT, serviceT, keysT, scheduleT] = tables;
if (!findableT || !clientT || !serviceT || !keysT || !scheduleT || tables.length !== 5) throw new Error(`expected 5 tables, found ${tables.length}`);

const intro = paras[3];
const findableDetails = findableT.slice(1).map((r) => [cell(r[0]), cell(r[1])]);
const clientLabels = clientT.slice(1).map((r) => cell(r[0]));
const LABEL_KEYS = ['businessName', 'legalName', 'contact', 'address', 'email', 'phone', 'website', 'currentProvider', 'freeToLeave'];
if (clientLabels.length !== LABEL_KEYS.length) throw new Error(`expected ${LABEL_KEYS.length} client-detail rows, found ${clientLabels.length}`);
const services = serviceT.slice(1).map((r) => ({ name: cell(r[0]), description: cell(r[1]) }));
if (services.length !== 1 || services[0].name !== 'Findable Build') throw new Error('v5 offers exactly one service, Findable Build');
const keyPoints = keysT.slice(1).map((r) => cell(r[0]).replace(/^•\s*/, ''));

const LEADS = ['Current providers.', 'Baseline.', 'Re-measurement.', 'The guarantee.', 'Payment Start Date.', 'Previous developers and agencies.', 'Your Materials stay yours.', 'Existing websites.'];
const start = paras.findIndex((p) => p === '1. ABOUT THIS AGREEMENT');
const end = paras.findIndex((p) => p.startsWith('SCHEDULE 1'));
const bodyBlocks = paras.slice(start, end).map((p) => {
  const c = p.match(/^(\d+A?\.\d+)\s+([\s\S]*)$/);
  if (!c) {
    if (!/^\d+A?\.\s/.test(p)) throw new Error(`neither a heading nor a clause: "${p.slice(0, 60)}"`);
    return { kind: 'heading', text: p };
  }
  const lead = LEADS.find((l) => c[2].startsWith(l + ' '));
  return lead ? { kind: 'clause', num: c[1], lead, text: c[2].slice(lead.length + 1) } : { kind: 'clause', num: c[1], text: c[2] };
});
const usedLeads = bodyBlocks.filter((b) => b.lead).map((b) => b.lead);
for (const l of LEADS) if (!usedLeads.includes(l)) throw new Error(`lead "${l}" not found in any clause`);
const scheduleTitle = paras[end];
const scheduleColumns = scheduleT[0].slice(1).map(cell);
const scheduleRows = scheduleT.slice(1).map((r) => r.map(cell));

const q = (s) => JSON.stringify(s);
const lines = [];
lines.push(`/* ⛔ GENERATED V5 START — scripts/generate-client-agreement-v5.mjs from Findable_Client_Service_Agreement_v5_clean.docx`);
lines.push(`   (sha256 ${sha}; Jess approved 2026-10-16). Do not edit a word: a change is a NEW version (v6), regenerated.`);
lines.push(`   v5 vs v4: ONE plan, Findable Build (Optimise is gone); the website transfers to the client after payment 12 and`);
lines.push(`   the £29.99 Hosting and Maintenance stays a separate opt-in (9A), with a reminder before payment 12 (9A.5); the`);
lines.push(`   re-measurement is four weeks only (5.3); clause 1.6: before accepting, the client confirms any current provider`);
lines.push(`   and that they are free to leave it; a client tied into a contract they cannot leave is not taken on. */`);
lines.push(`const V5: AgreementVersion = {`);
lines.push(`  version: 'v5',`);
lines.push(`  intro: ${q(intro)},`);
lines.push(`  findableDetails: [${findableDetails.map(([k, v]) => `[${q(k)}, ${q(v)}]`).join(', ')}],`);
lines.push(`  clientDetailLabels: {`);
lines.push(LABEL_KEYS.map((k, i) => `    ${k}: ${q(clientLabels[i])},`).join('\n'));
lines.push(`  },`);
lines.push(`  sectionTitles: { findable: ${q(cell(findableT[0][0]))}, client: ${q(cell(clientT[0][0]))}, service: ${q(cell(serviceT[0][0]))} },`);
lines.push(`  services: {`);
lines.push(`    build: { name: ${q(services[0].name)}, description: ${q(services[0].description)} },`);
lines.push(`  },`);
lines.push(`  keyPoints: {`);
lines.push(`    title: ${q(cell(keysT[0][0]))},`);
lines.push(`    points: [`);
for (const k of keyPoints) lines.push(`      ${q(k)},`);
lines.push(`    ],`);
lines.push(`  },`);
lines.push(`  body: [`);
for (const b of bodyBlocks) {
  if (b.kind === 'heading') lines.push(`    { kind: 'heading', text: ${q(b.text)} },`);
  else lines.push(`    { kind: 'clause', num: ${q(b.num)}, ${b.lead ? `lead: ${q(b.lead)}, ` : ''}text: ${q(b.text)} },`);
}
lines.push(`  ],`);
lines.push(`  schedule: {`);
lines.push(`    title: ${q(scheduleTitle)},`);
lines.push(`    columns: [${scheduleColumns.map(q).join(', ')}],`);
lines.push(`    rows: [`);
for (const r of scheduleRows) lines.push(`      [${r.map(q).join(', ')}],`);
lines.push(`    ],`);
lines.push(`  },`);
lines.push(`  /* The PDF's signature page only, not part of the agreed text: v5 is accepted the same way as v4 (clause 1.2). */`);
lines.push(`  signatures: V4.signatures,`);
lines.push(`};`);
lines.push(`/* ⛔ GENERATED V5 END */`);
const block = lines.join('\n');

if (!write) {
  console.log(block);
  console.log(`\n${fixtureLines.length} fixture lines, ${bodyBlocks.length} body blocks, sha ${sha}`);
} else {
  fs.writeFileSync(path.join(ROOT, 'scripts', 'fixtures', 'client-agreement-v5-source.txt'), fixture, 'utf8');
  const file = path.join(ROOT, 'src', 'lib', 'clientAgreement.ts');
  const src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf('/* ⛔ GENERATED V5 START');
  const z = src.indexOf('/* ⛔ GENERATED V5 END */');
  if (a < 0 || z < 0) throw new Error('GENERATED V5 markers not found in clientAgreement.ts');
  fs.writeFileSync(file, src.slice(0, a) + block + src.slice(z + '/* ⛔ GENERATED V5 END */'.length), 'utf8');
  console.log(`wrote fixture (${fixtureLines.length} lines) and the V5 block (${bodyBlocks.length} body blocks), sha ${sha}`);
}
