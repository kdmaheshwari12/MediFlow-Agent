-- Migration 13: Allow clinic_id to be NULL on doctor_profiles during initial signup before onboarding
ALTER TABLE public.doctor_profiles ALTER COLUMN clinic_id DROP NOT NULL;
