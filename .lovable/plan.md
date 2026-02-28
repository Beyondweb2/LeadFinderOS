

## Two Changes

### 1. Reduce CRM pulse duration from 2 seconds to 800ms

Both `AppSidebar.tsx` (line 136) and `MobileBottomNav.tsx` (line 130) currently set the CRM green pulse to 2000ms. Reduce to 800ms so it flashes briefly then stops.

**Files:**
- `src/components/AppSidebar.tsx` — line 136: change `setTimeout(() => setFlashCRM(false), 2000)` → `800`
- `src/components/MobileBottomNav.tsx` — line 130: change `setTimeout(() => setCrmGlow(false), 2000)` → `800`

### 2. Rewrite OutreachTipsDialog content to practical tips

Replace the current instructional body in `OutreachTipsDialog.tsx` with 3 concise outreach tips:

1. **Keep it casual** — No links, images, or videos in your first message. Just be friendly and try to get a casual reply first.
2. **Try WhatsApp first** — If they don't have WhatsApp, try SMS. But the best option is to call — have a pitch ready using a pre-made script template.
3. **Make conversation** — Don't sell straight away. Ask a question, reference their business, and keep it natural.

Update the headline to something like "3 Tips Before You Reach Out". Remove the channel-specific desktop/phone instructions. Keep the Skip link, CTA button, and "Don't show again" checkbox unchanged.

