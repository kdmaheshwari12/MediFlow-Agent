-- Migration 11: Schema alignment for doctor daily limit, safe views, message logs, and appointments

-- 1. Doctor Profiles: Daily limit and profile completion
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS daily_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill profile_completed for already completed doctors
UPDATE doctor_profiles SET profile_completed = true WHERE onboarding_status = 'complete';

-- 2. Appointments: reason, date, and time_slot columns
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_slot TEXT;

-- Backfill date from scheduled_start where null
UPDATE appointments SET date = (scheduled_start AT TIME ZONE 'UTC')::date WHERE date IS NULL;

-- 3. Prescriptions: appointment_id, content, follow_up_period
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS follow_up_period TEXT;

-- 4. Message Logs Table for SMS drafts and sent status
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  draft TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted', -- 'drafted', 'sent', 'failed'
  provider_response JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Safe Doctors View for Receptionists (omitting CNIC, license_number, phone, email)
CREATE OR REPLACE VIEW safe_doctors AS
SELECT
  d.id,
  d.name,
  d.qualification,
  d.clinic_id,
  d.daily_limit,
  d.profile_completed,
  d.onboarding_status
FROM doctor_profiles d;

-- 6. Performance Indexes on mrn, phone, doctor_id + scheduled_start/date
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_message_logs_patient_id ON message_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_prescription_id ON message_logs(prescription_id);

-- 7. Security: RLS on message_logs
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage message logs for their patients" ON message_logs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM doctor_patients
      WHERE doctor_patients.patient_id = message_logs.patient_id
        AND doctor_patients.doctor_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid()
    )
  );

GRANT SELECT ON safe_doctors TO authenticated;
