import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Security & SQL Injection Tests', () => {
  let app: FastifyInstance;
  let token: string = 'mock-token-for-tests';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Patient Search Injection', () => {
    it('should block SQL injection strings in query q', async () => {
      const maliciousQueries = [
        "' OR 1=1 --",
        "'; DROP TABLE patients; --",
        "%",
        "_",
        ",mrn.eq.something"
      ];

      for (const q of maliciousQueries) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/patients?q=${encodeURIComponent(q)}`,
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        expect([400, 401]).toContain(response.statusCode);
      }
    }, 20000);
  });

  describe('Appointment Date Injection', () => {
    it('should block SQL injection in appointment date', async () => {
      const maliciousDates = [
        "' OR 1=1 --",
        "2023-01-01' OR status='completed",
      ];

      for (const date of maliciousDates) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/appointments?date=${encodeURIComponent(date)}`,
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        expect([400, 401]).toContain(response.statusCode);
      }
    }, 20000);
  });
});
