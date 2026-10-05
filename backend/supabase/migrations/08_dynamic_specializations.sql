-- Migration 08: Dynamic Specializations

-- 1. Add normalize_specialization function
CREATE OR REPLACE FUNCTION normalize_specialization(input_text text)
RETURNS text AS $$
DECLARE
  normalized text;
BEGIN
  -- Lowercase
  normalized := lower(input_text);
  -- Keep only alphanumeric characters to handle punctuation/whitespace variations robustly
  normalized := regexp_replace(normalized, '[^a-z0-9]+', '', 'g');
  RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Update specializations table
ALTER TABLE specializations ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- Generate normalized names for existing rows
UPDATE specializations SET normalized_name = normalize_specialization(name) WHERE normalized_name IS NULL;

-- Make it NOT NULL and add UNIQUE constraint
ALTER TABLE specializations ALTER COLUMN normalized_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_specializations_normalized_name ON specializations (normalized_name);

-- 3. Create RPC for upserting specializations safely (find or create)
CREATE OR REPLACE FUNCTION upsert_doctor_specializations(
  p_doctor_id UUID,
  p_specializations JSONB
) RETURNS void AS $$
DECLARE
  spec JSONB;
  v_normalized TEXT;
  v_spec_id UUID;
  v_name TEXT;
  v_years SMALLINT;
  v_is_primary BOOLEAN;
BEGIN
  -- First, delete all existing specializations for this doctor
  DELETE FROM doctor_specializations WHERE doctor_id = p_doctor_id;

  -- Loop through the JSON array
  FOR spec IN SELECT * FROM jsonb_array_elements(p_specializations)
  LOOP
    v_name := spec->>'name';
    v_years := (spec->>'experience_years')::SMALLINT;
    v_is_primary := (spec->>'is_primary')::BOOLEAN;
    
    v_normalized := normalize_specialization(v_name);
    
    -- Find Specialization
    SELECT id INTO v_spec_id FROM specializations WHERE normalized_name = v_normalized;
    
    -- Create if not found
    IF v_spec_id IS NULL THEN
      -- Generate a basic slug, appending some random characters just in case of collision
      INSERT INTO specializations (name, slug, normalized_name) 
      VALUES (
        v_name, 
        trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')) || '-' || substring(md5(random()::text) from 1 for 4), 
        v_normalized
      )
      RETURNING id INTO v_spec_id;
    END IF;

    -- Insert into doctor_specializations
    INSERT INTO doctor_specializations (doctor_id, specialization_id, years_experience, is_primary)
    VALUES (p_doctor_id, v_spec_id, v_years, v_is_primary)
    ON CONFLICT (doctor_id, specialization_id) DO UPDATE 
    SET years_experience = EXCLUDED.years_experience, is_primary = EXCLUDED.is_primary;
    
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-Backfill from doctor_profiles if needed
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, specialization, experience_years FROM doctor_profiles WHERE specialization IS NOT NULL AND specialization <> ''
  LOOP
    -- use the new function, only if the doctor doesn't already have specializations
    IF NOT EXISTS (SELECT 1 FROM doctor_specializations WHERE doctor_id = rec.id) THEN
      PERFORM upsert_doctor_specializations(
        rec.id,
        jsonb_build_array(
          jsonb_build_object(
            'name', rec.specialization,
            'experience_years', COALESCE(rec.experience_years, 0),
            'is_primary', true
          )
        )
      );
    END IF;
  END LOOP;
END
$$;
