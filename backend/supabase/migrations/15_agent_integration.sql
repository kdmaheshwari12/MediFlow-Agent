-- Migration 15: Agent integration, clinic send modes, follow-up parameters, patient summaries, agent events, and SMS send gate update.

-- 1. Clinics: timezone and followup_send_mode
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS followup_send_mode TEXT NOT NULL DEFAULT 'doctor_review';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clinics_followup_send_mode'
  ) THEN
    ALTER TABLE clinics ADD CONSTRAINT chk_clinics_followup_send_mode CHECK (followup_send_mode IN ('auto', 'doctor_review'));
  END IF;
END $$;

-- 2. Medical Records: follow-up checkup parameters
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN NULL;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS follow_up_after_days SMALLINT NULL;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS follow_up_notes TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_medical_records_follow_up_days'
  ) THEN
    ALTER TABLE medical_records ADD CONSTRAINT chk_medical_records_follow_up_days CHECK (
      follow_up_after_days IS NULL OR (follow_up_after_days >= 1 AND follow_up_after_days <= 90)
    );
  END IF;
END $$;

-- 3. Patient Summaries: multi-doctor tenancy & agent schema alignment
ALTER TABLE patient_summaries ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE CASCADE;
ALTER TABLE patient_summaries ADD COLUMN IF NOT EXISTS summary_text TEXT;
ALTER TABLE patient_summaries ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE patient_summaries ADD COLUMN IF NOT EXISTS records_analyzed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE patient_summaries ADD COLUMN IF NOT EXISTS model TEXT;

-- Backfill summary_text from summary column if null
UPDATE patient_summaries SET summary_text = summary WHERE summary_text IS NULL AND summary IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_patient_summaries_patient_doctor'
  ) THEN
    ALTER TABLE patient_summaries ADD CONSTRAINT uniq_patient_summaries_patient_doctor UNIQUE (patient_id, doctor_id);
  END IF;
END $$;

-- 4. Follow Ups: agent outputs, guardrail results, and auto-approval metadata
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT true;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS suggested_date DATE;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS ai_reasoning_summary TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS guardrail_result JSONB;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMPTZ;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS needs_review_reasons JSONB;

-- 5. Agent Runs and Agent Events Tables
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_id ON agent_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_doctor_id ON agent_events(doctor_id);

-- 6. Security: RLS for agent_runs and agent_events
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own agent runs" ON agent_runs FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can manage own agent events" ON agent_events FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- 7. Add tables to Supabase Realtime publication if publication exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_events, patient_summaries;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 8. Update SMS Delivery Gate Function
CREATE OR REPLACE FUNCTION check_sms_delivery_gate()
RETURNS TRIGGER AS $$
DECLARE
  f_status TEXT;
  f_final_content TEXT;
  f_auto_approved_at TIMESTAMPTZ;
  f_risk_flags JSONB;
BEGIN
  SELECT status, final_content, auto_approved_at, risk_flags
  INTO f_status, f_final_content, f_auto_approved_at, f_risk_flags
  FROM follow_ups WHERE id = NEW.follow_up_id;

  IF f_final_content IS NULL OR f_final_content = '' THEN
    RAISE EXCEPTION 'Cannot create SMS delivery without final content';
  END IF;

  IF f_status = 'approved' THEN
    RETURN NEW;
  ELSIF f_status = 'queued' AND f_auto_approved_at IS NOT NULL AND (f_risk_flags IS NULL OR jsonb_array_length(f_risk_flags) = 0) THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Cannot create SMS delivery for unapproved or unsafe follow-up (status: %, auto_approved_at: %)', f_status, f_auto_approved_at;
  END IF;
END;
$$ LANGUAGE 'plpgsql';
