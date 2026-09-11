# HANDOVER — the per-prospect mockup build

Written 2026-09-11 ~01:40, immediately before Paul hibernated the PC.
Everything below was verified in-session, not recalled. Where a thing is *unproven*, it says so.

---

## 0. THE ONE THING BLOCKING PROGRESS

**Who owns the template derivation logic.** Paul's real locksmith template
(`C:\Users\paulj\Locksmith_Template\templates\locksmith.html`, 43,769 bytes) renders correctly
through this repo's engine — but its **19 derived variables** are computed by *his other
session's* `src/render.mjs`, not by anything in this repo.

Re-implementing that in TypeScript means two copies of the same logic in two repos, which this
project has four recorded incidents of. **Recommendation on the table: this repo owns the
derivation, and the other session builds from the repo copy.** The alternative (his repo stays
the source, called as a build step) cannot work — the mockup must render inside a Supabase edge
function.

Nothing else should be built until that is decided.

---

## 0b. THE COMPOSITE — STOPPED ON PAUL'S CALL, 2026-09-11

⛔ **STOPPED DELIBERATELY, AND IT IS NOT A BLOCKER.** Paul built a single ABLM example VIDEO he
sends to everyone. It costs nothing per prospect and answers the question that actually matters
first — whether a rebuild offer gets any interest at all. A personalised asset is premature until
that is known. **Do not restart this without him saying so.**

### What the composite was going to be (his spec, superseded but recorded)
Their business name at the top, their own site screenshot on the left, ABLM's finished site on the
right labelled honestly as "A site we built for a client" (NOT "what we would build for you" —
ABLM is an accountancy firm), then the ABLM before/after search proof, a benefits list, the price
and his contact card.

### What is already BUILT and reusable
- **Their screenshot** — `action: "shot"` on the `mockup` function, via Cloudflare Browser
  Rendering, stored in the private bucket and returned signed as `current_site_url`. Proven
  byte-identical across three runs.
- **The ABLM site screenshot** — nothing needed from Paul. `ablm.co.uk` shoots cleanly through the
  same pipeline (`npx tsx scripts/shoot-mockup.mts`), which is BETTER than him exporting one
  because both panels then share a viewport and need no cropping.
- **The layout step** — a browser render of an HTML page, screenshotted. Measured at ~1.6s for a
  realistic four-image asset producing a 1,036KB PNG.
- **The Meta upload** — measured, see §4d. Not a constraint.

### What is LEFT to do
1. **The two ABLM search-proof PNGs.** Only Paul has these — they are ChatGPT/Gemini answers, not
   a website. Needed shape: PNG, **≥1200px wide**, cropped to the answer with NO browser chrome,
   and **both the same width and roughly the same height** or one has to be cropped to match.
   Destination `public/proof/`.
2. **His contact card details** — name, number, whatever goes on it. Nowhere in the codebase.
3. 🔴 **AN ANSWER ABOUT ABLM.** The asset visibly identifies them — logo and name in both the site
   shot and the search results — even though the label only says "a client". **Are they happy to
   be a public reference?** That is a conversation with them, not a code question, and it should
   happen BEFORE 185 prospects see it.
4. The composite layout itself, and the price read from **`FINDABLE_SETUP_PRICE_GBP`** — never
   typed, it is byte-locked across both repos by `scripts/check-cross-repo-sync.mjs`.

### Measured end-to-end, so the volume question is already answered
| step | measured |
|---|---|
| `get` (row + lead + signed URLs) | 3.1s ⚠️ slower than it should be for a read plus two signings |
| `shot` (Cloudflare) | 9.0s round trip, 5.3s of it Cloudflare's own render |
| compose + screenshot | ~1.6s |
| **cold total** | **≈14s** |

⚠️ **14s is the wrong number for planning.** The screenshot is taken once per prospect and can
happen on reply, so at send time it is **`get` + compose ≈ 5s**. Machine time is not the
constraint — 185 assets is under an hour of compute. The operator reviewing each one and the
WhatsApp daily cap are.

---

## 1. WHERE THE BUILD IS, BY STEP

