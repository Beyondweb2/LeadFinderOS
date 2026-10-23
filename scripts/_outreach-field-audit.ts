// Recon only (untracked, never staged): every OutreachLead field read anywhere in src, via the type checker.
import ts from "typescript";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cfgPath = path.join(root, "tsconfig.app.json");
const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();
const typesFile = path.join(root, "src/types/outreach.ts").replace(/\\/g, "/");

const fields = new Map<string, Set<string>>();          // field -> files reading it
const wholeObject: string[] = [];                          // spreads / Object.keys over a lead
function isLeadProp(sym: ts.Symbol | undefined): string | null {
  if (!sym) return null;
  const decls = (sym.declarations ?? []).concat(((sym as unknown as { links?: { syntheticOrigin?: ts.Symbol } }).links?.syntheticOrigin?.declarations) ?? []);
  for (const d of decls) {
    const p = d.parent;
    if (ts.isInterfaceDeclaration(p) && p.name.text === "OutreachLead" && d.getSourceFile().fileName.replace(/\\/g, "/") === typesFile) return sym.name;
  }
  return null;
}
const add = (f: string, file: string) => { if (!fields.has(f)) fields.set(f, new Set()); fields.get(f)!.add(path.relative(root, file).replace(/\\/g, "/")); };
function typeIsLead(t: ts.Type): boolean {
  const s = (t.aliasSymbol ?? t.getSymbol());
  if (s?.name === "OutreachLead") return true;
  if (t.isUnion()) return t.types.some(typeIsLead);
  return false;
}
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.replace(/\\/g, "/").includes("/src/")) continue;
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) || ts.isPropertyAccessChain?.(n)) {
      const f = isLeadProp(checker.getSymbolAtLocation((n as ts.PropertyAccessExpression).name)); if (f) add(f, sf.fileName);
    } else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
      const f = isLeadProp(checker.getSymbolAtLocation(n.argumentExpression)); if (f) add(f, sf.fileName);
    } else if (ts.isBindingElement(n)) {
      const nameNode = n.propertyName ?? n.name;
      if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
        const parentType = checker.getTypeAtLocation(n.parent);
        const prop = parentType.getProperty(nameNode.text);
        const f = isLeadProp(prop); if (f) add(f, sf.fileName);
      }
    } else if (ts.isShorthandPropertyAssignment(n) || ts.isPropertyAssignment(n)) {
      // object literal typed as a lead (writes — not needed for a read, but a spread of such an object is)
    } else if (ts.isSpreadAssignment(n) || ts.isSpreadElement(n)) {
      if (typeIsLead(checker.getTypeAtLocation(n.expression))) wholeObject.push(`${path.relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} spread`);
    } else if (ts.isCallExpression(n) && /^Object\.(keys|entries|values)$/.test(n.expression.getText()) && n.arguments[0] && typeIsLead(checker.getTypeAtLocation(n.arguments[0]))) {
      wholeObject.push(`${path.relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.expression.getText()}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const iface = program.getSourceFile(path.join(root, "src/types/outreach.ts"))!;
let declared: string[] = [];
iface.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === "OutreachLead") declared = n.members.map((m) => (m.name as ts.Identifier)?.text).filter(Boolean); });
const read = [...fields.keys()].sort();
console.log(JSON.stringify({ declared: declared.length, readCount: read.length, read, neverRead: declared.filter((d) => !fields.has(d)).sort(), wholeObject, byField: Object.fromEntries(read.map((f) => [f, [...fields.get(f)!].sort()])) }, null, 1));
