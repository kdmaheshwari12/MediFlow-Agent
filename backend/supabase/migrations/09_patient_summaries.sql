CREATE TABLE IF NOT EXISTS patient_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 0,
  covered_through_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_summaries ENABLE ROW LEVEL SECURITY;

-- Staff Policy: Can read and manage patient summaries
CREATE POLICY "Staff can manage patient summaries"
  ON patient_summaries
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid()));

-- Doctor Policy: Can read and manage patient summaries for their patients
CREATE POLICY "Doctors can manage their patient summaries"
  ON patient_summaries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM doctor_profiles WHERE id = auth.uid()) 
    AND EXISTS (
      SELECT 1 FROM doctor_patients 
      WHERE doctor_patients.patient_id = patient_summaries.patient_id 
      AND doctor_patients.doctor_id = auth.uid()
    )
  );

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_patient_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patient_summaries_timestamp
BEFORE UPDATE ON patient_summaries
FOR EACH ROW
EXECUTE FUNCTION update_patient_summaries_updated_at();
