/* The simple import file (2026-10-16, docs/LEAD_FILE_SPEC.md): the dialog maps only the fields V1 uses, ignores the rest
   silently, and says plainly what the file lacks. Fake rows only. */
import { readFileSync } from "node:fs";
import { parseCsv, autoMapSimple, fileWarnings, buildImportRows, isResearchFile, FILE_FIELDS } from "../src/lib/csvLeadImport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const HEAD = "name,whatsapp_number,website,city,id,country,owner_name,owner_role,owner_source_url,social_profile_urls,social_activity_status,latest_post_date,activity_source_url,activity_evidence,ai_visibility_test_offer,tit_caveat";
const csv = `${HEAD}\nZZ Fake School,+60123456789,https://fake.invalid,Penang,x1,Malaysia,Pat Example,Director,,,,,,,,\nZZ Other School,+6591234567,,Singapore,x2,Singapore,,,,,,,,,,\n`;
const p = parseCsv(csv);
const m = autoMapSimple(p.headers);
const idx = (h: string) => p.headers.indexOf(h);

ok(!isResearchFile(p.headers), "the Ethan column list is NOT the old research preset (generic path)");
ok(m.mapping.business_name === idx("name"), "name -> business name");
ok(m.mapping.phone === idx("whatsapp_number"), "whatsapp_number -> phone");
ok(m.mapping.website === idx("website"), "website -> website");
ok(m.mapping.town === idx("city"), "city -> town");
ok(m.mapping.country === idx("country"), "country -> country");
ok(m.mapping.contact_name === idx("owner_name"), "owner_name -> contact person");
ok(m.mapping.trade === null, "no trade column is left unmapped (never guessed)");
const hidden = ["email", "address", "postcode", "notes", "google_maps_url", "place_id"] as const;
ok(hidden.every((k) => m.mapping[k] === null), "id is NOT taken as a Google place id; address/email/notes/maps never mapped");
ok(FILE_FIELDS.length === 7, "the dialog shows seven fields only");
ok(m.notes.some((n) => /^10 other columns ignored\.$/.test(n)), "says how many other columns are ignored");
const w = fileWarnings(m.mapping, false);
ok(w.length === 1 && /No trade\/category column: type one below/.test(w[0]), "warns about the missing trade, and only that");
ok(fileWarnings(m.mapping, true).length === 0, "typing a trade for the file clears the warning");
const rows = buildImportRows(p, m.mapping);
ok(rows[0].business_name === "ZZ Fake School" && rows[0].phone === "+60123456789" && rows[0].town === "Penang" && rows[0].country === "Malaysia" && rows[0].contact_name === "Pat Example", "row 1 built from the mapped fields");
ok(!("extra" in rows[0]) && Object.keys(rows[0]).sort().join() === "business_name,contact_name,country,phone,row,town,website", "nothing else rides along");
ok(!("website" in rows[1]) && !("contact_name" in rows[1]), "blank cells stay absent");

const alias = autoMapSimple(["Company", "Mobile", "Category", "Town"]);
ok(alias.mapping.business_name === 0 && alias.mapping.phone === 1 && alias.mapping.trade === 2 && alias.mapping.town === 3, "aliases: company / mobile / category / town");
ok(fileWarnings(autoMapSimple(["foo", "bar"]).mapping, false).length === 4, "an unrecognised file gets all four warnings");

const src = readFileSync(new URL("../src/components/CSVImportDialog.tsx", import.meta.url), "utf8");
ok(/FILE_FIELDS\.map/.test(src) && !/IMPORT_FIELDS\.map\(\(f\) => \(\s*<label/.test(src), "the dialog draws only the simple fields");
ok(/research \|\| mapping\.trade == null/.test(src), "the trade box shows only when needed");

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
