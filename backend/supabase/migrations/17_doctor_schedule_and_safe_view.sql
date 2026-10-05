-- Migration 17: Doctor Schedule Performance Indexes, Safe Public Doctor View, and RLS Alignment

-- 1. Index on appointments for doctor and date lookup
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, date);

-- 2. Safe view for doctors (excludes sensitive fields: cnic, license_number, phone)
CREATE OR REPLACE VIEW doctors_public AS
SELECT 
  id,
  name,
  qualification,
  experience_years,
  clinic_id,
  onboarding_status,
  created_at,
  updated_at
FROM doctor_profiles;

GRANT SELECT ON doctors_public TO authenticated;

-- 3. Ensure staff policy on appointments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Staff full management of appointments'
  ) THEN
    CREATE POLICY "Staff full management of appointments" ON appointments
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));
  END IF;
END $$;
