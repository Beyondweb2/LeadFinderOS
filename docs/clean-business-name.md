# Clean business name for messages — `initial_contact_short` (2026-10-15)

**Rule file:** `src/lib/cleanBusinessName.ts` (`cleanBusinessName`). **Opt-in set:** `CLEAN_NAME_TEMPLATES` in
`src/lib/displayName.ts` (read through `nameStyleFor`; the send, the stored body and the Inbox mirror all use it).
Today only `initial_contact_short` is in it. Another template opts in by being added to that one set — nothing else.

- Display only. `outreach_leads.business_name` is never written.
- Lowercase; legal words at the END removed (ltd, limited, llp, llc, plc, inc, incorporated, corp, sdn bhd, bhd, pte ltd,
  pte, pty ltd, pty, gmbh) — never "co"; emojis / ™ ® © / quotes / stray punctuation out, apostrophes inside names and "&" kept;
  a tagline after `| - – — : /` goes when it carries marketing words or is an "in <town>" SEO phrase, a branch / place stays;
  bracketed acronym out, bracketed place kept without brackets (place list = Find Leads' `SUGGESTED_LOCATIONS` + Coverage's
  Malaysia / Singapore towns and aliases, imported not copied); when unsure keep; under 2 characters → the original lowercased.
- Template: Marketing, English, body `Hey, is this {{1}}?` + one new line + `Thanks`. Registered with ONE variable
  (`vars: ["name"]`), COLD, in `TEMPLATES_NEEDING_REAL_NAME`. Meta's LIVE status is the gate (queue `META_STATUS_GATED`,
  `send-whatsapp-message`); until Meta approves it a send / queue is refused with Meta's word. No approval flag to flip.
- SQL: `sales_queue_opener` allowlist (migration `20261030090000`). The Call-campaign confirmation, daily limit,
  opt-out, UK-only mobile block and the opener contact guard are the existing ones — nothing new written for it.
- Queue panel: "Will say: …" under the first five rows of a queue whose template cleans its name.
- Not done on purpose: the SMS queue (`SMS_COLD_TEMPLATES`) does not offer it.

## Preview — Ethan's language-school file (`language-school-crm.csv`, 100 names), read-only

