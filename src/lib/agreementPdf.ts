/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIGNED AGREEMENT PDF — the copy emailed to the client and to Paul after acceptance.

   ⛔ FULLY FILLED, NO BLANK BOX (Paul, 2026-10-02). Every client field, the ticked service and both
   signature blocks are filled from the acceptance; anything we do not hold prints NOT_PROVIDED.
   ⛔ THE WORDS ARE clientAgreement.ts's — this module only lays them out. The evidence line at the
   foot of the signature page names the method, the UTC time, the version and the fingerprint of the
   canonical text (renderAgreementText), so the PDF can always be checked against the stored record.

   ⚠️ pdf-lib IS PASSED IN, NOT IMPORTED. The edge function hands over `npm:pdf-lib`; a local script
   hands over the Node package. That keeps this file importable from Deno and from Node alike.
   ⚠️ The standard PDF fonts only cover the Windows-1252 character set, so typed text is folded onto
   it (winAnsi) — the STORED record keeps exactly what was typed; only this copy approximates.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  agreementVersion, clientDetailRows, CLIENT_AGREEMENT_TITLE, methodWords, NOT_PROVIDED, ukDate, ukDateTime, utcStamp,
  type AgreementFill, type AgreementRoute,
} from './clientAgreement.ts';

export interface AgreementAcceptanceInfo {
  method: 'checkout' | 'agree_page';
  acceptedAtIso: string;
  version: string;
  sha256: string;
}

// deno-lint-ignore no-explicit-any
type PdfLib = any;

const A4: [number, number] = [595.28, 841.89];
const M = 50;                       // page margin
const W = A4[0] - M * 2;            // text width
const FOOT_Y = 30;

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function winAnsi(s: string): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0)!;
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)) { out += ch; continue; }
    if (ch === '\n' || ch === '\t') { out += ' '; continue; }
    const folded = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    out += [...folded].every((f) => { const k = f.codePointAt(0)!; return k >= 32 && k <= 126; }) && folded ? folded : '?';
  }
  return out;
}

