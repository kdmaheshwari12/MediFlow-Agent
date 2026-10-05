DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('clinics', 'doctor_profiles', 'staff_profiles', 'patients', 'doctor_patients', 'appointments', 'medical_records', 'prescriptions', 'prescription_items', 'prescription_versions', 'follow_up_instructions', 'follow_ups', 'sms_deliveries', 'audit_log')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Doctor Profiles
CREATE POLICY "Users can view own doctor profile" ON doctor_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own doctor profile" ON doctor_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own doctor profile" ON doctor_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Staff can view doctor profiles" ON doctor_profiles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- Staff Profiles
CREATE POLICY "Users can view own staff profile" ON staff_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own staff profile" ON staff_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own staff profile" ON staff_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Clinics
CREATE POLICY "Clinics are viewable by authenticated users" ON clinics FOR SELECT TO authenticated USING (true);

-- Patients
CREATE POLICY "Doctors can view linked patients" ON patients FOR SELECT
USING (EXISTS (SELECT 1 FROM doctor_patients WHERE doctor_patients.patient_id = patients.id AND doctor_patients.doctor_id = auth.uid()));
CREATE POLICY "Doctors can insert patients" ON patients FOR INSERT WITH CHECK (true);
CREATE POLICY "Doctors can update linked patients" ON patients FOR UPDATE
USING (EXISTS (SELECT 1 FROM doctor_patients WHERE doctor_patients.patient_id = patients.id AND doctor_patients.doctor_id = auth.uid()));

-- Doctor Patients
CREATE POLICY "Doctors can view own patient links" ON doctor_patients FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Doctors can link own patients" ON doctor_patients FOR INSERT WITH CHECK (auth.uid() = doctor_id);

-- Staff Patient View (Security Definer by default, so bypasses RLS on patients table for the columns selected)
CREATE VIEW patients_basic AS
SELECT id, mrn, name, phone, age, gender, address, emergency_contact, sms_consent
FROM patients;
GRANT SELECT ON patients_basic TO authenticated;

-- Staff can insert patients (but they don't have direct RLS SELECT on patients table)
CREATE POLICY "Staff can insert patients" ON patients FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));
-- Allow staff to select patients for booking appointments
CREATE POLICY "Staff can select patients" ON patients FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- Appointments
CREATE POLICY "Doctors can view own appointments" ON appointments FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Doctors can update own appointments" ON appointments FOR UPDATE USING (auth.uid() = doctor_id);
CREATE POLICY "Staff can manage clinic appointments" ON appointments FOR ALL
USING (clinic_id = (SELECT clinic_id FROM staff_profiles WHERE id = auth.uid()));

-- Medical Records
CREATE POLICY "Doctors can manage own records" ON medical_records FOR ALL USING (auth.uid() = doctor_id);

-- Prescriptions
CREATE POLICY "Doctors can manage own prescriptions" ON prescriptions FOR ALL USING (auth.uid() = doctor_id);

-- Prescription Items
CREATE POLICY "Doctors can manage own prescription items" ON prescription_items FOR ALL
USING (EXISTS (SELECT 1 FROM prescriptions WHERE prescriptions.id = prescription_items.prescription_id AND prescriptions.doctor_id = auth.uid()));

-- Prescription Versions
CREATE POLICY "Doctors can view own prescription versions" ON prescription_versions FOR SELECT
USING (EXISTS (SELECT 1 FROM prescriptions WHERE prescriptions.id = prescription_versions.prescription_id AND prescriptions.doctor_id = auth.uid()));

-- Follow up instructions
CREATE POLICY "Doctors can manage own follow up instructions" ON follow_up_instructions FOR ALL
USING (EXISTS (SELECT 1 FROM medical_records WHERE medical_records.id = follow_up_instructions.record_id AND medical_records.doctor_id = auth.uid()));

-- Follow ups
CREATE POLICY "Doctors can manage own follow ups" ON follow_ups FOR ALL USING (auth.uid() = doctor_id);

-- sms_deliveries and audit_log have no policies, meaning only service_role can access them.
