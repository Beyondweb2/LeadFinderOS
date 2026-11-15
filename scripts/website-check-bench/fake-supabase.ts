// AN IN-MEMORY STAND-IN FOR THE SUPABASE CLIENT (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// Just enough of the PostgREST query builder for the deep crawl's own code (_shared/crawl-job.ts) to run unchanged on a
// laptop: select with aliases and JSON paths, insert / update / upsert, the filters the crawl uses, order, limit, range,
// count, and the two RPCs it calls. It is a test double, never a database: one process, one run, nothing persisted.

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

let nextSerial = 1;
const uuid = () => crypto.randomUUID();

function pathGet(r: Row, path: string): any {
  // "evidence->d", "result->signals->>fetchFailed", "data->>source"
  const parts = path.split(/->>?/);
  const asText = /->>[^>]*$/.test(path);
  let v: any = r[parts[0]];
  for (const p of parts.slice(1)) v = v == null ? undefined : v[p];
  if (asText && v != null && typeof v !== 'string') v = String(v);
  return v;
}

function parseSelect(cols: string): Array<{ alias: string; path: string }> | null {
  if (!cols || cols.trim() === '*') return null;
  const out: Array<{ alias: string; path: string }> = [];
  for (const raw of cols.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-zA-Z_][\w]*):(.+)$/.exec(raw);
    const alias = m ? m[1] : raw.split(/->>?/).pop()!;
    out.push({ alias, path: m ? m[2] : raw });
  }
  return out;
}

function project(r: Row, sel: ReturnType<typeof parseSelect>): Row {
  if (!sel) return structuredClone(r);
  const o: Row = {};
  for (const s of sel) { const v = pathGet(r, s.path); o[s.alias] = v === undefined ? null : structuredClone(v); }
  return o;
}