export async function buildAgreementPdf(lib: PdfLib, fill: AgreementFill, acc: AgreementAcceptanceInfo): Promise<Uint8Array> {
  const v = agreementVersion(acc.version);
  const doc = await lib.PDFDocument.create();
  doc.setTitle(`Findable ${CLIENT_AGREEMENT_TITLE} - ${winAnsi(fill.businessName)}`);
  doc.setAuthor('Findable');
  doc.setSubject(`Agreement version ${v.version}, fingerprint ${acc.sha256}`);
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const ink = lib.rgb(0.07, 0.09, 0.15);
  const muted = lib.rgb(0.33, 0.37, 0.45);
  const line = lib.rgb(0.80, 0.83, 0.88);
  const tint = lib.rgb(0.96, 0.97, 0.98);
  const gold = lib.rgb(0.96, 0.70, 0.0);

  let page = doc.addPage(A4);
  let y = A4[1] - M;

  const wrap = (text: string, f: typeof font, size: number, width: number): string[] => {
    const words = winAnsi(text).split(/\s+/).filter(Boolean);
    const lines: string[] = []; let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
      if (cur) lines.push(cur);
      /* a single word wider than the column (a long URL) is hard-broken rather than overflowing */
      let rest = w;
      while (f.widthOfTextAtSize(rest, size) > width) {
        let i = rest.length; while (i > 1 && f.widthOfTextAtSize(rest.slice(0, i), size) > width) i--;
        lines.push(rest.slice(0, i)); rest = rest.slice(i);
      }
      cur = rest;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const ensure = (h: number) => { if (y - h < M + 20) newPage(); };
  const lh = (size: number) => size * 1.38;

  /** A paragraph, optionally with a bold run-in lead. */
  const para = (text: string, opts: { size?: number; lead?: string; indent?: number; color?: unknown; f?: typeof font; gap?: number } = {}) => {
    const size = opts.size ?? 9.5; const indent = opts.indent ?? 0; const width = W - indent;
    const leadTxt = opts.lead ? winAnsi(opts.lead) + ' ' : '';
    /* the lead is laid out as part of the first line: measure it, then wrap the rest around it */
    const all = wrap(leadTxt + text, opts.f ?? font, size, width);
    ensure(all.length * lh(size));
    const at = { page, baseline: y - size };
    let first = true;
    for (const l of all) {
      if (first && leadTxt && l.startsWith(leadTxt.trimEnd())) {
        /* bold lead, then one regular-width space: measuring the space in bold let it collapse */
        const leadW = bold.widthOfTextAtSize(leadTxt.trimEnd(), size) + font.widthOfTextAtSize(' ', size) + 0.6;
        page.drawText(leadTxt, { x: M + indent, y: y - size, size, font: bold, color: ink });
        page.drawText(l.slice(leadTxt.length), { x: M + indent + leadW, y: y - size, size, font: opts.f ?? font, color: opts.color ?? ink });
      } else {
        page.drawText(l, { x: M + indent, y: y - size, size, font: opts.f ?? font, color: opts.color ?? ink });
      }
      first = false; y -= lh(size);
    }
    y -= opts.gap ?? 4;
    return at;
  };
  const heading = (text: string, size = 10.5) => {
    ensure(lh(size) + 30);
    y -= 6;
    page.drawText(winAnsi(text), { x: M, y: y - size, size, font: bold, color: ink });
    y -= lh(size) + 2;
  };

  /** A bordered table. `cols` are widths summing to W; `boldFirst` bolds the first column. */
  const table = (rows: string[][], cols: number[], opts: { header?: boolean; boldFirst?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 9; const pad = 5;
    rows.forEach((row, ri) => {
      const isHead = !!opts.header && ri === 0;
      const cells = row.map((c, ci) => wrap(c, (isHead || (opts.boldFirst && ci === 0)) ? bold : font, size, cols[ci] - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * lh(size) + pad * 2 - 2;
      ensure(h);
      let x = M;
      cells.forEach((c, ci) => {
        page.drawRectangle({ x, y: y - h, width: cols[ci], height: h, borderColor: line, borderWidth: 0.7,
          color: (isHead || (opts.boldFirst && ci === 0)) ? tint : undefined });
        c.forEach((l, li) => page.drawText(l, { x: x + pad, y: y - pad - size - li * lh(size) + 1, size,
          font: (isHead || (opts.boldFirst && ci === 0)) ? bold : font, color: ink }));
        x += cols[ci];
      });
      y -= h;
    });
    y -= 8;
  };

  // ── page 1: title, the two parties, the service ─────────────────────────────────────────────
  page.drawText('Findable', { x: M, y: y - 20, size: 20, font: bold, color: ink });
  page.drawText('findable.live', { x: M, y: y - 34, size: 9, font, color: muted });
  page.drawRectangle({ x: M, y: y - 42, width: 46, height: 2.2, color: gold });
  y -= 66;
  page.drawText(CLIENT_AGREEMENT_TITLE, { x: M, y: y - 16, size: 16, font: bold, color: ink });
  y -= 30;
  para(v.intro, { size: 10, gap: 10 });

  heading('FINDABLE DETAILS', 9.5);
  table(v.findableDetails.map(([k, val]) => [k, val]), [190, W - 190], { boldFirst: true });
  heading('CLIENT DETAILS', 9.5);
  table(clientDetailRows(fill, v).map(([k, val]) => [k, val]), [190, W - 190], { boldFirst: true });

  heading('YOUR SERVICE', 9.5);
  for (const r of ['build', 'optimise'] as AgreementRoute[]) {
    const s = v.services[r]; const on = fill.route === r;
    const lines = wrap(s.description, font, 9, W - 150);
    const h = Math.max(lines.length * lh(9), 16) + 8;
    ensure(h);
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, borderColor: line, borderWidth: 0.7, color: on ? tint : undefined });
    const bx = M + 8, by = y - 6 - 11;
    page.drawRectangle({ x: bx, y: by, width: 11, height: 11, borderColor: ink, borderWidth: 1 });
    if (on) {
      page.drawLine({ start: { x: bx + 2, y: by + 2 }, end: { x: bx + 9, y: by + 9 }, thickness: 1.6, color: ink });
      page.drawLine({ start: { x: bx + 2, y: by + 9 }, end: { x: bx + 9, y: by + 2 }, thickness: 1.6, color: ink });
    }
    page.drawText(s.name, { x: M + 26, y: y - 6 - 9, size: 9.5, font: bold, color: ink });
    lines.forEach((l, i) => page.drawText(l, { x: M + 140, y: y - 6 - 9 - i * lh(9), size: 9, font, color: ink }));
    y -= h;
  }
  y -= 6;
  para(v.serviceNote, { size: 9, color: muted, gap: 8 });

  // ── the clauses ─────────────────────────────────────────────────────────────────────────────
  for (const b of v.body) {
    if (b.kind === 'heading') heading(b.text);
    else if (b.kind === 'clause') {
      /* the number hangs in its own column so wrapped lines align under the text */
      const size = 9.5;
      const at = para(b.text, { size, lead: b.lead, indent: 26 });
      at.page.drawText(b.num, { x: M, y: at.baseline, size, font: bold, color: ink });
    } else if (b.kind === 'bullet') {
      const at = para(b.text, { size: 9.5, indent: 40, gap: 2 });
      at.page.drawText('•', { x: M + 30, y: at.baseline, size: 9.5, font, color: ink });
    } else para(b.text);
  }

  // ── schedule 1: always starts a page, so its heading and header row are never stranded ──────
  newPage();
  heading(v.schedule.title);
  const sc = [110, (W - 110) / 2, (W - 110) / 2];
  table([['', ...v.schedule.columns], ...v.schedule.rows], sc, { header: true, boldFirst: true, size: 8.5 });

  // ── signatures: always its own page, fully filled ───────────────────────────────────────────
  newPage();
  heading(v.signatures.title, 12);
  para(v.signatures.intro, { size: 9.5, color: muted, gap: 10 });
  const when = ukDateTime(acc.acceptedAtIso);
  const checkout = acc.method === 'checkout';
  heading('FOR FINDABLE', 9.5);
  table([
    ['Name', v.signatures.findableName],
    ['Signature', 'Signed electronically'],
    ['Date', ukDate(acc.acceptedAtIso)],
  ], [190, W - 190], { boldFirst: true });
  heading('FOR THE CLIENT', 9.5);
  table([
    ['Business name', fill.businessName || NOT_PROVIDED],
    ['Name of person signing', String(fill.contactName ?? '').trim() || NOT_PROVIDED],
    ['Role', String(fill.role ?? '').trim() || NOT_PROVIDED],
    ['Signature', checkout ? 'Accepted electronically at checkout' : 'Signed electronically'],
    ['Date', when],
  ], [190, W - 190], { boldFirst: true });

  /* ⛔ THE EVIDENCE LINE, Paul's wording (2026-10-02). */
  const evidence = `Accepted electronically via ${methodWords(acc.method)} on ${utcStamp(acc.acceptedAtIso)}. Agreement version ${v.version}. Fingerprint ${acc.sha256}.`;
  y = Math.min(y, M + 70);
  if (y < M + 40) { newPage(); y = M + 70; }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.6, color: line });
  para(evidence, { size: 8, color: muted });

  // ── footers, once the page count is known ───────────────────────────────────────────────────
  const pages = doc.getPages();
  pages.forEach((p: typeof page, i: number) => {
    p.drawText(`Findable ${CLIENT_AGREEMENT_TITLE} | Page ${i + 1} of ${pages.length}`, { x: M, y: FOOT_Y, size: 8, font, color: muted });
    p.drawText(`Version ${v.version}`, { x: A4[0] - M - font.widthOfTextAtSize(`Version ${v.version}`, 8), y: FOOT_Y, size: 8, font, color: muted });
  });

  return await doc.save();
}
