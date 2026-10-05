-- 1. updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('clinics', 'doctor_profiles', 'staff_profiles', 'patients', 'appointments', 'medical_records', 'prescriptions', 'prescription_items', 'follow_up_instructions', 'follow_ups', 'sms_deliveries')
  LOOP
    EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()', t, t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. MRN Sequence
CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START 10001;

CREATE OR REPLACE FUNCTION set_patient_mrn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mrn IS NULL THEN
    NEW.mrn := 'MRN-' || nextval('patient_mrn_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trigger_set_patient_mrn
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE PROCEDURE set_patient_mrn();

-- 3. Prescription Versioning
CREATE OR REPLACE FUNCTION trigger_prescription_versioning()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  INSERT INTO prescription_versions (prescription_id, version, snapshot)
  VALUES (OLD.id, OLD.version, row_to_json(OLD)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_prescription_version
BEFORE UPDATE ON prescriptions
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.* AND NEW.version = OLD.version)
EXECUTE PROCEDURE trigger_prescription_versioning();

-- 4. SMS Delivery Gate
CREATE OR REPLACE FUNCTION check_sms_delivery_gate()
RETURNS TRIGGER AS $$
DECLARE
  f_status TEXT;
  f_final_content TEXT;
BEGIN
  SELECT status, final_content INTO f_status, f_final_content
  FROM follow_ups WHERE id = NEW.follow_up_id;
  
  IF f_status != 'approved' THEN
    RAISE EXCEPTION 'Cannot create SMS delivery for unapproved follow-up';
  END IF;
  
  IF f_final_content IS NULL OR f_final_content = '' THEN
    RAISE EXCEPTION 'Cannot create SMS delivery without final content';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trigger_sms_delivery_gate
BEFORE INSERT ON sms_deliveries
FOR EACH ROW
EXECUTE PROCEDURE check_sms_delivery_gate();