function cmp(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function orFilter(expr: string): Filter {
  const parts = expr.split(',').map((p) => p.trim());
  const tests = parts.map((p) => {
    const m = /^([\w>-]+)\.(is|lt|gt|eq|lte|gte)\.(.+)$/.exec(p);
    if (!m) throw new Error(`fake-supabase: unsupported or() part ${p}`);
    const [, col, op, val] = m;
    return (r: Row) => {
      const v = pathGet(r, col);
      if (op === 'is') return val === 'null' ? v == null : String(v) === val;
      if (op === 'eq') return String(v) === val;
      if (v == null) return false;
      if (op === 'lt') return v < val;
      if (op === 'gt') return v > val;
      if (op === 'lte') return v <= val;
      return v >= val;
    };
  });
  return (r) => tests.some((t) => t(r));
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private sel: ReturnType<typeof parseSelect> = null;
  private selected = false;
  private countOpt: { count?: string; head?: boolean } = {};
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: any = null;
  private upsertOpt: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private one: 'single' | 'maybe' | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*', opt: { count?: string; head?: boolean } = {}) { this.sel = parseSelect(cols); this.selected = true; this.countOpt = opt; return this; }
  insert(rows: any) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: any) { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows: any, opt: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = 'upsert'; this.payload = rows; this.upsertOpt = opt; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => { const x = pathGet(r, c); return x === v || (x != null && v != null && String(x) === String(v)); }); return this; }
  neq(c: string, v: any) { this.filters.push((r) => { const x = pathGet(r, c); return x != null && String(x) !== String(v); }); return this; }
  in(c: string, vs: any[]) { const s = new Set(vs.map(String)); this.filters.push((r) => s.has(String(pathGet(r, c)))); return this; }
  is(c: string, v: null) { this.filters.push((r) => (v === null ? pathGet(r, c) == null : pathGet(r, c) === v)); return this; }
  not(c: string, op: string, v: any) { if (op !== 'is' || v !== null) throw new Error('fake-supabase: not() only supports is null'); this.filters.push((r) => pathGet(r, c) != null); return this; }
  gte(c: string, v: any) { this.filters.push((r) => pathGet(r, c) != null && pathGet(r, c) >= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => pathGet(r, c) != null && pathGet(r, c) > v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => pathGet(r, c) != null && pathGet(r, c) < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => pathGet(r, c) != null && pathGet(r, c) <= v); return this; }
  or(expr: string) { this.filters.push(orFilter(expr)); return this; }
  order(col: string, opt: { ascending?: boolean } = {}) { this.orders.push({ col, asc: opt.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private matching(): Row[] {
    let rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => { for (const o of this.orders) { const c = cmp(pathGet(a, o.col), pathGet(b, o.col)); if (c) return o.asc ? c : -c; } return 0; });
    }
    return rows;
  }

  private run(): { data: any; error: any; count?: number | null } {
    const t = this.db.rows(this.table);
    let affected: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = (this.upsertOpt.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const raw of list) {
        const r: Row = structuredClone(raw);
        if (this.op === 'upsert' && keys.length) {
          const hit = t.find((x) => keys.every((k) => String(x[k]) === String(r[k])));
          if (hit) { if (!this.upsertOpt.ignoreDuplicates) { Object.assign(hit, r); affected.push(hit); } continue; }
        }
        if (r.id == null) r.id = this.db.idKind(this.table) === 'serial' ? nextSerial++ : uuid();
        r.created_at ??= new Date().toISOString();
        t.push(r);
        affected.push(r);
      }
    } else if (this.op === 'update') {
      affected = this.matching();
      for (const r of affected) Object.assign(r, structuredClone(this.payload));
    } else if (this.op === 'delete') {
      affected = this.matching();
      this.db.setRows(this.table, t.filter((r) => !affected.includes(r)));
    } else {
      affected = this.matching();
    }
    if (this.op !== 'select' && !this.selected) return { data: null, error: null };
    const count = this.countOpt.count ? affected.length : null;
    if (this.countOpt.head) return { data: null, error: null, count };
    let out = affected;
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) out = out.slice(0, this.lim);
    const data = out.map((r) => project(r, this.sel));
    if (this.one) {
      if (data.length > 1 && this.one === 'single') return { data: null, error: { message: 'multiple rows' } };
      if (!data.length) return this.one === 'single' ? { data: null, error: { message: 'no rows' } } : { data: null, error: null };
      return { data: data[0], error: null, count };
    }
    return { data, error: null, count };
  }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  public rpcs: Record<string, (args: any) => any> = {};
  rows(t: string): Row[] { if (!this.tables.has(t)) this.tables.set(t, []); return this.tables.get(t)!; }
  setRows(t: string, rows: Row[]) { this.tables.set(t, rows); }
  idKind(t: string): 'serial' | 'uuid' { return t === 'crawl_urls' ? 'serial' : 'uuid'; }
  seed(t: string, rows: Row[]) { this.rows(t).push(...structuredClone(rows)); }

  client() {
    const db = this;
    return {
      from: (t: string) => new Query(db, t),
      rpc: async (name: string, args: any) => {
        const fn = db.rpcs[name];
        if (!fn) return { data: null, error: { message: `fake-supabase: no rpc ${name}` } };
        try { return { data: await fn(args), error: null }; } catch (e) { return { data: null, error: { message: String((e as Error).message) } }; }
      },
    };
  }
}

/** The RPCs the deep crawl calls, as the database defines them. */
export function installCrawlRpcs(db: FakeDb) {
  db.rpcs.crawl_job_counts = ({ p_job }: { p_job: string }) => {
    const rows = db.rows('crawl_urls').filter((r) => r.job_id === p_job);
    const pages = rows.filter((r) => r.kind === 'page');
    const sm = rows.filter((r) => r.kind === 'sitemap');
    const by = (s: string) => pages.filter((r) => r.status === s).length;
    return {
      discovered: pages.length, queued: by('queued'), processing: by('processing'), done: by('done'), failed: by('failed'), skipped: by('skipped'),
      sitemaps: sm.length, sitemaps_pending: sm.filter((r) => r.status === 'queued' || r.status === 'processing').length,
    };
  };
  /* The browser-read budget: always allowed here; the bench's renderer is local and free. */
  db.rpcs.claim_crawl_render = () => true;
}
