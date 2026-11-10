/* STALE BUNDLE AFTER A DEPLOY (2026-11-07): a failed lazy page reloads ONCE, never in a loop; index.html is no-cache. */
import fs from 'node:fs';
import path from 'node:path';
import { autoReloadBlocked, isStaleChunkError, reloadOnceForStaleChunk, RELOAD_GUARD_MS, STALE_CHUNK_RELOAD_KEY } from '../src/lib/staleChunk.ts';
import { setCallState } from '../src/lib/liveCallFlag.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('PASS', m); else { f++; console.log('FAIL', m); } };
const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

/* Every browser's wording */
ok(isStaleChunkError(new TypeError('error loading dynamically imported module: https://app.leadfinderos.com/assets/Outreach-abc.js')), 'W1. Firefox wording (what Chris saw)');
ok(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js')), 'W2. Chrome wording');
ok(isStaleChunkError(new TypeError('Importing a module script failed.')), 'W3. Safari wording');
ok(isStaleChunkError({ name: 'ChunkLoadError', message: 'x' }) && isStaleChunkError('Unable to preload CSS for /assets/a.css'), 'W4. chunk / CSS preload wordings');
ok(!isStaleChunkError(new Error('Cannot read properties of undefined')) && !isStaleChunkError(null) && !isStaleChunkError(undefined), 'W5. an ordinary error is not a stale chunk');

/* One reload, never a loop */
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const s = mem(); let reloads = 0; const reload = () => { reloads++; };
ok(reloadOnceForStaleChunk(s, 1_000_000, reload) && reloads === 1 && s.m.get(STALE_CHUNK_RELOAD_KEY) === '1000000', 'R1. the first failure reloads and stamps the time');
ok(!reloadOnceForStaleChunk(s, 1_000_000 + 5_000, reload) && reloads === 1, 'R2. a second failure right after the reload does NOT reload again (no loop)');
ok(reloadOnceForStaleChunk(s, 1_000_000 + RELOAD_GUARD_MS + 1, reload) && reloads === 2, 'R3. a later deploy, after the guard window, may reload once more');
ok(!reloadOnceForStaleChunk(null, 1, reload) && reloads === 2, 'R4. storage blocked: never reload (cannot guard, so no loop)');
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
ok(!reloadOnceForStaleChunk(broken, 1, reload) && reloads === 2, 'R5. storage throwing: never reload');

/* Never while a call is live (2026-11-10): a reload hangs up on the prospect */
const s2 = mem(); let r2 = 0;
ok(!reloadOnceForStaleChunk(s2, 5_000_000, () => { r2++; }, true) && r2 === 0 && s2.m.size === 0, 'C1. a call is live: no reload, and the guard time is not stamped');
ok(reloadOnceForStaleChunk(s2, 5_000_001, () => { r2++; }, false) && r2 === 1, 'C2. the call is over: the next failure reloads once');

/* Wiring */
const main = read('src/main.tsx'), lib = read('src/lib/staleChunk.ts'), app = read('src/App.tsx');
ok(/installStaleChunkRecovery\(\);[\s\S]*createRoot\(/.test(main), 'X1. recovery is installed before React mounts');
ok(/'vite:preloadError'/.test(lib) && /'unhandledrejection'/.test(lib) && /addEventListener\('error'/.test(lib), 'X2. Vite preload errors, rejected imports and error events are all caught');
ok(/isStaleChunkError\(error\) && reloadOnceForStaleChunk\(/.test(app) && /<StaleChunkScreen /.test(app) && /data-testid="stale-chunk"/.test(read('src/components/StaleChunkScreen.tsx')), 'X3. the error boundary reloads once, then shows a Reload screen');
ok(!/chunk_reload_at/.test(app), 'X4. the old 30-second handler (Chrome wording only) is gone: ONE rule');
ok(/reloadOnceForStaleChunk\(sessionStore\(\), Date\.now\(\), \(\) => win\.location\.reload\(\), autoReloadBlocked\(\)\)/.test(lib) && /reloadOnceForStaleChunk\(sessionStore\(\), Date\.now\(\), \(\) => window\.location\.reload\(\), autoReloadBlocked\(\)\)/.test(app), 'X5. both automatic reloads ask whether a reload must wait');
setCallState('connected'); const blockedOnCall = autoReloadBlocked(true); setCallState('idle');
ok(blockedOnCall && autoReloadBlocked(false) && !autoReloadBlocked(true) && !autoReloadBlocked(undefined), 'X5b. a reload waits while a call is live or the browser is offline; online (or unknown) and no call does not wait');
const iProv = app.indexOf('<LiveCallProvider>'), iPage = app.indexOf('<PageErrorBoundary>'), iRoutes = app.indexOf('<Routes>');
ok(iProv > 0 && iProv < iPage && iPage < iRoutes && /<ErrorBoundary resetKey=\{pathname\}>/.test(app), 'X6. the page error screen sits INSIDE the call provider, so a crashed or stale page cannot unmount the call');
const screen = read('src/components/StaleChunkScreen.tsx');
ok(/<StaleChunkScreen onCall=\{callIsLive\(\)\} \/>/.test(app) && /data-testid="stale-chunk-on-call"/.test(screen) && /data-testid="stale-chunk-back"/.test(screen) && /Reload and end the call/.test(screen), 'X7. on a call the screen offers Go back, and the reload button says what it costs');

/* Caching */
const headers = read('public/_headers');
ok(/\/\*\s*\n\s+X-Robots-Tag: noindex, nofollow\s*\n\s+Cache-Control: no-cache/.test(headers), 'H1. every page (index.html) is no-cache, robots rule kept');
ok(/\/assets\/\*\s*\n\s+! Cache-Control\s*\n\s+Cache-Control: public, max-age=31536000, immutable/.test(headers), 'H2. hashed assets keep a long cache');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
