/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AGREEMENT PARITY — LeadFinderOS's SIGNING copy of each published Client Service Agreement must equal
   findable.live's PUBLIC copy of it, word for word (2026-10-05; v4 added 2026-10-06).

     v3 — LeadFinderOS src/lib/clientAgreement.ts V3  ↔  findable-site src/lib/clientAgreementV3.ts
          (/agreement/v3 since v4). Both generated from the same .docx (sha256 d0ede629…).
     v4 — LeadFinderOS V3 + V4_AMENDMENTS             ↔  findable-site src/lib/clientAgreementV4.ts
          (/agreement). No .docx of its own: the site names v3's .docx as its BASE source.
   Two copies drift unless something compares them, so the integration session MUST run this before
   deploying either repo, and after any change to either.

   Compares the AGREEMENT CONTENT — the intro, the two service descriptions, the key points, every clause
   (1.1 … 16.7, 9A / 9B, lettered items included) and Schedule 1 — paragraph by paragraph after normalising
   only whitespace and bullet/tick glyphs (layout, not words).

   Run (not part of the gate — it reads the other repo):
     npx tsx scripts/check-agreement-parity.ts                       (findable-site working tree)
     FINDABLE_SITE_DIR=C:/Users/paulj/findable-site-wt/<branch> npx tsx scripts/check-agreement-parity.ts
     npx tsx scripts/check-agreement-parity.ts --site-ref origin/<branch>
   Exit 0 = identical; 1 = drift (listed); 2 = a site copy could not be read.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { agreementVersion, blockText } from '../src/lib/clientAgreement.ts';

const SOURCE_DOCX_SHA256 = 'd0ede62911bfea105b7ce4e3ec48509444219438211c657390e3cb5db1164e72';
const root = path.resolve(import.meta.dirname, '..');
const siteDir = process.env.FINDABLE_SITE_DIR
  ?? [path.resolve(root, '../findable-site-current'), path.resolve(root, '../../findable-site-current'), 'C:/Users/paulj/findable-site-current'].find((p) => existsSync(p));
const refArg = process.argv.indexOf('--site-ref');
const ref = refArg > 0 ? process.argv[refArg + 1] : null;

/** Each published version and the site file that carries its public copy. */
const PAIRS: ReadonlyArray<{ version: string; siteFile: string }> = [
  { version: 'v3', siteFile: 'src/lib/clientAgreementV3.ts' },
  { version: 'v4', siteFile: 'src/lib/clientAgreementV4.ts' },
];

type Run = readonly [string, boolean];
/** A table row is cells; a cell is paragraphs; a paragraph is runs (the site keeps the .docx nesting). */
type Block = { k: 'p'; runs: readonly Run[] } | { k: 'table'; rows: readonly (readonly (readonly (readonly Run[])[])[])[] };

async function loadSite(rel: string): Promise<{ blocks: Block[]; sourceSha: string; version: string }> {
  if (!siteDir) throw new Error('findable-site checkout not found (set FINDABLE_SITE_DIR)');
  let file = path.join(siteDir, rel);
  if (ref) {
    const text = execFileSync('git', ['-C', siteDir, 'show', `${ref}:${rel}`], { encoding: 'utf8', maxBuffer: 50_000_000 });
    file = path.join(mkdtempSync(path.join(os.tmpdir(), 'agree-parity-')), path.basename(rel));
    writeFileSync(file, text, 'utf8');
  }
  if (!existsSync(file)) throw new Error(`no ${file} — is the right findable-site branch checked out? Use FINDABLE_SITE_DIR or --site-ref.`);
  const m = await import(pathToFileURL(file).href);
  return { blocks: m.AGREEMENT_BLOCKS as Block[], sourceSha: m.AGREEMENT_BASE_SOURCE_SHA256 ?? m.AGREEMENT_SOURCE_SHA256, version: m.AGREEMENT_VERSION };
}

/** Whitespace and the docx's layout glyphs (☐ tick boxes, • bullets, tabs) are layout, not words. */
const norm = (s: string) => s.replace(/[☐•]/g, ' ').replace(/\s+/g, ' ').trim();

/** The site's paragraphs, in document order: each paragraph, and each table cell as its own paragraph. */
function siteParagraphs(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k === 'p') out.push(norm(b.runs.map((r) => r[0]).join('')));
    else for (const row of b.rows) for (const cell of row) for (const para of cell) out.push(norm(para.map((r) => r[0]).join('')));
  }
  return out.filter(Boolean);
}

/** LeadFinderOS's agreement CONTENT (what is signed), in document order. */
function lfosParagraphs(version: string): string[] {
  const v = agreementVersion(version);
  return [
    v.intro,
    v.services.build.description, v.services.optimise.description,
    ...(v.keyPoints?.points ?? []),
    ...v.body.map(blockText),
    v.schedule.title, ...v.schedule.columns, ...v.schedule.rows.flat(),
  ].map(norm);
}

async function compare(version: string, siteFile: string): Promise<string[]> {
  const site = await loadSite(siteFile);
  const problems: string[] = [];
  if (site.version !== version) problems.push(`${siteFile} is version ${site.version}, not ${version}`);
  if (site.sourceSha !== SOURCE_DOCX_SHA256) problems.push(`${siteFile} names a different source .docx (${site.sourceSha})`);
  const siteText = siteParagraphs(site.blocks);
  let at = 0;
  for (const p of lfosParagraphs(version)) {
    const i = siteText.indexOf(p, at);
    if (i < 0) { problems.push(`${version}: missing or different on findable.live: "${p.slice(0, 110)}"`); continue; }
    at = i + 1;
  }
  /* And nothing CLAUSE-shaped on the site that LeadFinderOS does not sign. */
  const lf = new Set(lfosParagraphs(version));
  for (const p of siteText) if (/^(\d+[AB]?\.\d+|\([a-z]\)) /.test(p) && !lf.has(p)) problems.push(`${version}: on findable.live but not in the signed copy: "${p.slice(0, 110)}"`);
  return problems;
}

async function main() {
  const problems: string[] = [];
  for (const { version, siteFile } of PAIRS) {
    try { problems.push(...await compare(version, siteFile)); }
    catch (e) { console.error(`PARITY: could not read the site copy of ${version} — ${(e as Error).message}`); process.exit(2); }
  }
  if (problems.length) {
    console.error(`AGREEMENT PARITY: DRIFT (${problems.length})\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  for (const { version } of PAIRS) console.log(`AGREEMENT PARITY ${version}: IDENTICAL — ${new Set(lfosParagraphs(version)).size} signed paragraphs match findable.live${ref ? ` (${ref})` : ''}`);
}
main();