| Step | State |
|---|---|
| 1. RLS prerequisite | ✅ **Done, proven empirically.** `generated_sites` drafts are NOT anon-readable (anon sees exactly the 93 published of 105). The old `barber-site-images` bucket IS world-readable, which is why mockups use the private `mockup-assets` bucket. Anon re-checked against a real object: public path → `NoSuchBucket`, anon key on a real path → `NoSuchKey`, anon LIST → `[]`, anon `createSignedUrl` → refused. |
| 2. Reply trigger | ✅ **Built and deployed.** `_shared/mockup-trigger.ts` + two call sites inside `_shared/whatsapp-inbound.ts`'s existing guard chain, so it inherits all seven guards. Creates a `draft` row, awaits one insert, hands the scrape to `EdgeRuntime.waitUntil`. **Sends nothing.** ⚠️ **Never yet seen fire on a real inbound reply.** |
| 3. The picker | ✅ **Built and deployed.** `/mockups` (waiting list) + `/mockups/:id` (place images). Maps-first pool, score-to-sort, never auto-place. |
| 4. Own-site images | ✅ **Done**, folded into `scan-site-details` (one fetch, two gpt-4o-mini prompts). |
| 5. Renderer | ✅ **Engine done and tested** (`src/lib/mockupRender.ts`, four constructs, no raw-HTML construct). ⛔ **NOT wired to a page.** See §2. |
| 6. Scrape adaptation | ✅ **Done and deployed.** NAP + areas + services + own-site images + social links in one pass. Cache key `site_details_v9`. |
| 7. Screenshots | ✅ **Done locally, under Playwright.** Byte variance fixed and proven. ⚠️ **Not server-side** — needs a Cloudflare token. |
| 8. Composite PNG | ⛔ **Not started, deliberately.** Paul: "There is no point compositing an asset I cannot send." |

### The thing that surprised us in Step 5
**`/mockups/:id` has never rendered a template.** It only calls `slotsIn()` to learn which slots
to show; there is no `renderPage` call anywhere in `src/`. The only thing that has ever rendered a
mockup is `scripts/shoot-mockup.mts`. So this is a *missing* render path, not a mis-pointed one.

Related, and it must not be forgotten when wiring: **`business.trade` is not stored on the mockup
row**, and `renderPage` refuses without it. It must come from
`MOCKUP_NICHES[<key>].trade` (already correct, title case, e.g. `"Locksmith"`) at render time —
never from the row.

---

## 2. DEPLOYED LIVE vs COMMITTED ONLY

**Edge functions do not auto-deploy. The SPA does, on push to `main`.**

### Live right now (verified from the platform, 2026-09-11 01:40)
| Function | Version | verify_jwt | Deployed |
|---|---|---|---|
| `mockup` | **v10** | **true** | 2026-09-11 01:34 |
| `scan-site-details` | **v27** | false | 2026-09-11 01:00 |
| `whatsapp-status` | **v62** | false | 2026-09-10 22:59 |

`whatsapp-inbound.ts` is a shared module, not a function; its consumer is `whatsapp-status`.
Today's only change to it was **a comment fix**, so no redeploy is required.

### SPA
`origin/main` = **`52be3123`**, and Cloudflare Pages has built it. Verified live by marker:
`/mockups` and `/mockups/:id` are real `Route` elements in `assets/index-De2h4Y0U.js`.

### 🔴 COMMITTED BUT NOT PUSHED — ONE COMMIT
```
0a039b93  A plumber must not get the locksmith template
```
SPA-only (`src/pages/Mockups.tsx` + `scripts/shoot-mockup.mts`). **Left unpushed on purpose:**
pushing auto-deploys the SPA, and shipping a UI change while nobody is watching is worse than a
local commit. Push when ready:
```bash
cd /home/paulj/projects/LeadFinderOS && git push origin main
```

---

## 3. OPEN DECISIONS WAITING ON PAUL

1. 🔴 **Who owns the derivation logic** — see §0. Everything is blocked on this.
2. **May the template be copied into the repo**, to `src/mockup/templates/locksmith.html`
   (replacing the deliberately-plain reference one), and **which session owns it afterwards**?
   Not done unilaterally: the other session owns that file and both sessions share one working
   tree.
3. **Four template fields have no honest source.** The template already has absent-case branches
   (`{{#if fee.unknown}}`, `{{#if business.no_owner_name}}`, `{{#if prices_none}}`), so the
   question is only whether Paul accepts that a prospect mockup normally renders *without* the
   owner section, response times and price table:
   | Field | Source |
   |---|---|
   | rating, review_count, postcode, phone, address, email, google_reviews_url | ✅ real, on the lead |
   | services, areas | ✅ real, from the scrape |
   | hours | ⚠️ Starr Keys yes, First4locks no |
   | **prices** | ❌ First4locks' scrape found 12 services and **zero** prices |
   | owner_first_name, owner_bio, established, years | ❌ no source anywhere |
   | response_time, area_times | ❌ no source |
   | **dbs_checked, mla_member, no_callout_fee** | 🔴 **claims about the business.** Asserting these without evidence invents a credential — "never claim MLA" is already on RG Locksmiths' must-not-say list |
