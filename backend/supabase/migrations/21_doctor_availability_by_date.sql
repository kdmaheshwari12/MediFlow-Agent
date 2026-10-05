-- Migration 21: Doctor Availability By Date & Overlap Trigger

-- 1. Add date column to doctor_availability if it doesn't exist
ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS date DATE;

-- Make weekday nullable
ALTER TABLE doctor_availability ALTER COLUMN weekday DROP NOT NULL;

-- 2. Backfill existing weekday schedules into dated rows for the next 60 days
DO $$
DECLARE
  rec RECORD;
  curr_date DATE;
  end_date DATE := (CURRENT_DATE + INTERVAL '60 days')::DATE;
  dow INT;
BEGIN
  FOR rec IN SELECT * FROM doctor_availability WHERE date IS NULL LOOP
    FOR day_offset IN 0..60 LOOP
      curr_date := CURRENT_DATE + day_offset;
      dow := EXTRACT(DOW FROM curr_date)::INT;
      IF dow = rec.weekday THEN
        INSERT INTO doctor_availability (
          doctor_id,
          date,
          weekday,
          start_time,
          end_time,
          break_start,
          break_end,
          slot_minutes,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          rec.doctor_id,
          curr_date,
          rec.weekday,
          rec.start_time,
          rec.end_time,
          rec.break_start,
          rec.break_end,
          rec.slot_minutes,
          rec.is_active,
          rec.created_at,
          NOW()
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Remove legacy weekday-only template rows that have NULL date
  DELETE FROM doctor_availability WHERE date IS NULL;
END $$;

-- 3. Drop old weekday-based unique index
DROP INDEX IF EXISTS idx_doctor_availability_day;

-- 4. Create Index on (doctor_id, date)
CREATE INDEX IF NOT EXISTS idx_doctor_availability_date ON doctor_availability(doctor_id, date);

-- 5. Trigger to prevent overlapping time ranges per doctor and date
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
