# How Paul works — the original §2

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §2 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: The Management-API token is NOT at `~/.supabase/access-token` on this Windows machine. The Supabase CLI keeps it in **Windows Credential Manager** (`cmdkey /list` → `Supabase CLI:supabase`); CLAUDE.md §2 has the working route.

## 2. How Paul works

- **He is non-technical.** He does ideation, scoping, plan review, product judgement. You write and run all code.
- **He never runs terminal commands.**
- ✅ **YOU CAN RUN SQL YOURSELF, AND PAUL ASKED YOU TO (2026-09-10).** His instruction: *"if there
  is ever an SQL to run, either you run it yourself if possible, or give it to me to run so I can
  copy and paste it."* **The supersedes the old "never run SQL yourself" rule.**
  - **How:** `POST https://api.supabase.com/v1/projects/<ref>/database/query` with
    `{"query": "..."}` and `Authorization: Bearer <token>`, where the token is read AT RUN TIME
    from `~/.supabase/access-token` (the Supabase CLI's own login). Returns 201 and a JSON array.
    ⛔ **Read the token inside the script; never echo it, never write it to a file.**
  - ⚠️ **THIS CONTRADICTS THREE OLDER NOTES THAT SAID IT WAS IMPOSSIBLE.** There is no `psql`, no
    SQL-execution RPC (`exec_sql` and four other names all 404), and `db push` needs the database
    password and is broken anyway — all true, and all about the *other* routes. The Management API
    was never tried. Verified 2026-09-10 by running the `ai_audits.archived_at` migration.
  - ⛔ **STILL STOP AND ASK BEFORE ANYTHING DESTRUCTIVE.** Being able to run SQL is not permission
    to drop, truncate, delete or rewrite rows. Additive and idempotent DDL (ADD COLUMN IF NOT
    EXISTS, CREATE INDEX IF NOT EXISTS) is what this is for. Anything else: show him first.
  - **Always verify afterwards by reading the schema back**, not by trusting the 201 — and say what
    you verified. A migration that "ran fine" while the code still cannot see a column is a
    recorded failure mode (§6).
  - If it ever fails, fall back to his stated second preference: **hand him the SQL in one
    copy-pasteable block** for the Supabase SQL editor.
- **Never assume a migration file is live** (see §6).
- **Shell is PowerShell**: `;` not `&&`. The Bash tool is Git Bash, separate syntax. Both are available.
- **Plain English, no jargon.** Lead with the answer. Questions at the very end.
- **Plan first, then stop** for a new piece of work. Once he approves, build the whole thing without stopping.
- **Hard stop and ask** before anything irreversible he hasn't already authorised: merges, pushes, SQL,
  deletions, payments, deploys, access changes. If the brief already authorises it, proceed.
- **Screenshots need him.** The in-app Browser pane does not display in this environment (`the Browser pane is
  not displayed, so the page is not compositing frames`). `read_page`, `get_page_text` and `javascript_tool`
  work fine without it — use text proof and say plainly that nobody has *seen* the thing.
- **There is no browser session at `localhost:8080`**, and RLS blocks the anon key, so an authed page cannot be
  loaded the normal way. What works: pull the service-role key from the linked Supabase CLI
  (`npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json`), run a **throwaway Vite
  harness** that patches `window.fetch` to attach it for Supabase URLs only, and mount the real page in a
  `MemoryRouter`. Real hook, real component, real rows; only auth and the router shell are substituted.
  Read-only, delete the harness before committing, and **tell Paul you used the service key**.
  If the harness fakes router history, make the fake previous entry match the case under test — a hardcoded one
  gives a real-looking but wrong destination.

---

