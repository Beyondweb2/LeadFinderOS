/* fetchAllRowsParallel must return EXACTLY what fetchAllRows returns (2026-09-27, Inbox/Outreach speed):
   same rows, same order, whatever the server's page cap, and never a silent partial list. */
import { fetchAllRows, fetchAllRowsParallel } from "../src/lib/fetchAllRows.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type Row = { id: string };
const table = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}` }));
/** A PostgREST-like range reader with a server cap (db-max-rows) and a request log. */
function server(rows: Row[], cap = 1000, calls: Array<[number, number]> = []) {
  return (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1);
    return Promise.resolve({ data: rows.slice(from, end + 1), error: null });
  };
}
const ids = (r: Row[]) => r.map((x) => x.id).join(",");

for (const [n, cap] of [[0, 1000], [1, 1000], [999, 1000], [1000, 1000], [1001, 1000], [5222, 1000], [5222, 500], [12345, 1000], [300, 1000]] as const) {
  const rows = table(n);
  const seq = (await fetchAllRows<Row>("seq", server(rows, cap))).rows;
  const calls: Array<[number, number]> = [];
  const par = (await fetchAllRowsParallel<Row>("par", server(rows, cap, calls), (r) => r.id)).rows;
  ok(ids(par) === ids(seq) && par.length === n, `${n} rows, cap ${cap}: parallel = sequential (${par.length})`);
  if (n === 5222 && cap === 1000) ok(calls.length <= 1 + 8, `5,222 rows took ${calls.length} requests in 3 waves, not 7 in a row`);
}

/* A row inserted at the front between requests shifts every later page by one: the boundary row
   then arrives twice, and keyOf must drop the copy. */
{
  const rows = table(2500);
  let n = 0;
  const shifting = (from: number, to: number) => {
    n++;
    const view = n === 1 ? rows : [{ id: "new-front" }, ...rows];
    return Promise.resolve({ data: view.slice(from, to + 1), error: null });
  };
  const par = (await fetchAllRowsParallel<Row>("shift", shifting, (r) => r.id)).rows;
  ok(new Set(par.map((r) => r.id)).size === par.length, "a row shifted across a page boundary is not returned twice");
}

/* An error on ANY page rejects the whole read — never a quietly short list. */
{
  const rows = table(3000);
  let calls = 0;
  const failing = (from: number, to: number) => {
    calls++;
    if (from >= 2000) return Promise.resolve({ data: null, error: { message: "boom" } });
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  let threw = false;
  try { await fetchAllRowsParallel<Row>("fail", failing, (r) => r.id); } catch { threw = true; }
  ok(threw, "an error on a later page rejects the read");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
