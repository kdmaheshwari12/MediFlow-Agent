-- Migration 18: Auto create doctor/staff profile on auth user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger AS $$
DECLARE
  user_role text;
  user_name text;
  user_phone text;
  user_clinic_id uuid;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'doctor');
  user_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));
  user_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');

  IF user_role = 'doctor' THEN
    INSERT INTO public.doctor_profiles (id, name, phone, onboarding_status, onboarding_step)
    VALUES (NEW.id, user_name, user_phone, 'in_progress', 'info')
    ON CONFLICT (id) DO NOTHING;
  ELSIF user_role = 'staff' OR user_role = 'receptionist' THEN
    IF (NEW.raw_user_meta_data->>'clinic_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'clinic_id') != '' THEN
      user_clinic_id := (NEW.raw_user_meta_data->>'clinic_id')::uuid;
    ELSE
      SELECT id INTO user_clinic_id FROM public.clinics LIMIT 1;
      IF user_clinic_id IS NULL THEN
        INSERT INTO public.clinics (name) VALUES ('CareFlow Clinic') RETURNING id INTO user_clinic_id;
      END IF;
    END IF;

    INSERT INTO public.staff_profiles (id, clinic_id, name, phone, onboarding_status)
    VALUES (NEW.id, user_clinic_id, user_name, user_phone, 'complete')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();
