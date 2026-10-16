# Lead file for LeadFinderOS — what to put in the CSV

Save as **CSV UTF-8**. One row per business. Up to 2,000 rows per file. First row = column names (exactly as below).

| Column | Needed? | What to put |
|---|---|---|
| `name` | **Required** | The business name, as customers know it. |
| `whatsapp_number` | **Required** | A mobile number in international format with the country code, e.g. `+447700900123`, `+60123456789`, `+6591234567`. No spaces needed. A landline cannot be messaged. |
| `trade` | **Required** (or tell us one trade for the whole file) | What the business does, e.g. `Language school`, `Plumber`. This is what the AI audit asks about. |
| `city` | **Required** | The town or city. Not "Online". The audit needs a real place. |
| `country` | Optional but please include | `UK`, `Malaysia`, `Singapore` (Australia is read but not messaged). If blank we work it out from the number. |
| `website` | Optional | Full address, e.g. `https://example.com`. Leave blank if they have none. |
| `owner_name` | Optional | The owner's or decision-maker's name. Used when a message greets a person. |

Allowed countries for messaging: **UK, Malaysia, Singapore** (mobiles only).

Any other columns (id, owner_role, social links, evidence, offers…) are allowed and **ignored**. Don't add them on our account.

Example row:

```
name,whatsapp_number,trade,city,country,website,owner_name
Sunrise Language School,+60123456789,Language school,Penang,Malaysia,https://sunrise.example,Mei Ling Tan
```

Notes for us (not for Ethan): the dialog auto-maps by name and common aliases (`business`/`company` → name, `phone`/`mobile`/`whatsapp` → number, `category`/`type`/`industry` → trade, `town` → city). Place ID is deliberately not imported: a lead with a Google place id needs a Google-verified town to be audited. Code: `src/lib/csvLeadImport.ts` (`FILE_FIELDS`, `autoMapSimple`, `fileWarnings`); test: `scripts/csv-simple-import.test.ts`.

## For AI audits (paste-ready for Ethan)

The AI audit asks ChatGPT and Gemini "who is the best <trade> in <town>?" about each business, so it needs **one real town per row**. That is the only thing the audit checks.

**What counts as a town.** The `city` cell, written as a plain place name: `Kuala Lumpur`, `Penang`, `Klang`, `Singapore`. A bracket after it is fine (`Kuala Lumpur (Sunway Velocity 2)` is read as Kuala Lumpur). If the cell lists neighbourhoods ending in the city (`Tangga Batu / Tanjung Kling, Melaka`) we use the last one, `Melaka`.

**What does NOT count** (the row is skipped, free, and told to be fixed): blank, `Online`, `Remote`, `Worldwide`, `N/A`, `Not established`, `Not found`, a street address with numbers, or a sentence.

**Extra columns — what helps, best first:**

1. **`city` as a real town (already in the file).** This is all the audit needs. Nothing else is required.
2. **`country`.** Makes the question name the country (`Kuala Lumpur, Malaysia`), which avoids a wrong-town question for names like Georgetown or Newcastle.
3. **Google Place ID, Google Maps link, address, postcode.** *Not used by this import* (the simple import ignores them on purpose), so adding them changes nothing today. Please don't add them on our account. If a Place ID were ever imported, Google would become the judge of the town and a lead Google can't place would be refused, which is worse than a town you checked yourself.

**On our side:** when you import the file, tick **"Towns in this file were checked by the researcher"**. A real town is then stored as confirmed. Without the tick the audit still accepts a real town, but only if the import has a batch name (it now defaults to the file name).

Why a lead failed on 16 Oct 2026 ("Majesty Event", Kuala Lumpur): the file was fine. The import had no batch name, so the audit could not tell the row was typed by a person and asked Google, which had no place to look up. Fixed by the tick box and the batch default.
