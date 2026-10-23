import { readFileSync } from 'node:fs';
import { teamSeedRows } from '../src/lib/teamTemplateSeed.ts';
const tok = readFileSync(process.argv[2] + '/tok.txt', 'utf8');
const r = await fetch('https://api.supabase.com/v1/projects/ruusxpkkmwtljxxulhbq/database/query', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: "select seed_key, title, category, sort_order, content from templates where scope='team' order by sort_order" }) });
const live = await r.json() as { seed_key: string; title: string; category: string; sort_order: number; content: string }[];
let bad = 0;
for (const s of teamSeedRows()) { const l = live.find((x) => x.seed_key === s.seedKey); const same = !!l && l.title === s.title && l.content === s.content && l.category === s.category && l.sort_order === s.sortOrder; if (!same) bad++; console.log(same ? 'IDENTICAL' : 'DIFFERENT', s.seedKey); }
console.log(bad ? bad + ' DIFFER' : 'ALL EIGHT LIVE ROWS MATCH THE SOURCE BYTE FOR BYTE');
