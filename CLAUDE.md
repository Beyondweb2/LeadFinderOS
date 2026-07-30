# CLAUDE.md — read this fully before you touch anything

**You are starting blind. This file is the memory you don't have.** Read it end to end first. Then, when you
discover something that cost you time — a wrong assumption, a trap, a number — **add it here** instead of
letting the next session rediscover it. Correcting a line that has gone stale is also your job.

Facts and warnings, not prose. Keep it that way. If it grows too long to read, it stops working.

---

## 1. What the business is

- Paul sells **AI visibility** to local UK businesses. **£49.99, one-off.**
- Audit whether **ChatGPT and Gemini name them** when a customer asks for their trade in their town.
- Get them onto **the directories AI actually reads for that trade**.
- **Re-measure at 8 weeks**, with a **money-back guarantee**.
- **Zero paying customers so far.** Nothing here has been proven on a paying client yet. Do not write copy or
  code that implies it has.

---

## 2. How Paul works

- **He is non-technical.** He does ideation, scoping, plan review, product judgement. You write and run all code.
- **He never runs terminal commands.** Need SQL? **Hand it to him** — he runs it in the Supabase SQL editor.
  Never run SQL yourself, and never assume a migration file is live (see §6).
- **Shell is PowerShell**: `;` not `&&`. The Bash tool is Git Bash, separate syntax. Both are available.
- **Plain English, no jargon.** Lead with the answer. Questions at the very end.
- **Plan first, then stop** for a new piece of work. Once he approves, build the whole thing without stopping.
- **Hard stop and ask** before anything irreversible he hasn't already authorised: merges, pushes, SQL,
  deletions, payments, deploys, access changes. If the brief already authorises it, proceed.
- **Screenshots need him.** The in-app Browser pane does not display in this environment (`the Browser pane is
  not displayed, so the page is not compositing frames`). `read_page`, `get_page_text` and `javascript_tool`
  work fine without it — use text proof and say plainly that nobody has *seen* the thing.

---

## 3. The discipline checklist

Recon:
- [ ] Read the actual files before editing. Do not re-recon what a brief tells you is already verified.
- [ ] Grep to verify a list you were handed. Previous sessions got the reader list wrong three times.

Git:
- [ ] `git fetch origin`, then prove `origin/main == HEAD` **before** branching. Print both.
- [ ] Branch per task off `main`. Branches are kept, never deleted.
- [ ] Prove every git step with **real command output**, using **variables** (`$o = (git rev-parse origin/main)`)
      — never a hand-typed hash.
- [ ] Prove `origin` is still unmoved immediately **before** pushing.
- [ ] Commit with `-F <file>` (PowerShell mis-parses multi-line `-m`). End with:
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- [ ] Merge `--no-ff`.
- [ ] **Never stage `HANDOFF.md` or `ONBOARDING.md`.** Untracked on purpose. Stage files explicitly; never
      `git add -A` blind.

Checks:
- [ ] `npm run typecheck` — **baseline is 15 errors.** Flag any change from 15. Do not "fix" the 15.
- [ ] **`deno check --sloppy-imports` on EVERY changed edge function file.** Capture the exit code
      **directly**, not through a pipe — a pipe reports the pipe's status, not Deno's.
      **`npm run typecheck` does NOT cover `supabase/functions`.** That gap put checkout down for 15 hours.
- [ ] `generate-barber-site` has 3 **pre-existing** supabase-js generics errors (~lines 59/693/895). Prove
      pre-existing with `git stash` + re-check. Don't fix them.

Deploy:
- [ ] Edge functions **do not auto-deploy**: `npx supabase functions deploy <name>` by hand.
- [ ] **Redeploy every function that imports a shared module you changed**, and prove each one. They keep
      running old code until you do.
- [ ] SPA auto-deploys on push to `main` (Cloudflare Pages).

---

## 4. Things that have misled you — read before claiming anything is verified

**The deploy check.** Only this sequence is trustworthy:
1. Fetch the **live HTML** and read the chunk name out of it.
2. Fetch **that exact chunk** by name.
3. Assert a **marker string from your own change** is present in it.
4. Retry **once** — production can lag ~90 seconds.

And the traps around it:
- **Comparing a local build hash to a live hash is invalid** across build environments. Same source can hash
  differently. Use it as a hint, never as pass/fail. Step 3 above is the real assertion.
- **A cache-buster query string can return a STALER file than a plain fetch.** Don't add one.
- **The entry chunk name does not reliably change when a route chunk does**, and vice versa. A lazy route lives
  in its own chunk — check the one your code is actually in.
