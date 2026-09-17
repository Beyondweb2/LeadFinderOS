-- SHORT PUBLIC REPORT CODE — ai_audits.short_code, fronted at findable.live/r/<code>.
--
-- Unguessable (random, not derived from the id or the name), unique, 6 characters from an
-- unambiguous alphabet (no 0/O/1/l/i). Assigned by a BEFORE INSERT trigger on every new audit and
-- backfilled onto every existing audit, so a short link never misses. The UUID /report/ form and the
-- legacy name+8-hex slug both keep resolving, so every link already sent stays live.
--
-- ⛔ THE ALPHABET AND LENGTH MUST MATCH src/lib/reportSlug.ts (SHORT_CODE_ALPHABET / SHORT_CODE_LEN)
-- CHARACTER FOR CHARACTER. scripts/report-short-code.test.ts reads this file and pins both sides.
--
-- ⚠️ Applied ONE STATEMENT AT A TIME by Paul, in this order, never `supabase db push`. Each
-- statement's expected result is in the plan handed to him. This file is the record; a file existing
-- does not mean it is live.

-- 1) The column (nullable at first; the backfill and trigger fill it, then it goes NOT NULL).
ALTER TABLE ai_audits ADD COLUMN IF NOT EXISTS short_code text;

-- 2) The generator: 6 random chars from the unambiguous alphabet.
CREATE OR REPLACE FUNCTION gen_audit_short_code() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';  -- 31 chars, no 0/O/1/l/i
  code text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- 3) The uniqueness backstop. Created BEFORE the backfill so the backfill's collision retry has
--    something to catch (multiple NULLs are allowed by a plain unique index, so this is fine now).
CREATE UNIQUE INDEX IF NOT EXISTS ai_audits_short_code_key ON ai_audits (short_code);

-- 4) Backfill every existing audit with a unique code, retrying on the astronomically rare collision.
DO $$
DECLARE
  r record;
  c text;
BEGIN
  FOR r IN SELECT id FROM ai_audits WHERE short_code IS NULL LOOP
    LOOP
      c := gen_audit_short_code();
      BEGIN
        UPDATE ai_audits SET short_code = c WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- try another code
      END;
    END LOOP;
  END LOOP;
END $$;

-- 5) The insert trigger: assign a unique code to any new audit that arrives without one. Checks the
--    table first so a collision is near-impossible; the unique index above is the hard backstop.
CREATE OR REPLACE FUNCTION set_audit_short_code() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c text;
  tries int := 0;
BEGIN
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    c := gen_audit_short_code();
    IF NOT EXISTS (SELECT 1 FROM ai_audits WHERE short_code = c) THEN
      NEW.short_code := c;
      RETURN NEW;
    END IF;
    tries := tries + 1;
    IF tries > 20 THEN
      -- fall back to a longer code to guarantee forward progress; still unique-indexed.
      NEW.short_code := gen_audit_short_code() || gen_audit_short_code();
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_audit_short_code ON ai_audits;
CREATE TRIGGER trg_set_audit_short_code
  BEFORE INSERT ON ai_audits
  FOR EACH ROW EXECUTE FUNCTION set_audit_short_code();

-- 6) Now that every row has one and the trigger fills new rows, forbid NULL.
ALTER TABLE ai_audits ALTER COLUMN short_code SET NOT NULL;
