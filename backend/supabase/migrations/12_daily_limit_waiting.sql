-- 1. Add daily_patient_limit to doctor_profiles (default 30)
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS daily_patient_limit INTEGER DEFAULT 30 NOT NULL;

-- 2. Add 'waiting' and 'in_progress' as valid appointment statuses
-- (The status column is TEXT and currently has no CHECK constraint)

-- 3. Add reason column to appointments if missing
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason TEXT;

-- 4. Add follow_up_period to follow_ups if missing
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS follow_up_period TEXT;

-- 5. Create or update a view for safe doctor data (no CNIC, license)
CREATE OR REPLACE VIEW safe_doctor_profiles AS
SELECT 
  dp.id,
  dp.name,
  dp.phone,
  dp.qualification,
  dp.clinic_id,
  dp.daily_patient_limit,
  dp.onboarding_status
FROM doctor_profiles dp
WHERE dp.onboarding_status = 'complete';