- Chunk *byte size* changing is decent evidence; identical size with a new hash usually means only the
  referenced child-chunk hashes moved.

**Substring false positives. You have been fooled by both of these twice each:**
- `"bing"` matches **plum*bing***.
- `"acca"` matches **M*acca*-Gas**.
- Use word boundaries (`/\bACCA\b/`) or match a distinctive full token. When a check comes back positive,
  print the surrounding characters before you believe it.

**Not being able to see something is not evidence it isn't there.**
- The **anon key cannot read most tables** — RLS returns **HTTP 200 with `[]`**, not an error. An empty result
  proves nothing about the data.
- Grep output in this environment sometimes **path-mangles matched lines** — `path="/playbook/:id"` displayed as
  `path="\playbook:id"`, and `{/*` as `{\*`. **Never conclude code is broken from grep output alone.** `Read`
  the file.

**The mistake you keep making: reasoning from one layer without checking the next.** Real examples:
- "No address is stored" — the insert writes one.
- "`place_id` isn't available" — it's populated on **758 of 758** leads.
- "This choke point covers all paths" — **two callers pass the town in as an argument**, so a fallback there
  fixes nothing.
- Fix: before asserting what a function receives, read its **callers**. Before asserting a column is empty,
  read the **writer**.

---

## 5. Established findings — what actually works

Facts with numbers. These are measured, and several contradict the older docs.

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two different levers.
- Across **76 audits**: ChatGPT names the client **~17%** of the time, Gemini **~2.5%**.
- **Being cited is not being named.** ABLM is on Yell's Wisbech page and was named **0 times in 80
  measurements**.
- **Directories are trade-specific, and only citations can tell you which:**
  - Checkatrade — **657 citations across 57 of 58 plumber audits**, and **ZERO** for accountants.
  - Yell works for **both**.
  - Hospitality is **Tripadvisor and Wanderlog**.
- **A business with no website cannot be named by Gemini at all** — it has nothing of theirs to read.
  MK Plumbing: 0/10 on Gemini, 3/3 on ChatGPT via directories.

**TESTED AND NEGATIVE — never present these as levers:**
| Lever | Result |
|---|---|
| Website quality | Firms Gemini names have **WORSE** sites than our clients |
| Schema markup | **35% vs 32%** — no difference |
| Reviews | Three named businesses have **0–1 reviews** |
| Bing Places | **Zero citations across all 8,913** |

- **The only supported lever:** presence in the sources AI reads **for that trade**, plus **a website where
  there isn't one**.
- **No before-and-after has ever been measured.** ABLM and Paul's pool bar are the first two. Any claim about
  outcomes is unevidenced.

---

## 6. Architecture rules that must not be broken

- **Never add a `trade` (or `trades`) field to `DirectoryFact`** (`src/lib/directoryFacts.ts`).
  *Why:* the moment a fact says "Checkatrade is for plumbers", the file becomes the hardcoded list the evidence
  layer exists to replace — and it would be wrong by construction, because Checkatrade has 657 citations for
  plumbers and zero for accountants. That is a fact about the **evidence**, not about Checkatrade.
- **Facts are per-host. Evidence is per-trade. The join can only SUBTRACT.**
  Citations decide *which* hosts matter. `directoryFacts` only says *what a host is* and *who may action it* —
  things you can only learn by visiting the site. A fact may remove or downgrade a host the evidence surfaced.
  It may never add one. `townOnly` is legitimate on that test (geographic scope of the site); `trade` is not.
- **Unknown hosts route to WHO'S WINNING, never to tasks.** An unclassified host is almost always a
  competitor's own site. Surfacing it as intelligence means a new competitor appears automatically with no
  entry to write; making it a task would invent work.
- **No winnability scoring anywhere.** It reads a single run, and competitor lists differ between runs, so its
  output flips between identical inputs. Counts only.
