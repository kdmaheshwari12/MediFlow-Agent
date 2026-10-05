import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('App', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('should return ok for /health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ status: 'ok' });
  });

  it('should return ready for /ready', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ status: 'ready' });
  });

  it('should gracefully handle empty body when content-type is application/json', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/health',
      headers: {
        'content-type': 'application/json'
      },
      payload: ''
    });
    // Should not fail with FST_ERR_CTP_EMPTY_JSON_BODY
    expect(res.statusCode).not.toBe(500);
    const body = JSON.parse(res.payload);
    expect(body.error?.code).not.toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
  });
});
