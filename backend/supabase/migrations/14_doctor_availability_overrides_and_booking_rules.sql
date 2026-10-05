-- Migration 14: Doctor Availability Overrides, Appointments Schema Updates, Indexes, and Realtime

-- 1. Create doctor_availability_overrides table
CREATE TABLE IF NOT EXISTS doctor_availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  break_start TIME,
  break_end TIME,
  slot_minutes SMALLINT NOT NULL DEFAULT 15,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_doctor_override_date UNIQUE (doctor_id, date),
  CONSTRAINT override_end_after_start CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

-- 2. Add columns to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'reception_booking';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS needs_reschedule BOOLEAN DEFAULT false;

-- 3. Ensure clinics.timezone default
ALTER TABLE clinics ALTER COLUMN timezone SET DEFAULT 'Asia/Karachi';

-- 4. Enable RLS on doctor_availability_overrides
ALTER TABLE doctor_availability_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Doctors can manage own availability overrides'
  ) THEN
    CREATE POLICY "Doctors can manage own availability overrides" ON doctor_availability_overrides
      FOR ALL TO authenticated USING (auth.uid() = doctor_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff can read all doctor availability overrides'
  ) THEN
    CREATE POLICY "Staff can read all doctor availability overrides" ON doctor_availability_overrides
      FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- 5. Add Performance Indexes
CREATE INDEX IF NOT EXISTS idx_doctor_availability_overrides_doctor_date ON doctor_availability_overrides(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_doctor_time_off_doctor_dates ON doctor_time_off(doctor_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_start ON appointments(doctor_id, scheduled_start);

-- 6. Enable Realtime Publication for key tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
    ALTER PUBLICATION supabase_realtime ADD TABLE doctor_availability;
    ALTER PUBLICATION supabase_realtime ADD TABLE doctor_availability_overrides;
    ALTER PUBLICATION supabase_realtime ADD TABLE doctor_time_off;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL; -- Ignore if already added or missing
END $$;
