# Audit trade order — record (2026-11-24, fix/audit-category-and-scoring)

Source: the read-only WhatsApp follow-up report of 24 Nov (docs/reports/whatsapp-followup-report-2026-11-24.md, §5, not committed).
- Audit trade order fixed on every path (`auditTradeOf`, src/lib/leadTrade.ts): search keyword before Google category.
- The 30 "Educational Institution" audits were re-run as fresh hook audits with trade "Driving instructors" (audits only;
  no pitch parked, nothing sent). Live: their questions read "Who is the best driving instructor in <town>?". The OLD
  audits and their report links are left as they were (each lead now has a newer, correct audit).
- The 48 leads in that campaign with the same category and no audit yet will be audited as driving instructors.
- Not touched: the 18 leads imported into the driving campaign with keyword "Language schools" / "Locksmiths".
