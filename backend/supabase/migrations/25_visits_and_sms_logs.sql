-- Migration 25: Visits, Visit Versions, SMS Logs, Indexes, Security, RLS and Backfills

-- 1. Visits Table
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  patient_mrn TEXT NOT NULL,
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  prescription TEXT NOT NULL,
  followup_text TEXT NULL,
  followup_period TEXT NULL,
  draft_message TEXT NULL,
  draft_language TEXT DEFAULT 'en',
  agent_model TEXT DEFAULT 'llama-3.3-70b-versatile',
  langsmith_run_id TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist on visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS patient_mrn TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS followup_text TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS followup_period TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS draft_message TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS draft_language TEXT DEFAULT 'en';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS agent_model TEXT DEFAULT 'llama-3.3-70b-versatile';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS langsmith_run_id TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- 2. Visit Versions Table (for archiving previous versions when doctor edits prescription)
CREATE TABLE IF NOT EXISTS visit_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  version INT NOT NULL,
  prescription TEXT NOT NULL,
  followup_text TEXT NULL,
  edited_by_doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SMS Logs Table (one row per send attempt, never overwritten)
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  patient_mrn TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_message_id TEXT NULL,
  provider_response JSONB NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'delivered', 'failed'
  attempt_number INT NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist on sms_logs
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE CASCADE;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS patient_mrn TEXT;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS to_phone TEXT;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS message_body TEXT;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 4. Status Check Constraint on sms_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sms_logs_status_v2'
  ) THEN
    ALTER TABLE sms_logs ADD CONSTRAINT chk_sms_logs_status_v2 CHECK (status IN ('queued', 'sent', 'delivered', 'failed'));
  END IF;
END $$;

-- 5. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_visits_mrn ON visits(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_visits_doc_created ON visits(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_appointment ON visits(appointment_id);

CREATE INDEX IF NOT EXISTS idx_sms_logs_mrn ON sms_logs(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_sms_logs_doc_created ON sms_logs(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_visit ON sms_logs(visit_id);

-- 6. Row Level Security (RLS) Policies
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage own visits" ON visits;
DROP POLICY IF EXISTS "Doctors can manage own visit versions" ON visit_versions;
DROP POLICY IF EXISTS "Doctors can manage own sms logs" ON sms_logs;

CREATE POLICY "Doctors can manage own visits" ON visits FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can manage own visit versions" ON visit_versions FOR ALL
  TO authenticated
  USING (edited_by_doctor_id = auth.uid())
  WITH CHECK (edited_by_doctor_id = auth.uid());

CREATE POLICY "Doctors can manage own sms logs" ON sms_logs FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- 7. Backfill patient_mrn for any existing rows without MRN
UPDATE visits v SET patient_mrn = p.mrn FROM patients p WHERE v.patient_id = p.id AND (v.patient_mrn IS NULL OR v.patient_mrn = '');
UPDATE sms_logs s SET patient_mrn = p.mrn FROM patients p WHERE s.patient_id = p.id AND (s.patient_mrn IS NULL OR s.patient_mrn = '');
