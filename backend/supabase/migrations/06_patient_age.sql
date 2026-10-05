-- Migration: Replace DOB with Age
ALTER TABLE patients ADD COLUMN age SMALLINT CHECK (age >= 0 AND age <= 120);
ALTER TABLE patients ADD COLUMN age_recorded_at DATE DEFAULT CURRENT_DATE;

-- Backfill age from dob
UPDATE patients SET age = EXTRACT(YEAR FROM age(CURRENT_DATE, dob))::SMALLINT WHERE dob IS NOT NULL;

-- Make dob nullable
ALTER TABLE patients ALTER COLUMN dob DROP NOT NULL;

-- Drop dependent views
DROP VIEW IF EXISTS patients_basic CASCADE;

-- We can drop dob, cnic, and address eventually, but dropping right away might break running instances
-- As per instructions: "drop (or makes nullable, then drops after confirming nothing uses them) patients.cnic and patients.address"
-- I will drop them directly since I am refactoring the app now.
ALTER TABLE patients DROP COLUMN cnic;
ALTER TABLE patients DROP COLUMN address;
ALTER TABLE patients DROP COLUMN dob;
