

## Plan: Update Walkthrough Copy & Reduce Step 2 Threshold to 1

### Changes Required

**1. Threshold change — `src/contexts/DemoChecklistContext.tsx`** (line ~168, ~177)
- Change `addedToCrm: newCount >= 3` → `addedToCrm: newCount >= 1` in both `onCrmAdd` and `onCrmPurged` handlers.

**2. Translation updates — all 3 locale files**

Update these keys in `en.json`, `hi.json`, and `ur.json`:

| Key | New English text |
|---|---|
| `step2Select` | `"Select a business that looks like a good opportunity."` (remove counter) |
| `step3Contact` | `"Press Contact to see how you can reach businesses.\n{{count}}/3"` |
| `step3NavToOutreach` | `"Open Outreach to see contact options."` |
| `step5Track` | `"Track businesses that show interest."` |
| `step5NavToOutreach` | `"Open Outreach and press ⭐ Track on a lead."` |
| `step6Pipeline` | `"Your tracked leads appear here."` |
| `step7Status` | `"Set the status for this lead."` |
| `step8NextAction` | `"Set the next step for this lead."` |
| `step9Date` | `"Pick when you want to follow up."` |
| `step10Note` | `"Add a note for this lead."` |
| `save3Leads` | `"Save <accent>1 lead</accent> to unlock outreach"` |
| `gotItSave3` | `"Got it – I'll save a lead"` |

Hindi and Urdu will get equivalent translations for all changed keys.

**3. PostFirstSearchModal — `src/components/PostFirstSearchModal.tsx`**
- No code changes needed; it reads from i18n keys already updated above.

**4. No changes to:**
- `TOTAL_STEPS` (stays 11)
- Step order, selectors, highlighting, or progression logic
- `WalkthroughOverlay.tsx` step definitions (Step 1 text unchanged, steps 5-11 read from i18n)
- Any walkthrough triggers or UI layout

