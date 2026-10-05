-- Migration 16: Add full UNIQUE constraint on doctor_availability(doctor_id, weekday)

-- 1. Drop partial unique index if it exists
DROP INDEX IF EXISTS idx_doctor_availability_day;

-- 2. Deduplicate any duplicate rows for (doctor_id, weekday) keeping the latest updated_at
DELETE FROM doctor_availability a USING doctor_availability b
WHERE a.id < b.id 
  AND a.doctor_id = b.doctor_id 
  AND a.weekday = b.weekday;

-- 3. Add full UNIQUE constraint on (doctor_id, weekday)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_doctor_availability_weekday'
  ) THEN
    ALTER TABLE doctor_availability ADD CONSTRAINT unique_doctor_availability_weekday UNIQUE (doctor_id, weekday);
  END IF;
END $$;