4. **A Cloudflare API token**, if screenshots are to run server-side on a reply. Without it they
   can only be produced by hand, one prospect at a time.
5. **Refresh pool on First4locks, then RE-PLACE the hero.** The currently placed hero was rehosted
   from a `w_146,h_98,blur_2` Wix URL at **3,858 bytes**; Starr Keys' `work` slot is 2,336 bytes.
   Re-gathering alone does **not** replace an already-placed slot. Starr Keys' pool is already
   correct (all 17 thumbs at 420px).
6. **Small**: the H1 wraps to three lines because it uses the Google listing name
   *"First4locks Ltd - Locksmiths Speke"* — a separate display-name field may be worth it. And the
   trust strip's "Non-destructive entry / Price agreed before work starts" is fixed template copy
   that does assert something about how they work.

---

## 4. THE THREE CAVEATS — read these before trusting anything above

### 4a. ✅ RESOLVED: the mockup used to lose to their real site
With the **reference** template it lost badly, and Paul's verdict was "I would never send this".
Cause was wiring, not design: that template is deliberately plain, and the real one had never been
rendered. Driving Paul's real template with First4locks' real data, it **wins comfortably** — dark
hero, name at size, spec panel with Google rating 5/5, 288 reviews, postcode.

⚠️ **But that PNG was produced by a script calling the OTHER session's renderer.** Nothing in this
repo can produce it yet. Until §0 is decided, the good-looking asset is not reproducible by the
product.

### 4b. ⚠️ UNTESTED: chat-widget hiding
`HIDE_SELECTORS` covers Intercom, Tidio, HubSpot, Drift, Crisp and Tawk — **and not one of the six
test locksmith sites runs a chat widget**, so that half of the list has never fired against a live
example. Cookie banners *are* proven (and the Wix one was missed on the first attempt: Wix names it
`data-hook="consent-banner-root"` with no "cookie" anywhere in the markup, which is why a bounded
behaviour heuristic was added as a second layer).

### 4d. ✅ MEASURED: the Meta media upload is not a constraint
A **1,458,137-byte PNG** uploaded to the WhatsApp Cloud API in **1,923ms** and **2,175ms** on two
runs, returned a media id, and deleted cleanly (HTTP 200 both times). So a ~1MB asset is well
inside what the image-header path will take, and the upload adds about **2 seconds** to a send.
- Exercised by **`action: "media_probe"`** on the `mockup` function. ⛔ **It uploads and DELETES
  and it cannot send** — there is no message-send code in that branch. Same reasoning as
  instantly-push's `auth_probe`: the only honest way to measure a path is to exercise it, and
  every other way of finding out involves messaging a real prospect.
- ⚠️ **Meta's 5MB image ceiling and the 30-day media lifetime are DOCUMENTED, not measured here.**
  Only the 1.46MB case was actually tested.
- ⚠️ Nothing in the codebase sends an image-header template yet — `whatsapp-send.ts` has no image
  header and no template is registered with one. The upload works; the SEND is unbuilt.

### 4c. ⚠️ NOT MEASURED: Cloudflare browser-seconds
**There are no Cloudflare credentials on this machine**, so screenshots ran locally under
Playwright. Local wall clock: their site **8.9–12.2s**, the mockup **3.2–5.0s**. No per-second cost
figure has been quoted, deliberately — four cost constants in this project have already been wrong
because they were copied from a price list instead of a billed row.

### And a fourth, worth carrying forward
**Four "findings" this build turned out to be measuring my own tooling, not the world:**
the blurry photos (my harvester, not their photography); "three of six have no hero-capable photo"
(really two of six — RL Locksmiths went 0 → 5 on the fix alone); a Starr Keys screenshot speedup
that was purely a warm CDN cache; and the lowercase "locksmith in Liverpool" heading, which was a
hardcoded value in my own screenshot harness while the registry was correct all along.
**Be sceptical of clean results.**

---

## 5. HOW TO RESUME — exact commands

