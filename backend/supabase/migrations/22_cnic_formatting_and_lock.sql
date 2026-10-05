-- 1. Ensure cnic column exists
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS cnic TEXT;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS cnic TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cnic TEXT;

-- Normalize existing CNICs in doctor_profiles (if 13 digits without dashes, format as XXXXX-XXXXXXX-X)
UPDATE doctor_profiles
SET cnic = regexp_replace(cnic, '^(\d{5})(\d{7})(\d{1})$', '\1-\2-\3')
WHERE cnic IS NOT NULL AND cnic ~ '^\d{13}$';

-- Normalize existing CNICs in staff_profiles
UPDATE staff_profiles
SET cnic = regexp_replace(cnic, '^(\d{5})(\d{7})(\d{1})$', '\1-\2-\3')
WHERE cnic IS NOT NULL AND cnic ~ '^\d{13}$';

-- Normalize existing CNICs in patients
UPDATE patients
SET cnic = regexp_replace(cnic, '^(\d{5})(\d{7})(\d{1})$', '\1-\2-\3')
WHERE cnic IS NOT NULL AND cnic ~ '^\d{13}$';

-- 2. Add UNIQUE Indexes for CNIC
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_doctor_cnic ON doctor_profiles (cnic)
WHERE cnic IS NOT NULL AND cnic <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_staff_cnic ON staff_profiles (cnic)
WHERE cnic IS NOT NULL AND cnic <> '';

-- 3. Add CHECK constraints for Pakistani CNIC Format (XXXXX-XXXXXXX-X)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_doctor_cnic_format'
  ) THEN
    ALTER TABLE doctor_profiles
    ADD CONSTRAINT chk_doctor_cnic_format
    CHECK (cnic IS NULL OR cnic = '' OR cnic ~ '^\d{5}-\d{7}-\d$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_staff_cnic_format'
  ) THEN
    ALTER TABLE staff_profiles
    ADD CONSTRAINT chk_staff_cnic_format
    CHECK (cnic IS NULL OR cnic = '' OR cnic ~ '^\d{5}-\d{7}-\d$');
  END IF;
END $$;
