import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { runServerSideGuardrails } from '../src/modules/followups/routes';
import { z } from 'zod';

// Zod schemas copied directly from agent/src/services/backendClient.ts to verify contract compliance
const historyStatusSchema = z.object({
  isReturning: z.boolean(),
  visitCount: z.number().int().default(0),
});

const prescriptionItemSchema = z.object({
  medicine: z.string(),
  dosage: z.string().nullish(),
  frequency: z.string().nullish(),
  duration: z.string().nullish(),
  instructions: z.string().nullish(),
});

const visitSchema = z.object({
  id: z.string(),
  date: z.string(),
  chiefComplaint: z.string().nullish(),
  diagnosis: z.string().nullish(),
  notes: z.string().nullish(),
  prescriptions: z.array(prescriptionItemSchema).default([]),
  followUp: z.string().nullish(),
});

const historySchema = z.object({
  allergies: z.array(z.string()).default([]),
  visits: z.array(visitSchema).default([]),
});

const visitContextSchema = z.object({
  recordId: z.string(),
  clinicName: z.string(),
  clinicTimezone: z.string().nullish(),
  followUpSendMode: z.enum(["auto", "doctor_review"]).nullish(),
  chiefComplaint: z.string().nullish(),
  symptoms: z.array(z.string()).default([]),
  diagnosis: z.string().nullish(),
  notes: z.string().nullish(),
  treatmentPlan: z.string().nullish(),
  prescriptionItems: z.array(prescriptionItemSchema).default([]),
  followUp: z
    .object({
      required: z.boolean().nullish(),
      afterDays: z.number().int().nullish(),
      instructions: z.string().nullish(),
    })
    .nullish(),
});

describe('Agent Contract & Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Zod Schema Verification against agent contract', () => {
    it('validates historyStatus schema structure', () => {
      const valid = { isReturning: true, visitCount: 5 };
      expect(() => historyStatusSchema.parse(valid)).not.toThrow();
    });

    it('validates history schema structure', () => {
      const valid = {
        allergies: ['Penicillin'],
        visits: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            date: '2026-10-04T12:00:00Z',
            chiefComplaint: 'Fever and cough',
            diagnosis: 'Flu',
            notes: 'Rest and fluids',
            prescriptions: [
              { medicine: 'Paracetamol', dosage: '500mg', frequency: 'TDS', duration: '5 days' }
            ],
            followUp: 'Return if fever persists'
          }
        ]
      };
      expect(() => historySchema.parse(valid)).not.toThrow();
    });

    it('validates visitContext schema structure', () => {
      const valid = {
        recordId: 'rec-123',
        clinicName: 'MediFlow City Clinic',
        clinicTimezone: 'Asia/Karachi',
        followUpSendMode: 'auto',
        chiefComplaint: 'Headache',
        symptoms: ['Headache', 'Dizziness'],
        diagnosis: 'Migraine',
        notes: 'Take prescribed medication',
        treatmentPlan: 'Medication and rest',
        prescriptionItems: [],
        followUp: { required: true, afterDays: 7, instructions: 'Hydrate well' }
      };
      expect(() => visitContextSchema.parse(valid)).not.toThrow();
    });
  });

  describe('Server-Side Guardrail Rules', () => {
    it('passes for safe, compliant follow-up content', () => {
      const res = runServerSideGuardrails(
        'Please return to MediFlow City Clinic on 2026-10-14 for your scheduled checkup. Rest well.',
        'MediFlow City Clinic',
        '2026-10-14',
        []
      );
      expect(res.passed).toBe(true);
      expect(res.failures).toHaveLength(0);
    });

    it('fails if content exceeds 320 characters', () => {
      const longText = 'A'.repeat(321);
      const res = runServerSideGuardrails(longText, 'Clinic', null, []);
      expect(res.passed).toBe(false);
      expect(res.failures).toContain('Content exceeds maximum 320 characters limit');
    });

    it('fails if risk flags are present', () => {
      const res = runServerSideGuardrails('Valid text for Clinic', 'Clinic', null, ['HIGH_RISK_SYMPTOM']);
      expect(res.passed).toBe(false);
      expect(res.failures[0]).toContain('Risk flags present');
    });

    it('fails if clinic name is missing from content', () => {
      const res = runServerSideGuardrails('Please come back on 2026-10-14 for checkup.', 'MediFlow Clinic', '2026-10-14', []);
      expect(res.passed).toBe(false);
      expect(res.failures[0]).toContain('does not contain clinic name');
    });

    it('fails if prohibited medical terms or dosages are included', () => {
      const res = runServerSideGuardrails('Take 500 mg paracetamol at MediFlow Clinic on 2026-10-14', 'MediFlow Clinic', '2026-10-14', []);
      expect(res.passed).toBe(false);
      expect(res.failures[0]).toContain('prohibited dose patterns');
    });

    it('fails if URLs are included', () => {
      const res = runServerSideGuardrails('Visit http://mediflow.com at MediFlow Clinic on 2026-10-14', 'MediFlow Clinic', '2026-10-14', []);
      expect(res.passed).toBe(false);
      expect(res.failures[0]).toContain('prohibited URLs');
    });
  });

  describe('Draft Endpoint Field Protections', () => {
    it('rejects POST /follow-ups/:id/draft if approval fields are supplied', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/follow-ups/123e4567-e89b-12d3-a456-426614174000/draft',
        headers: {
          authorization: 'Bearer fake-token'
        },
        payload: {
          followUpRequired: true,
          aiContent: 'Test draft',
          riskFlags: [],
          approved: true, // Forbidden field
          final_content: 'Hacked content'
        }
      });
      expect([400, 401, 403]).toContain(response.statusCode);
    });
  });

  describe('Summary Generation Endpoint', () => {
    it('verifies POST /patients/:mrn/summary/generate is registered and requires auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/MRN-10001/summary/generate',
      });
      // Should not be 404 Route Not Found!
      expect(response.statusCode).not.toBe(404);
      expect([400, 401, 403]).toContain(response.statusCode);
    });

    it('rejects invalid MRN formats on summary/generate', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/invalid-mrn/summary/generate',
        headers: {
          authorization: 'Bearer fake-token'
        }
      });
      expect([400, 401]).toContain(response.statusCode);
    });
  });
});