```bash
cd /home/paulj/projects/LeadFinderOS

# 1. Where things stand
git fetch origin && git log --oneline -3 && git status --short
#    expect: HEAD 0a039b93, origin/main 52be3123, only HANDOVER_NEXT.md untracked

# 2. Full check (typecheck vs baseline + build + tests). Baseline is 9 errors; 81 suites.
npm run check

# 3. The dev server (it does NOT survive hibernation)
npm run dev            # serves on :8080
```

**The picker, opened from Windows:**
```
http://localhost:8080/mockups
http://localhost:8080/mockups/bf7cc4d1-6be6-495b-84c6-2cb4e04a7a15   # First4locks
http://localhost:8080/mockups/dece7d50-3c1b-4f13-a39e-d85da36961fe   # Starr Keys
```
⚠️ **`localhost` works from Windows; `127.0.0.1:8080` does NOT** (measured with Windows'
own `curl.exe`: HTTP 200 vs HTTP 000). The WSL IP also works but changes on reboot.

**The last PNG Paul approved** (short path, his terminal truncates long ones):
```
file:///C:/shots/f4l.png
```

**Re-take the screenshots:**
```bash
# Playwright is installed GLOBALLY and node_modules symlinks are needed for ESM to find it.
# They live in node_modules (untracked) and may not survive a clean install:
G=$(npm root -g); for m in playwright playwright-core; do [ -e "node_modules/$m" ] || ln -s "$G/$m" "node_modules/$m"; done

# prove byte consistency across three runs per site
npx tsx scripts/shoot-mockup.mts --consistency

# rebuild the side-by-side PNG (reference template)
npx tsx scripts/shoot-mockup.mts --compose /mnt/c/shots/spec.json

# rebuild it with Paul's REAL template (drives the other session's renderer; read-only on it)
node /tmp/.../scratchpad/build-real.mjs   # ⛔ SCRATCHPAD — gone after a reboot, see below
MOCK_HTML="file:///mnt/c/shots/real/index.html" npx tsx scripts/shoot-mockup.mts --compose /mnt/c/shots/spec.json
```
⚠️ **`build-real.mjs` and `q.mjs` live in the session scratchpad and will NOT survive the
reboot.** They are small: `q.mjs` POSTs a query to
`https://api.supabase.com/v1/projects/ruusxpkkmwtljxxulhbq/database/query` with the token read at
run time from `~/.supabase/access-token`; `build-real.mjs` imports `buildData`, `renderTemplate`
and `wrapDocument` from `C:\Users\paulj\Locksmith_Template\src\render.mjs` and feeds them
First4locks' real row. Both are trivial to rewrite — and rewriting `build-real.mjs` becomes
unnecessary once §0 is decided.

**Files that matter, in this repo:**
```
src/lib/mockupRender.ts                 the substitution engine (4 constructs, tested)
src/lib/mockupNiche.ts                  the niche registry (trade: "Locksmith" lives here)
src/lib/mockupStock.ts                  the curated stock set; hero is real-or-nothing
src/pages/Mockups.tsx                   the picker
src/mockup/templates/locksmith.html     the PLAIN reference template (to be replaced)
supabase/functions/_shared/mockup-*.ts  trigger / pool / rehost
supabase/functions/_shared/image-variant.ts     the LQIP + srcset fix
supabase/functions/_shared/screenshot-policy.ts the shot policy (driver-agnostic)
scripts/shoot-mockup.mts                the Playwright driver
scripts/{image-variant,screenshot-policy,mockup-render}.test.ts
```

---

## 6. STANDING RULES THAT APPLY TO THIS WORK

- **Nothing is ever published.** No published rows, no live sites, noindex everywhere. The asset is
  a PNG sent by hand on WhatsApp.
- **No invented business data, anywhere.** A missing field degrades gracefully; it is never a
  plausible guess. This is why §3.3 is a decision and not a default.
- **Stock never goes in the hero.** Below the fold only, generic-and-true captions, never captioned
  as their own work and never naming the owner or town. Enforced server-side
  (`stock_not_allowed_in_slot`).
- **Score to sort, never auto-place.** There is no `assignSlots()` and there must not be one.
- **Change what an extractor returns → bump its cache version.** This was broken once and cost a
  confusing 35 minutes; the key is now `site_details_v9`.
- **Two sessions, one working tree.** Agree a file boundary, never switch branches, never
  `git add -A`.
