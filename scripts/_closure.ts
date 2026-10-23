// Scratch (never staged): commits that touched an edge function's import closure since a time.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { closure } from "./lib/lead-field-reads.ts";
const root = path.resolve(import.meta.dirname, "..");
const [fn, since] = process.argv.slice(2);
const files = closure(root, [`supabase/functions/${fn}/index.ts`]).map((f) => path.relative(root, f).split(path.sep).join("/"));
console.log(`${fn}: ${files.length} files in closure`);
const out = execFileSync("git", ["log", `--since=${since}`, "--name-only", "--pretty=format:%h|%s", "origin/main", "--", ...files], { cwd: root, encoding: "utf8" });
console.log(out.trim() || `no commits touched the closure since ${since}`);
