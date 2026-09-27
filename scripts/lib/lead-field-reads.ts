/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH outreach_leads COLUMNS DOES THIS CODE READ?  (2026-09-27, site-wide speed pass)

   The Outreach list no longer downloads every column (src/lib/outreachLeadColumns.ts). A column
   left out of that list arrives as `undefined`, silently — so this walks the code that holds LIST
   rows and collects every property it could read off one. The previous (type-checker) audit was not
   enough: it only saw fields declared on `OutreachLead`, and missed reads through `as any`,
   helper-local param types and alternate shapes. This one is SYNTACTIC, so a cast cannot hide a
   read:
     • every property-access name        lead.place_id, (lead as any).place_id, l?.status
     • every element-access string       lead['derived_town']
     • every destructured property name  const { phone, country } = lead
     • every string literal that IS a column name exactly   'email' (key lists, `in` checks)
   Type positions (interfaces, type literals, annotations) are skipped: declaring a field is not
   reading it, and a real read still shows up at its use site. Object-literal keys are skipped too —
   `{ status: 'x' }` is a write.
   It over-matches on purpose (`.status` of a message counts): a column wrongly kept costs a few
   bytes; a column wrongly dropped is a blank on screen or a write made from `undefined`.

   The walk follows static and dynamic imports from the entry files, and STOPS at the files named in
   `stopAt` — the detail dialog, which fetches its own complete row by id.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export function resolveImport(root: string, from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return /\.(tsx?|mts)$/.test(base) ? base : null;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  return null;
}

/** Every source file reachable from `entries`, never entering a file in `stopAt`. */
export function closure(root: string, entries: string[], stopAt: string[] = []): string[] {
  const stop = new Set(stopAt.map((s) => path.join(root, s)));
  const seen = new Set<string>();
  const stack = entries.map((e) => path.join(root, e));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || stop.has(f)) continue;
    // The generated database types are declarations of every column in every table — not reads.
    if (f.replace(/\\/g, "/").includes("/integrations/supabase/types")) continue;
    seen.add(f);
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const r = resolveImport(root, f, m[1]);
      if (r) stack.push(r);
    }
  }
  return [...seen].sort();
}

/** Property names a file could read off an object (see the header for what counts). */
export function readNames(file: string, isColumn: (s: string) => boolean): Set<string> {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    // Type positions declare shapes; they never read a value.
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
    // `patch.x = v` writes x; it does not read it (`a.x += 1` still counts — it reads first).
    const isPlainWriteTarget = !!n.parent && ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (ts.isPropertyAccessExpression(n) && !isPlainWriteTarget) out.add(n.name.text);
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) out.add(n.argumentExpression.text);
    else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const key = n.propertyName ?? n.name;
      if (ts.isIdentifier(key) || ts.isStringLiteral(key)) out.add(key.text);
    } else if (ts.isStringLiteralLike(n) && isColumn(n.text)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The columns (of `columns`) read anywhere in the closure, with the files that read each. */
export function columnReads(root: string, entries: string[], stopAt: string[], columns: readonly string[]) {
  const cols = new Set(columns);
  const files = closure(root, entries, stopAt);
  const by = new Map<string, string[]>();
  for (const f of files) {
    for (const name of readNames(f, (s) => cols.has(s))) {
      if (!cols.has(name)) continue;
      const rel = path.relative(root, f).replace(/\\/g, "/");
      by.set(name, [...(by.get(name) ?? []), rel]);
    }
  }
  return { files: files.map((f) => path.relative(root, f).replace(/\\/g, "/")), reads: by };
}