- **No outcome promises in anything customer-facing.** Say what was measured, what was done, and what changed.
- **Migrations are applied BY HAND** in the Supabase SQL editor — `supabase db push` is broken (history
  desynced). A migration file existing does **not** mean it is live. For DB functions, check the live
  definition: `select pg_get_functiondef('public.<fn>'::regproc);`
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`.** `isSentStatus` and
  `isRepliedStatus` in `src/types/outreach.ts` are traps for aggregates. **`paid` means `amount_paid > 0`,
  everywhere.**
- **Paginate PostgREST reads** — it truncates at `db-max-rows` silently. Use `src/lib/fetchAllRows.ts` with
  `.order('id')` as a unique tiebreaker.

---

## 7. Parked and unmerged — do not merge these

| Branch | Hash |
|---|---|
| `edge-check-gate` | `d3fd6713` |
| `findable-product-rename` | `a8365707` |
| `short-signup-url` | `c8896003` |

---

## 8. Known open problems — don't rediscover these

- **Audits use the SEARCHED town, not the real town.** Lead search has a radius, so a Huntingdon locksmith came
  back from a Wisbech search and was told AI doesn't know he exists — he ranks first in his own town. He caught
  it. Spec is ready; **not built**.
  - `outreach_leads.place_id` is populated on **758/758**; `address` on **0**.
  - `getPlaceDetails()` is restorable from `a8fd7003^`.
  - Town extraction is reusable as-is at `generate-barber-site:307-310` (UK `postal_town` → `locality` →
    `administrative_area_level_2`).
  - **`bulk-jobs:229` and `whatsapp-inbound:226` BUILD `location_text` themselves and pass it in**, so
    `create-ai-audit` must treat an incoming value as **overridable**, not merely fall back when absent.
    Intended precedence: `confirmed_location || derived_town || search_location`.
- **37 reports already went out with the wrong-town problem.**
- **No Baseline Test button.** Baselines are gated to internal callers (cron secret or service role +
  `x-internal-job`) and currently only start from `stripe-webhook` after payment. A button needs an
  authenticated path. Cost: 10 questions × 3 runs × $0.0498 ≈ **$1.50**.
- **The three-question-type split isn't built** (own town / what makes them unique / surrounding towns).
- **Lead type/location are NOT reliably on the lead.** No `business_type`/`city` columns; audits read
  `search_keyword||category` and `search_location||address`, populated on only **~20%** of leads.
- **The Browser pane doesn't display** — screenshots need Paul (see §2).
- **`/playbook/:id` is not linked from anywhere yet** and has no back link. Partial work is stashed:
  `git stash list` → *"WIP playbook nav links"*.
- **WHO'S WINNING** is capped at top 20 with a count of the rest; uncapped it was 181 rows for a plumber.

---

## 9. Where the AI-visibility code lives

| Thing | Path |
|---|---|
| Evidence fold (pure, no LLM) | `src/lib/buildPlaybook.ts` |
| Host facts, hand-maintained | `src/lib/directoryFacts.ts` (66 hosts) |
| Per-trade citation fold | `supabase/functions/playbook-evidence/` |
| Operator checklist page | `src/pages/Playbook.tsx` + `src/hooks/usePlaybook.ts` |
| Printable document | `src/lib/playbookDoc.ts` + `src/lib/playbookDocStyle.ts` |
| Baseline operator view | `src/pages/Baseline.tsx` + `src/lib/baselineView.ts` |
| Audit UI (large) | `src/pages/AiAudit.tsx` |

- Thresholds: `EVIDENCE_MIN_AUDITS 5`, `THIN_MIN_AUDITS 2`, `TRADE_MIN_AUDITS 5`.
- **`usePlaybook` resolves an id as an AUDIT id first, then a lead.** ABLM has an audit and no
  `outreach_leads` row; lead-first would 404 the only delivery client.
- **63 of 66 signup URLs are unverified.** Only Yell, MyBuilder, 192.com and Checkatrade have been checked.
- **`playbookDoc.ts` must never touch the `generate-playbook` LLM path.** That pipeline recommended ICAEW to an
  ACCA firm, ACCA's own zero-citation directory, and Bing Places. Styling is shared; the data path is not.
- Live operator app: **`https://leadfinderos.pages.dev`**. Supabase ref **`ruusxpkkmwtljxxulhbq`**.

---

## 10. The other docs, and how much to trust them

- **`ONBOARDING.md`** and **`HANDOFF.md`** (untracked, never stage them) describe the **older
  website-generation product line** — barber/salon/plumber site generation, WhatsApp claim flow, Stripe
  add-ons. Still accurate for that machinery, and the best map of it.
- ⚠️ **`HANDOFF.md` §5 is superseded.** It calls Bing Places "foundational" and recommends it. Bing Places has
  **zero citations across 8,913**. §5 of this file wins.
- Both name `Claude Opus 4.8` in the co-author trailer. **Use Opus 5** (§3).
- There is **no `DEPLOY.md`** in this repo. Deploy rules are §3 and §4 here.
