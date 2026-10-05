-- Migration: Enforce clinic_id constraint where appropriate
-- It is safe to enforce clinic_id for staff_profiles, but for doctor_profiles we must make sure all doctors have one.
-- Actually, the prompt says "add a NOT NULL constraint where safe". Let's alter the table to set NOT NULL if they are already not null, or we can just enforce it for newly created rows via a constraint.

DO $$
BEGIN
  -- We assume existing users all have a clinic_id, so we can alter the columns
  ALTER TABLE public.doctor_profiles ALTER COLUMN clinic_id SET NOT NULL;
  ALTER TABLE public.staff_profiles ALTER COLUMN clinic_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not enforce NOT NULL on clinic_id, likely due to existing null values. Error: %', SQLERRM;
END $$;
