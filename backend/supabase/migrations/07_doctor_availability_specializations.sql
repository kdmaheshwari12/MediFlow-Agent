-- Migration 07: Doctor Specializations, Availability, and Time Off

-- 1. Create Specializations Table
CREATE TABLE IF NOT EXISTS specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Doctor Specializations Table
CREATE TABLE IF NOT EXISTS doctor_specializations (
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  specialization_id UUID NOT NULL REFERENCES specializations(id) ON DELETE RESTRICT,
  years_experience SMALLINT CHECK (years_experience >= 0 AND years_experience <= 70),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doctor_id, specialization_id)
);

-- Ensure only one primary specialization per doctor
CREATE UNIQUE INDEX idx_doctor_primary_specialization ON doctor_specializations (doctor_id) WHERE is_primary = true;

-- 3. Create Doctor Availability Table
CREATE TABLE IF NOT EXISTS doctor_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  slot_minutes SMALLINT NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT end_after_start CHECK (end_time > start_time),
  CONSTRAINT break_valid CHECK (
    (break_start IS NULL AND break_end IS NULL) OR 
    (break_end > break_start AND break_start >= start_time AND break_end <= end_time)
  )
);

-- Prevent overlapping ranges for the same doctor and weekday
-- Standard exclusion constraint would use btree_gist, but we can just use a UNIQUE constraint on (doctor_id, weekday)
-- Assuming doctors have a simple 1 schedule per weekday (morning to evening + break) rather than complex multiple shifts
CREATE UNIQUE INDEX idx_doctor_availability_day ON doctor_availability(doctor_id, weekday) WHERE is_active = true;

-- 4. Create Doctor Time Off Table
CREATE TABLE IF NOT EXISTS doctor_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ends_after_start CHECK (ends_on >= starts_on)
);

-- 5. Update Clinics
ALTER TABLE clinics ADD COLUMN timezone TEXT DEFAULT 'Asia/Karachi';

-- 6. RLS Policies

-- specializations: read-only for authenticated, write by service_role only
ALTER TABLE specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view specializations" ON specializations FOR SELECT TO authenticated USING (true);

-- doctor_specializations: doctors can manage their own, staff can read
ALTER TABLE doctor_specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own specializations" ON doctor_specializations FOR ALL TO authenticated USING (auth.uid() = doctor_id);
CREATE POLICY "Staff can read all doctor specializations" ON doctor_specializations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- doctor_availability: doctors can manage their own, staff can read
ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own availability" ON doctor_availability FOR ALL TO authenticated USING (auth.uid() = doctor_id);
CREATE POLICY "Staff can read all doctor availability" ON doctor_availability FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- doctor_time_off: doctors can manage their own, staff can read
ALTER TABLE doctor_time_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own time off" ON doctor_time_off FOR ALL TO authenticated USING (auth.uid() = doctor_id);
CREATE POLICY "Staff can read all doctor time off" ON doctor_time_off FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- 7. Seed Standard Specializations
INSERT INTO specializations (name, slug) VALUES 
  ('General Physician', 'general-physician'),
  ('Cardiology', 'cardiology'),
  ('Dermatology', 'dermatology'),
  ('Pediatrics', 'pediatrics'),
  ('Gynecology & Obstetrics', 'gynecology-obstetrics'),
  ('Orthopedics', 'orthopedics'),
  ('ENT (Ear, Nose & Throat)', 'ent'),
  ('Ophthalmology', 'ophthalmology'),
  ('Neurology', 'neurology'),
  ('Psychiatry', 'psychiatry'),
  ('Urology', 'urology'),
  ('Gastroenterology', 'gastroenterology'),
  ('Pulmonology', 'pulmonology'),
  ('Endocrinology', 'endocrinology'),
  ('Nephrology', 'nephrology'),
  ('Oncology', 'oncology'),
  ('Dentistry', 'dentistry'),
  ('Radiology', 'radiology'),
  ('Internal Medicine', 'internal-medicine'),
  ('General Surgery', 'general-surgery')
ON CONFLICT (slug) DO NOTHING;

-- 8. Backfill Doctor Specializations
-- For any existing doctor that has a string in `doctor_profiles.specialization`, 
-- try to map it to a specialization ID. If missing, we create it dynamically.

DO $$
DECLARE
  rec RECORD;
  spec_id UUID;
  clean_slug TEXT;
BEGIN
  FOR rec IN SELECT id, specialization, experience_years FROM doctor_profiles WHERE specialization IS NOT NULL AND specialization <> ''
  LOOP
    -- Generate basic slug
    clean_slug := lower(regexp_replace(rec.specialization, '[^a-zA-Z0-9]+', '-', 'g'));
    clean_slug := trim(both '-' from clean_slug);
    
    -- Try to find it
    SELECT id INTO spec_id FROM specializations WHERE slug = clean_slug;
    
    -- If not found, insert it
    IF spec_id IS NULL THEN
      INSERT INTO specializations (name, slug) VALUES (rec.specialization, clean_slug) RETURNING id INTO spec_id;
    END IF;

    -- Insert into doctor_specializations
    BEGIN
      INSERT INTO doctor_specializations (doctor_id, specialization_id, years_experience, is_primary)
      VALUES (rec.id, spec_id, rec.experience_years, true);
    EXCEPTION WHEN unique_violation THEN
      -- do nothing
    END;
  END LOOP;
END
$$;