| Stored name | Message name |
|---|---|
| Creative Language Center (CLC) | creative language center |
| Enhance Education | enhance education |
| International English Centre (IEC) Malaysia | international english centre malaysia |
| Penang English Academy | penang english academy |
| Speak Bright Language Center | speak bright language center |
| TOUCH English | touch english |
| English Explorer Language School | english explorer language school |
| English Express | english express |
| iWorld Learning | iworld learning |
| Native Hills English Language Centre | native hills english language centre |
| ACE Language Centre | ace language centre |
| Awesome Academy | awesome academy |
| British Columbia Language Centre (BCLC) | british columbia language centre |
| Direct English International Language Centre | direct english international language centre |
| DISTED College Edutourism | disted college edutourism |
| Eduexcel Education Group (Fluency International Learning House) | eduexcel education group fluency international learning house |
| EMS Language Centre | ems language centre |
| Excel Language Center | excel language center |
| GL Academy Language Centre | gl academy language centre |
| UCSI College English Holiday Programme | ucsi college english holiday programme |
| Xiamen University Malaysia English Language Education Centre (ELEC) | xiamen university malaysia english language education centre |
| Canadian Education College | canadian education college |
| Creative Campus | creative campus |
| Play2see Singapore | play2see singapore |
| School of Language International (SLI) | school of language international |
| The Alternative Story Learning Centre | the alternative story learning centre |
| Thinking Factory Education Centre | thinking factory education centre |
| ULC Academy | ulc academy |
| Alpha Greeno | alpha greeno |
| Bedford Language School | bedford language school |
| Cambright | cambright |
| Dynamic Kids Penang | dynamic kids penang |
| ELS Language Centres Malaysia | els language centres malaysia |
| English Classroom | english classroom |
| English Language Centre (ELC) Kuching | english language centre kuching |
| English Learners Club (ELC Setia Alam) | english learners club elc setia alam |
| GO IELTS Language Centre | go ielts language centre |
| Inter-Cultural Language School (ICLS) | inter-cultural language school |
| KLC Language Centre | klc language centre |
| Menara Language Centre (MLC Institute) | menara language centre mlc institute |
| Write Edge Malaysia | write edge malaysia |
| Bespoke Learning Centre | bespoke learning centre |
| Bolt Learning Centre | bolt learning centre |
| Edufront Learning Centre | edufront learning centre |
| Learning Journey Education Centre | learning journey education centre |
| Stamford American International School | stamford american international school |
| Stepping Stones Study Centre (SSSC) | stepping stones study centre |
| TheEnglishLab | theenglishlab |
| Uwing International School | uwing international school |
| WRITERS AT WORK Enrichment | writers at work enrichment |
| Language Success Academy | language success academy |
| Nationwide Language Services (Ipoh) | nationwide language services ipoh |
| Pusat Tuisyen & Bahasa ACE (Akal Cerdik Elit) | pusat tuisyen & bahasa ace akal cerdik elit |
| The Global English | the global english |
| Pertama Tuition Centre 第一补习学校 | pertama tuition centre 第一补习学校 |
| Phonics Junction | phonics junction |
| Pusat Tuisyen Mutiara Suria | pusat tuisyen mutiara suria |
| Pusat Tuisyen Pintar Minda | pusat tuisyen pintar minda |
| Tadika Pintar Barakah (Kids Clubhouse listing) | tadika pintar barakah kids clubhouse listing |
| The ParkCity Learning Centre | the parkcity learning centre |
| The Seeds Learning Centre | the seeds learning centre |
| Ask English Tuition and Training | ask english tuition and training |
| Avery Care Centre | avery care centre |
| Brainy Bee | brainy bee |
| Edu World Kulai | edu world kulai |
| Elite Tuition Centre (Sibu) | elite tuition centre sibu |
| ELS English Language Tuition Centre (Kuching) | els english language tuition centre kuching |
| ERA Tuition Centre – Puchong Bandar Puteri | era tuition centre puchong bandar puteri |
| Eureka Learning Centre (Eureka IGCSE) | eureka learning centre eureka igcse |
| Faridah’s Tuition Centre | faridah's tuition centre |
| GEM Tuition Bandar Bukit Raja – IGCSE, Cambridge English & Maths Specialist | gem tuition bandar bukit raja |
| GM Learning House | gm learning house |
| Jawzy Academy | jawzy academy |
| Joan Tuition | joan tuition |
| Newton Tuition Centre Johor Bahru | newton tuition centre johor bahru |
| Nice Education Sdn Bhd / 优品教培中心 | nice education 优品教培中心 |
| Pioneer Success Tuition Center | pioneer success tuition center |
| Prima Didik Tuition Centre | prima didik tuition centre |
| Pusat Tuisyen AdvanceStudy Sabah | pusat tuisyen advancestudy sabah |
| Pusat Tuisyen Akademia | pusat tuisyen akademia |
| Pusat Tuisyen Alam Gemilang – Kota Kemuning | pusat tuisyen alam gemilang kota kemuning |
| Pusat Tuisyen Alfa Bestari | pusat tuisyen alfa bestari |
| Pusat Tuisyen Cerdik Popular | pusat tuisyen cerdik popular |
| Pusat Tuisyen English Leo Genius | pusat tuisyen english leo genius |
| Pusat Tuisyen Genius Permata | pusat tuisyen genius permata |
| Pusat Tuisyen Informatif Meru Raya | pusat tuisyen informatif meru raya |
| Pusat Tuisyen Inovasi Impian | pusat tuisyen inovasi impian |
| Pusat Tuisyen Interaktif / Interactive Tuition Centre (PTI) | pusat tuisyen interaktif interactive tuition centre |
| Pusat Tuisyen Kiddo | pusat tuisyen kiddo |
| Pusat Tuisyen Minda Interaktif (MIEC) | pusat tuisyen minda interaktif |
| Pusat Tuisyen Mutiara Indah 特优补习中心 | pusat tuisyen mutiara indah 特优补习中心 |
| Pusat Tuisyen Pintar Bakat (小天才补习学院) | pusat tuisyen pintar bakat 小天才补习学院 |
| Pusat Tuisyen Sinaran Didik | pusat tuisyen sinaran didik |
| Pusat Tuisyen Takwa – Bandar Tasik Permaisuri | pusat tuisyen takwa bandar tasik permaisuri |
| PUSAT Tuisyen Wacana ILMU | pusat tuisyen wacana ilmu |
| Redu Smart 儿童教育中心 | redu smart 儿童教育中心 |
| Tenderluv Pandamaran (Pusat Tuisyen Ideal Intelek) | tenderluv pandamaran pusat tuisyen ideal intelek |
| Wonderlearn (Taiping) | wonderlearn taiping |
| 给力补习中心 LUKUT Tuition Center / Caring Tuition Center | 给力补习中心 lukut tuition center caring tuition center |
| Tutoring With Yew Co. | tutoring with yew co |
