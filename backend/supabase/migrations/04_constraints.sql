-- Exclusion constraint for double-booking
ALTER TABLE appointments
ADD CONSTRAINT prevent_double_booking
EXCLUDE USING gist (
  doctor_id WITH =,
  tstzrange(scheduled_start, scheduled_end) WITH &&
) WHERE (status != 'cancelled');

-- Indexes on foreign keys
CREATE INDEX idx_doctor_profiles_clinic_id ON doctor_profiles(clinic_id);
CREATE INDEX idx_staff_profiles_clinic_id ON staff_profiles(clinic_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX idx_medical_records_appointment_id ON medical_records(appointment_id);
CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_doctor_id ON medical_records(doctor_id);
CREATE INDEX idx_prescriptions_record_id ON prescriptions(record_id);
CREATE INDEX idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor_id ON prescriptions(doctor_id);
CREATE INDEX idx_prescription_items_prescription_id ON prescription_items(prescription_id);
CREATE INDEX idx_prescription_versions_prescription_id ON prescription_versions(prescription_id);
CREATE INDEX idx_follow_up_instructions_record_id ON follow_up_instructions(record_id);
CREATE INDEX idx_follow_ups_record_id ON follow_ups(record_id);
CREATE INDEX idx_follow_ups_patient_id ON follow_ups(patient_id);
CREATE INDEX idx_follow_ups_doctor_id ON follow_ups(doctor_id);
CREATE INDEX idx_follow_ups_approved_by ON follow_ups(approved_by);
CREATE INDEX idx_sms_deliveries_follow_up_id ON sms_deliveries(follow_up_id);
