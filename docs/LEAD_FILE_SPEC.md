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
