/* An in-memory stand-in for the supabase-js query builder — just enough of PostgREST's filter grammar
   for the payment-state tests (scripts/payment-client-state.test.ts). NOT a test itself (no `.test.` in
   the name, so the runner never runs it on its own).
   Supports: select / update / insert / upsert, eq / neq / is / in / not / or(...) (ANDed across calls,
   as PostgREST does), order / limit, maybeSingle / single / then. Unique keys per table make a duplicate
   insert answer 23505, as the real ledger's (kind, stripe_object_id) index does. Every write is applied
   synchronously inside one microtask, so a conditional update is atomic exactly as a single SQL UPDATE
   is. */
type Row = Record<string, unknown>;

const parseVal = (v: string): unknown => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
/** Order two values as SQL would for the comparisons used here: numbers as numbers, ISO timestamps as
 *  instants (added for scripts/sales-prospect-check.test.ts; numbers behave exactly as before). */
const cmp = (a: unknown, b: unknown): number => {
  const na = num(a), nb = num(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const da = Date.parse(String(a)), db = Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return NaN;
};

/** One PostgREST filter atom ("col.op.value") against a row. */
function atom(row: Row, expr: string): boolean {
  const m = /^([a-z_]+)\.(not\.)?(is|eq|neq|lte|lt|gte|gt|in)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`fake-supabase: unsupported filter ${expr}`);
  const [, col, neg, op, raw] = m;
  const v = row[col];
  let r: boolean;
  if (op === 'is') r = raw === 'null' ? v === null || v === undefined : v === parseVal(raw);
  else if (op === 'in') { const list = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim()); r = v !== null && v !== undefined && list.includes(String(v)); }
  else if (v === null || v === undefined) r = false; // SQL: a comparison with NULL is never true
  else if (op === 'eq') r = String(v) === raw;
  else if (op === 'neq') r = String(v) !== raw;
  else if (op === 'lte') r = cmp(v, raw) <= 0;
  else if (op === 'lt') r = cmp(v, raw) < 0;
  else if (op === 'gte') r = cmp(v, raw) >= 0;
  else r = cmp(v, raw) > 0;
  // NOT x where x is NULL-comparison-unknown stays unknown (false), as in SQL — except for `is`.
  if (neg) return op === 'is' ? !r : (v === null || v === undefined ? false : !r);
  return r;
}
/** Split an or() list on top-level commas (not the ones inside "in.(a,b)"). */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  unique: Record<string, string[][]> = {};
  /** Partial unique indexes: the key applies only to rows matching `where` (e.g. one ACTIVE batch per rep). */
  partialUnique: Record<string, Array<{ cols: string[]; where: (r: Row) => boolean }>> = {};
  /** Optional hook run before every query resolves — a test can make a table fail (throw / error). */
  failOn: ((table: string, op: string) => { message: string; code?: string } | null) | null = null;
  writes: Array<{ table: string; kind: string; patch: Row }> = [];
  table(name: string) { return (this.tables[name] ??= []); }
  from(name: string) { return new Query(this, name); }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
  private patch: Row | Row[] | null = null;
  private returning = false;
  private single: 'maybe' | 'one' | null = null;
  private limitN: number | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  constructor(private db: FakeDb, private name: string) {}
  select(_cols?: string) { if (this.op === 'select') this.op = 'select'; else this.returning = true; return this; }
  update(p: Row) { this.op = 'update'; this.patch = p; return this; }
  insert(p: Row | Row[]) { this.op = 'insert'; this.patch = p; return this; }
  upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = 'upsert'; this.patch = p; this.upsertOpts = o; return this; }
  delete() { this.op = 'delete'; return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) >= 0); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) > 0); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) <= 0); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && cmp(r[c], v) < 0); return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && String(r[c]) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== null && r[c] !== undefined && String(r[c]) !== String(v)); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.map(String).includes(String(r[c]))); return this; }
  not(c: string, op: string, v: unknown) { const e = `${c}.not.${op}.${String(v)}`; this.filters.push((r) => atom(r, e)); return this; }
  or(expr: string) { const parts = splitTop(expr); this.filters.push((r) => parts.some((p) => atom(r, p))); return this; }
  contains(c: string, v: Row) { this.filters.push((r) => Object.entries(v).every(([k, x]) => (r[c] as Row | undefined)?.[k] === x)); return this; }
  order() { return this; }
  limit(n: number) { this.limitN = n; return this; }
  range() { return this; }
  maybeSingle() { this.single = 'maybe'; return this; }
  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
  private matches() { return this.db.table(this.name).filter((r) => this.filters.every((f) => f(r))); }
  private dup(row: Row): boolean {
    for (const key of this.db.unique[this.name] ?? []) {
      if (this.db.table(this.name).some((r) => key.every((k) => r[k] !== null && r[k] !== undefined && r[k] === row[k]))) return true;
    }
    for (const p of this.db.partialUnique[this.name] ?? []) {
      if (!p.where(row)) continue;
      if (this.db.table(this.name).some((r) => p.where(r) && p.cols.every((k) => r[k] !== null && r[k] !== undefined && r[k] === row[k]))) return true;
    }
    return false;
  }
  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const t = this.db.table(this.name);
    const forced = this.db.failOn?.(this.name, this.op) ?? null;
    if (forced) return { data: null, error: forced };
    if (this.op === 'delete') {
      const gone = this.matches();
      this.db.tables[this.name] = t.filter((r) => !gone.includes(r));
      this.db.writes.push({ table: this.name, kind: 'delete', patch: { _matched: gone.length } });
      return { data: null, error: null };
    }
    if (this.op === 'select') {
      let rows = this.matches().map((r) => ({ ...r }));
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    if (this.op === 'update') {
      const rows = this.matches();
      for (const r of rows) Object.assign(r, this.patch as Row);
      this.db.writes.push({ table: this.name, kind: 'update', patch: { ...(this.patch as Row), _matched: rows.length } });
      return { data: this.returning || this.single ? (this.single ? rows[0] ?? null : rows.map((r) => ({ ...r }))) : null, error: null };
    }
    const list = Array.isArray(this.patch) ? this.patch : [this.patch as Row];
    const out: Row[] = [];
    for (const p of list) {
      const row = { id: p.id ?? `${this.name}-${t.length + 1}`, ...p };
      if (this.dup(row)) {
        if (this.op === 'upsert' && this.upsertOpts.ignoreDuplicates) continue;
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
      }
      t.push(row); out.push(row);
      this.db.writes.push({ table: this.name, kind: this.op, patch: row });
    }
    if (this.returning && this.single) return { data: out[0] ?? null, error: null };
    return { data: this.returning ? out : null, error: null };
  }
}
