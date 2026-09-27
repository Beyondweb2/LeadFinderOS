/* fetchAllRowsParallel must return EXACTLY what fetchAllRows returns (2026-09-27, Inbox/Outreach speed):
   same rows, same order, whatever the server's page cap, and never a silent partial list. */
import { fetchAllRows, fetchAllRowsParallel, resetRowCountHints } from "../src/lib/fetchAllRows.ts";

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
  resetRowCountHints(); // a FIRST read: nothing remembered
  const rows = table(n);
  const seq = (await fetchAllRows<Row>("seq", server(rows, cap))).rows;
  const calls: Array<[number, number]> = [];
  const par = (await fetchAllRowsParallel<Row>("par", server(rows, cap, calls), (r) => r.id)).rows;
  ok(ids(par) === ids(seq) && par.length === n, `${n} rows, cap ${cap}: parallel = sequential (${par.length})`);
  if (n === 5222 && cap === 1000) ok(calls.length <= 1 + 8, `5,222 rows took ${calls.length} requests in 3 waves, not 7 in a row`);
  // A short first page (the whole table, when the cap allows it) costs ONE probe, not a wave of six.
  if (n > 0 && n < 1000 && cap === 1000) ok(calls.length === 2, `${n} rows: ${calls.length} requests (page + one probe), not 7`);
  if (n === 0) ok(calls.length === 1, `empty table: ${calls.length} request`);
  // Under a lower server cap the probe finds rows and the waves carry on: still complete (above).
  if (n === 5222 && cap === 500) ok(calls.length <= 2 + 12, `cap 500: ${calls.length} requests`);
}

/* ⚡ The SECOND read of a label sizes its first wave from the first read's count — fewer requests
   past the end, and exactly the same rows whether the list grew, shrank or stayed put. */
for (const [n1, n2, cap, maxCalls] of [
  [1554, 1554, 1000, 2],     // was 7 (5 empty pages)
  [1572, 1572, 1000, 2],
  [5222, 5222, 1000, 6],     // pages 1..5, the last one short
  [5000, 5000, 1000, 6],     // ends on a boundary: one page past it shows the end
  [1000, 1000, 1000, 2],
  [1554, 2100, 1000, 99],    // grew past its guess: carries on in waves
  [1554, 9000, 1000, 99],
  [5222, 1200, 1000, 99],    // shrank
  [5222, 40, 1000, 2],
  [3000, 0, 1000, 1],
  [5222, 5222, 500, 99],     // a server cap below PAGE: the guess is never used
] as const) {
  resetRowCountHints();
  await fetchAllRowsParallel<Row>("hinted", server(table(n1), cap), (r) => r.id);
  const rows = table(n2);
  const seq = (await fetchAllRows<Row>("seq", server(rows, cap))).rows;
  const calls: Array<[number, number]> = [];
  const par = (await fetchAllRowsParallel<Row>("hinted", server(rows, cap, calls), (r) => r.id)).rows;
  ok(ids(par) === ids(seq) && par.length === n2, `second read ${n1}→${n2} rows (cap ${cap}): same rows as sequential (${par.length})`);
  if (maxCalls !== 99) ok(calls.length <= maxCalls, `second read of ${n2} rows: ${calls.length} requests (≤ ${maxCalls})`);
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
