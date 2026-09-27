# Inbox: WhatsApp media for Sales, full-height layout, outbound attachments (2026-09-27)

Branch `fix/sales-inbound-media`, merged to `main` as `38327ac0`. Three pieces, one branch.

## 1. Sales can open WhatsApp media (inbound and ours)

- **Why it failed:** every file in the private `whatsapp-media` bucket sits under the BOOK OWNER's folder
  (inbound: `<lead owner>/<sha256(wamid)>.<ext>`; voice notes: `<book owner>/voice-out-<id>.ogg`;
  attachments: `<book owner>/media-out-<id>.<ext>`). The only read policy was "own folder, or admin",
  so a salesperson's `createSignedUrl` was refused; the sales thread also never asked.
- **The rule** (migration `20260927120000_sales_whatsapp_media.sql`, applied live 2026-09-27 and read
  back): storage policy `whatsapp media read assigned sales`, SELECT only, additive — the admin policy
  is untouched and the bucket stays private. `name in (select my_sales_media_paths())`, where the set
  is built from `whatsapp_messages.media_path`: media → message → lead in `my_sales_lead_ids()`
  (assigned to the caller, not a client). A message with NO lead id counts through the rep's own
  phones; one WITH a lead id counts only through that lead. Never decided from the object name.
- **Proof:** `supabase/tests/sales-media-rls.sql` — 23/23 against the live policy (own image, voice
  note, document open; Paul's, another rep's, a paid client's, an unreferenced object, other private
  buckets, anon, a reassigned lead, a disabled account refused; admin sees all). Always rolled back.
  The older `multi-user-rls.sql` still 70/70 after it.
- **Limit:** a signed link already issued lives its 5 minutes. A reassigned or disabled rep cannot get
  a NEW link.

## 2. The Inbox fills the screen

- **Why it left dead space:** both panels were a fixed `60vh` (648 px on a 1080 px screen), and the page
  had no height of its own, so on any tall screen the bottom third was empty.
- **Now (md and up):** the page is `100dvh` minus AppLayout's own vertical padding (`py-6` → 3rem at
  sm/md, `py-8` → 4rem at lg; `scripts/inbox-layout.test.ts` checks the two agree), a 560 px floor,
  the grid takes the rest, each panel scrolls inside itself, the composer stays at the bottom.
  Measured in a render at 1920×1080: panels 648 → 972 px, 32 px below them (the shell's padding),
  no page scroll, no horizontal overflow. Phones keep the old stacked sizes.
- **Less chrome:** header = two lines, name + window state first (the name had been squeezed to "T…"
  at 1280 px); Maps / website / email / WhatsApp app / Remove from inbox moved into one **More** menu;
  the reply helpers (draft reply, quick reply, voice-note script) share one row; inside the window the
  approved-template sender opens on demand ("Send a template"), outside it it always shows.
- Visual QA was a throwaway harness (real `AppLayout` + `Inbox`, mocked client, headless Edge
  screenshots at 1920×1080, 1440×900, 1280×720, 1024×768), deleted before commit.

## 3. Outbound attachments inside the 24-hour window

- **Where:** the paperclip beside the mic, Inbox and the sales lead page, open window only. Pick →
  preview (image thumbnail, video frame, document icon + name/type/size) → optional caption → Send,
  Change or Remove. Picking never sends. A staged file hides the text box and the mic (still mounted).
- **Server:** edge function `send-whatsapp-media` (new, `verify_jwt = true`, BUILD_ID on the preflight
  `x-swmd-build`), rules in `_shared/media-attachment-send.ts` with every side effect injected — the
  voice note's twin; the voice and text paths are unchanged.
- **Types** (`src/lib/mediaAttachment.ts`, Meta's Cloud API list): JPG/PNG ≤ 5 MB, MP4/3GP ≤ 16 MB,
  PDF / Word / Excel / PowerPoint / text ≤ 20 MB (our bucket's limit, below Meta's 100 MB). The
  extension picks the type; the file's first bytes must agree. Audio is not offered (voice notes have
  their own path); HEIC and stickers are not offered. Captions ≤ 1,024; documents carry a filename.
- **Order:** shape → lead (the book's, not archived, the recipient is the LEAD's number) → the window,
  re-read at send time → the bytes → [`mode=dry_run` stops here] → one stored copy keyed by the send id
  (upsert:false, so no double send) → Meta upload + send → the thread row + `whatsapp_sends`.
  Sales: `leadAccess` (assigned to them, not a client) before the file is read.
- **Failures never read as sent:** Meta refused → claim released, a `failed` row with no attachment;
  Meta did not answer → claim kept (a retry is refused as duplicate); upload refused → nothing sent.
- **Known limit:** a video's container is checked, not its codec — Meta refuses non-H.264/AAC video,
  which comes back as a failed send.
- **Tests:** `scripts/whatsapp-media-send.test.ts` (fakes), `scripts/inbox-layout.test.ts`,
  `scripts/sales-media-access.test.ts`.
