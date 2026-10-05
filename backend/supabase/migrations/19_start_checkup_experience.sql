-- Migration 19: Doctor Checkup Experience, Prescriptions Enhancements, Message Logs, Indexes, and RLS.

-- 1. Appointments: Support in_consultation status and follow_up_due_date
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_due_date DATE NULL;

-- 2. Prescriptions: Add appointment_id, diagnosis, medicines JSONB, notes, follow_up_period, follow_up_due_date
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS medicines JSONB DEFAULT '[]'::jsonb;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up_period TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up_due_date DATE;

-- 3. Message Logs Table: Store SMS drafts, delivery status, provider logs
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  draft TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted', -- 'drafted', 'sent', 'failed'
  error_reason TEXT NULL,
  provider_response JSONB NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns on message_logs exist if table pre-existed
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE CASCADE;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS draft TEXT;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'drafted';
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS error_reason TEXT;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS provider_response JSONB;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Constraint on message_logs status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_message_logs_status'
  ) THEN
    ALTER TABLE message_logs ADD CONSTRAINT chk_message_logs_status CHECK (status IN ('drafted', 'sent', 'failed'));
  END IF;
END $$;

-- 4. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_prescriptions_pat_doc_date ON prescriptions(patient_id, doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_pat_doc_date ON message_logs(patient_id, doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_pat_doc_date ON appointments(patient_id, doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);

-- 5. Security & Row Level Security (RLS)
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to recreate cleanly
DROP POLICY IF EXISTS "Doctors can manage own prescriptions" ON prescriptions;
DROP POLICY IF EXISTS "Doctors can manage own message logs" ON message_logs;

CREATE POLICY "Doctors can manage own prescriptions" ON prescriptions FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can manage own message logs" ON message_logs FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Realtime publication addition
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_logs;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
