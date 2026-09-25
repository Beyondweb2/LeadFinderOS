# Outgoing WhatsApp voice notes from the Inbox (2026-09-25)

Branch `feat/whatsapp-voice-notes`. Tap the mic beside the reply box → record → Stop → listen back →
Send, Delete or Re-record. Only inside the 24-hour customer-service window, only on a thread linked
to a lead. No AI voice, no transcription, nothing automatic.

## What Meta requires (evidence, not a guess)

Checked 2026-09-25 against Meta's Cloud API docs — "Audio messages"
(`developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages`) and the Media reference:

- Payload: `{ "type": "audio", "audio": { "id": "<MEDIA_ID>", "voice": true } }`. `voice: true`
  makes it a voice note; omitted/false is a plain audio file.
- Voice notes: `.ogg`, **Opus codec only, mono only** ("base audio/ogg not supported").
- Upload: `POST /<PHONE_NUMBER_ID>/media`, multipart `messaging_product=whatsapp`, `type`, `file` → `{ id }`.
- Every audio type is capped at **16 MB**.
- No minimum Graph version is stated for `voice`. The repo sends on `GRAPH_VERSION` (`v21.0`, in
  `_shared/whatsapp-send.ts`) and this feature does not change it. **Only a real `test_send`-style
  send proves Meta renders it as a voice note on this version** — not yet done.
- Meta started (2026-03-17) sending a `played` status for voice notes. `whatsapp-status` handles
  statuses by allow-list, so `played` is ignored; a note shows up to "read".

## The recording format and the conversion

- Chrome/Edge (measured: HeadlessChrome 151): `MediaRecorder` supports `audio/webm;codecs=opus`,
  NOT `audio/ogg`. Firefox records `audio/ogg;codecs=opus`. Playwright's Windows WebKit has no
  MediaRecorder at all, so real Safari was **not** tested; an AAC/MP4-only browser is refused up
  front (`pickRecorderMimeType` lists Opus only) rather than sending an attachment.
