-- Migration 20: Appointment Status Lifecycle and Timestamps Enhancement

-- 1. Add started_at and completed_at columns to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS date DATE NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_slot TEXT NULL;

-- 2. Map old status values to new canonical lifecycle statuses:
-- SCHEDULED -> WAITING -> IN_PROGRESS -> COMPLETED (plus CANCELLED)
UPDATE appointments SET status = 'completed' WHERE status IN ('done', 'completed', 'COMPLETED', 'DONE');
UPDATE appointments SET status = 'in_progress' WHERE status IN ('in_consultation', 'in_progress', 'IN_PROGRESS');
UPDATE appointments SET status = 'waiting' WHERE status IN ('waiting', 'WAITING');
UPDATE appointments SET status = 'scheduled' WHERE status IN ('scheduled', 'SCHEDULED');
UPDATE appointments SET status = 'cancelled' WHERE status IN ('cancelled', 'CANCELLED');

-- 3. Ensure UNIQUE constraint on (doctor_id, date, time_slot) to prevent double booking under concurrency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prevent_double_booking_doctor_date_timeslot'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT prevent_double_booking_doctor_date_timeslot UNIQUE (doctor_id, date, time_slot);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Create performance indexes for appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status ON appointments(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start ON appointments(scheduled_start);
