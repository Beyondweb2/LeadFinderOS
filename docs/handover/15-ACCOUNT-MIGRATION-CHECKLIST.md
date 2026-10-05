# 15 — Account migration checklist (for Paul, today)

*Short and practical. ✅ = already true when this handover was written (2026-10-05). ☐ = yours to do.*

## Good news first

Cancelling the Move37 **Claude** account does **not** delete anything on this PC or in GitHub, Supabase, Cloudflare,
Stripe or Meta. The code, the worktrees, the local files and every service keep running. What disappears is the old Claude
chat history and the old account's sign-in. Everything a new Claude needs to understand the system is now in the repo
(`docs/handover/` + `CLAUDE.md` + `docs/`).

## BEFORE THE OLD ACCOUNT DISAPPEARS

- ✅ **Latest `main` is on GitHub** (`Beyondweb2/LeadFinderOS`), including this handover folder.
- ✅ **The branches that matter are pushed.** Every release branch is on GitHub. The only local-only branch is
  `feat/forecast-nextaction-crawl` (one commit from 2 Oct, probably superseded) — it stays on this PC's disk regardless.
- ✅ **These handover files are committed and pushed** (`docs/handover/`).
- ✅ **No secrets are stored in the repo** (scanned today). Secrets live in Supabase / Cloudflare / provider dashboards.
- ☐ **Save the bootstrap prompt outside Claude** — copy the box in `docs/handover/14-NEW-CLAUDE-BOOTSTRAP-PROMPT.md` into a
  note or email it to yourself.
- ☐ **Export any irreplaceable old Claude chats** if the account lets you (claude.ai → Settings → export data). The decisions
  that matter are already written into `docs/`, so this is a safety copy only.
- ☐ **Decide which GitHub account the new setup will use.** The repos belong to `Beyondweb2`; commits on this PC are signed
  as Paul `beyondwebcraft@outlook.com`. Make sure you can sign in to GitHub as `Beyondweb2` (or that your own account is a
  member with write access).
- ☐ **Make sure Cloudflare and Supabase access don't depend on the old Claude account.** They don't directly — but check you
  can sign in to:
  - **Supabase** (project `ruusxpkkmwtljxxulhbq`) with your own login;
  - **Cloudflare** — BOTH accounts: "Paul@move37.fun's Account" (findable.live) and the `beyondwebcraft` account (client
    sites), plus whichever account holds `leadfinderos-next` (app.leadfinderos.com).
- ☐ **⚠️ The move37.fun dependency (bigger than Claude).** If the move37.fun email or accounts might also go away, these
  need moving first:
  - findable.live email routing forwards **paul@findable.live → paul@move37.fun** (Cloudflare Email Routing);
  - findable.live's Cloudflare account is **"Paul@move37.fun's Account"**;
  - your operator login to app.leadfinderos.com is **paul@move37.fun**;
  - WhatsApp runs on **Move37's Meta app** (the Findable Meta setup is still pending);
  - Google Business Profile manager invites accepted on paul@move37.fun before 2 Oct.
- ☐ **Secrets live in their proper platforms, not in chat history** — Supabase Edge Function secrets and Vault, Cloudflare
  build settings, the provider dashboards (Stripe, Meta, Apify, OpenAI, Google, Resend, Companies House). Nothing needs
  copying out of Claude. If you ever pasted a key into a Claude chat, treat it as exposed and rotate it in its own dashboard.

## AFTER THE NEW ACCOUNT IS CREATED

- ☐ Install / sign in to the **Claude desktop app** with the new account (Code tab).
- ☐ **Open the folder `C:\Users\paulj\LeadFinderOS`** in a new Code session (or clone `Beyondweb2/LeadFinderOS` fresh).
- ☐ **Paste the bootstrap prompt** (`14-NEW-CLAUDE-BOOTSTRAP-PROMPT.md`).
- ☐ **Let the new Claude read the handover** and give you its summary. Correct anything it got wrong.
- ☐ **Re-connect the tools the new Claude will need** (it will ask as it goes — approve them yourself):
  - Supabase CLI login on this PC (`Supabase CLI:supabase` in Windows Credential Manager) — the existing one may simply keep
    working, since it is stored on the PC, not in Claude;
  - GitHub push access from this PC (already set up through git on this machine);
  - wrangler (Cloudflare) logins — stored on the PC;
  - any claude.ai connectors you used (none are required for LeadFinderOS).
- ☐ **Only then start new work.** Suggested first task: re-check the open actions in
  `12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` against the live system.

## Still on your list regardless of the account move

1. Raise the Apify monthly cap to ~US$150 (it is US$40).
2. Open the four admin screens once on app.leadfinderos.com.
3. Approve the results-email copy.
4. Stripe: deactivate the two old Payment Links; check MCL's Stripe customer.
5. Finish the Findable Meta / WhatsApp setup and get the exact App Secret.