- `src/lib/oggOpus.ts` **remuxes** WebM → Ogg: lifts each Opus packet out of the Matroska blocks
  (all three lacing modes, unknown-size Segment/Cluster) and writes RFC 7845 pages (OpusHead,
  OpusTags, audio pages, granules from each packet's TOC byte, Ogg CRC). No decode, no re-encode, no
  dependency. An Ogg input is validated (CRC per page, one stream, OpusHead, mono) and passed through.
- Proven on a real Chrome recording: 3.0 s, mono, 48 kHz; Chromium decoded the remuxed Ogg to the
  identical peak level as the WebM. Fixture: `scripts/fixtures/chrome-mediarecorder-fake-mic-3s.webm`
  (Chromium's synthetic fake-mic tone, not a person).
- Mono by construction: the mic is requested with `channelCount: 1` and routed through a Web Audio
  destination fixed at one channel (a real downmix). The server refuses anything not mono.
- A MediaRecorder WebM reports `duration === Infinity` to `<audio>`; the Ogg reads correctly. The
  preview therefore uses the recorder's own timer (`knownDurationMs`).
- 32 kbps Opus: a 5-minute note is ~1.2 MB.

## Limits (all in `src/lib/voiceNote.ts`, shared by browser and server)

`VOICE_NOTE_MAX_SECONDS` (5 min, auto-stop, warning in the last `VOICE_NOTE_WARN_SECONDS_LEFT`),
`VOICE_NOTE_MIN_MS`, `VOICE_NOTE_MAX_RECORDING_BYTES` (recorder stops) < `VOICE_NOTE_MAX_UPLOAD_BYTES`
(server refuses) < `WHATSAPP_AUDIO_MAX_BYTES` (Meta's 16 MB).

## Server: `send-whatsapp-voice` (new function; `verify_jwt = true` in config.toml)

Rules and order in `_shared/voice-note-send.ts` (side effects injected, so every branch is tested
with fakes). Each step runs only if all above passed:

1. shape — UUID `send_id`, declared size under the cap (checked before the body is read), lead id;
2. lead — `resolveOperator`, the operator's own lead, not archived; **the recipient is the LEAD's
   number** — the browser's phone is only a confirmation that must match;
3. window — `serviceWindowState` (the shared leaf) on the operator's newest inbound row, at send
   time, before conversion/storage/Meta. **No test-mode bypass** (unlike the text path);
4. audio — `toVoiceNoteOgg`, duration in range;
5. claim — the ONE stored copy is uploaded to `whatsapp-media/<operatorId>/voice-out-<send_id>.ogg`
   with `upsert:false`. A second request for the same recording gets `duplicate_send`;
6. Meta — media upload, then `sendViaGraph` with `voice: true`;
7. record — `whatsapp_messages` (outbound, `message_type 'audio'`, `media_path`, `media_mime_type
   audio/ogg`, body "Voice note (m:ss)" for list previews), `whatsapp_sends`, and replied →
   awaiting_reply (the same scoped move `send-whatsapp-message` makes for a typed reply).

Failures: upload refused → claim + copy removed, nothing logged, retryable with the same id. Meta
refused the send (it answered with an error code) → copy removed, a `failed` row with NO media is
logged (like a failed text), retryable. Meta did not answer (throw / non-JSON) → **claim kept**,
`meta_send_unknown`, retry refused — so an uncertain send can never be delivered twice.

⚠️ Deliberately separate from `send-whatsapp-message` (whose protections Paul asked not to change,
and whose JSON body does not fit multipart). The ownership rule here is STRICTER (lead required,
recipient from the lead row), not a copy. The replied → awaiting_reply move IS a second copy of one
line in `send-whatsapp-message`; extracting both into a leaf means redeploying that sender.

## Storage and privacy

No schema change: `media_path`/`media_mime_type`/`media_filename` and `audio` in the type check
already existed (migration `20260917000000`, verified live 2026-09-25), as does the private
`whatsapp-media` bucket (20 MB, `public=false`) whose only policy is SELECT for the owner's folder
or admin. Writes are service-role only. One Ogg copy per SENT note is kept (Meta media ids expire
and there is no Meta-backed playback path); the raw WebM is never stored; cancelled/deleted
recordings never leave the browser; failed attempts remove their copy (except the unknown case,
where the copy is the claim).

## Inbox

- `VoiceNoteRecorder` renders only in the open-window branch and only with `active.leadId`, keyed
  by `active.key` → a thread switch unmounts it, discarding the recording and releasing the mic.
- The text composer is HIDDEN (still mounted) while the recorder has the row, so a half-typed reply
  survives record/cancel/send.
- `VoiceNotePlayer` is the one player for inbound audio, outbound voice notes and the preview.
  `InboundMedia` (signed URLs, renewed) now also runs for outbound audio rows; the bubble hides the
  "[audio]" / "Voice note (…)" body when a playable file exists.

## Verification done

- `scripts/whatsapp-voice-note.test.ts` (124 assertions): remux on the real fixture, rename/stereo/
  AAC/empty/corrupt refusals, lacing, reducer (C, D, E, F, G), server with fakes (A, B, forbidden,
  archived, phone mismatch, oversize, bad id, double send, upload fail + retry, send refused, send
  unknown, test mode), and the Inbox wiring.
- Throwaway static harness (real `InboxComposer` + `VoiceNoteRecorder` in the Inbox composer markup,
  deleted before commit) driven by Playwright Chromium with a fake microphone: desktop 1280 and
  touch 375/390 — record, cancel, preview + play, delete, send (converted in-browser to mono Ogg),
  double-click, failure + same-id retry, re-record, thread switch mid-recording (nothing sent, mic
  released), draft survival, playback with real duration, no horizontal overflow. Mic errors were
  INJECTED by spec name (NotAllowedError/NotFoundError/NotReadableError): headless Chromium here
  answers NotSupportedError to everything without a fake device, so a real denial prompt was not
  exercised. The real Inbox page (authed) was not loaded; nobody has seen it on a real phone.

## Deploy (not done)

1. `npx supabase functions deploy send-whatsapp-voice` (new; reaches `_shared/voice-note-send.ts`,
   `_shared/whatsapp-media-upload.ts`, `_shared/operator-auth.ts`, `_shared/whatsapp-send.ts`,
   `src/lib/{oggOpus,voiceNote,serviceWindow}.ts`). Prove it by `x-swv-build` on OPTIONS.
2. Merge → the SPA deploys the mic. Backend first, so the button never points at a missing function.
No other function needs redeploying: no existing shared module was changed. No migration.
