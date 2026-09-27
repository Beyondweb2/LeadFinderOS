/* Sign out ends THIS browser's session only (Paul, 2026-09-27).
   supabase-js's auth.signOut() defaults to scope 'global' — every session on the account, every
   device. Pressing Sign out in a QA browser signed Paul out everywhere; this suite keeps every
   browser-side sign-out call explicitly local, so a future edit cannot quietly drop the scope. */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []);

// Every direct call to the auth client's signOut in the SPA names scope 'local'.
const calls: string[] = [];
for (const file of walk("src")) {
  const src = fs.readFileSync(path.join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of src.matchAll(/\.auth\.signOut\(([^)]*)\)/g)) {
    calls.push(`${file}: signOut(${m[1]})`);
    ok(/scope:\s*'local'/.test(m[1]), `${file}: auth.signOut(${m[1] || ""}) is scoped to this session`);
  }
}
ok(calls.length >= 3, `found the auth.signOut calls (${calls.length})`);

// The one Sign out every button uses is useAuth's — and it is local.
const auth = fs.readFileSync(path.join(root, "src/hooks/useAuth.tsx"), "utf8");
const body = auth.slice(auth.indexOf("const signOut = async () => {"), auth.indexOf("return (", auth.indexOf("const signOut = async () => {")));
ok(/await supabase\.auth\.signOut\(\{ scope: 'local' \}\);/.test(body), "useAuth's signOut (every Sign out button) ends only this browser's session");
for (const button of ["src/components/UserMenu.tsx", "src/components/MobileBottomNav.tsx", "src/components/RequireAccess.tsx"]) {
  const s = fs.readFileSync(path.join(root, button), "utf8");
  ok(/useAuth\(\)/.test(s) && !/supabase\.auth\.signOut/.test(s), `${button} signs out through useAuth, not its own global call`);
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
