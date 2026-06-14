# Salon Dashboard — build spec

## Goal
Give salon owners the SAME dashboard experience barbers have today, with a LIGHT theme (barber is dark) and salon-specific content/fields. Reuse the barber dashboard wherever possible — do NOT build a parallel system. One engine, two themes.

## Branch / rules
- New branch off main: feature/salon-dashboard. git fetch first, confirm remote LeadFinderOS. Don't merge. Build green after each step (tsc + npm run build), self-correct failures.
- Do NOT change/regress the barber dashboard or barber sites — barber must stay byte-identical. Confirm with git diff.
- Do NOT touch the email/enrichment work.

## STEP 0 — Recon first (read-only, before building)
Read how the barber dashboard works today and report briefly inside the build, then proceed:
- The barber app shell (BarberShell, sidebar nav: Dashboard/Calendar/EditSite/Settings) and how it routes.
- The editor components (SiteEditor, BookingsManager, StaffManager, WeekCalendar) — are they barber-hardcoded or content-driven?
- How is "is this a barber" determined (auth, a barber row, the generated_sites.template column)?
- What salon content fields exist (treatments grid, story, gallery, hours, accent colour) vs what barber edits.
Decide: which barber components can be reused as-is, which need a light theme + salon fields, and which (if any) need a salon-specific version. Build to that decision.

## What to build
1. A salon dashboard that mirrors the barber shell: same nav structure (Dashboard / Calendar / Edit Site / Settings), same no-reload behaviour, same booking + calendar functionality.
2. LIGHT theme to match the salon site (barber is dark near-black + amber; salon is the lighter Sophistikaty-style look — blush/cream, serif headings, black CTAs). Theme the shell to match the salon template, NOT the barber.
3. Salon owners can edit: treatments (the editable categories/cards — add/edit/remove, titles, descriptions, photos), the story section, gallery images, opening hours, contact details, accent colour, publish/unpublish. Match the barber editor's level of control, adapted to salon fields.
4. Add any salon-specific sections the barber shell doesn't have but the salon template needs (e.g. treatments manager). Keep everything else identical in behaviour to barber.
5. Route salon owners to the salon dashboard (and barbers to the barber one) based on their site's template, reusing the existing ownership/login flow — don't build a new auth.

## Acceptance tests (loop must pass all before done)
1. tsc clean + npm run build green.
2. A salon-template owner lands on the SALON dashboard (light theme); a barber owner still lands on the barber dashboard (dark) — unchanged.
3. Salon owner can edit treatments/story/gallery/hours/contact/colour and publish — changes show on their public salon site.
4. Booking + calendar work for salon the same way they do for barber.
5. Barber dashboard + barber sites are byte-identical (git diff clean on barber files).
6. Email/enrichment files untouched.

## Out of scope
- No real payment/subscription changes. No new auth system. No merge to main.
