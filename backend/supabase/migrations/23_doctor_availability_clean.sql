-- Migration 23: Clean Row-Based Doctor Availability & Overlap Index

-- 1. Ensure date and slot_minutes columns exist
ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS slot_minutes INT DEFAULT 30;

-- 2. Index on (doctor_id, date) for fast lookup by doctor and date
CREATE INDEX IF NOT EXISTS idx_doctor_availability_doctor_date ON doctor_availability(doctor_id, date);

-- 3. Backfill legacy weekday rows into dated rows for next 30 days if any exist
DO $$
DECLARE
  rec RECORD;
  curr_date DATE;
  end_date DATE := (CURRENT_DATE + INTERVAL '30 days')::DATE;
  dow INT;
BEGIN
  FOR rec IN SELECT * FROM doctor_availability WHERE date IS NULL AND weekday IS NOT NULL LOOP
    FOR day_offset IN 0..30 LOOP
      curr_date := CURRENT_DATE + day_offset;
      dow := EXTRACT(DOW FROM curr_date)::INT;
      IF dow = rec.weekday THEN
        INSERT INTO doctor_availability (
          doctor_id,
          date,
          start_time,
          end_time,
          slot_minutes,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          rec.doctor_id,
          curr_date,
          rec.start_time,
          rec.end_time,
          COALESCE(rec.slot_minutes, 30),
          COALESCE(rec.is_active, true),
          rec.created_at,
          NOW()
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Delete unmapped legacy weekday-only template rows
  DELETE FROM doctor_availability WHERE date IS NULL;
END $$;

-- 4. Overlap Check Trigger
CREATE OR REPLACE FUNCTION check_doctor_availability_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true AND NEW.date IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM doctor_availability
      WHERE doctor_id = NEW.doctor_id
        AND date = NEW.date
        AND is_active = true
        AND id <> NEW.id
        AND (NEW.start_time, NEW.end_time) OVERLAPS (start_time, end_time)
    ) THEN
      RAISE EXCEPTION 'DOCTOR_AVAILABILITY_OVERLAP: Time range % - % overlaps with existing schedule on %', NEW.start_time, NEW.end_time, NEW.date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_doctor_availability_overlap ON doctor_availability;

CREATE TRIGGER trg_check_doctor_availability_overlap
BEFORE INSERT OR UPDATE ON doctor_availability
FOR EACH ROW EXECUTE FUNCTION check_doctor_availability_overlap();
