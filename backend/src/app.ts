import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { authPlugin } from './plugins/auth';
import { errorHandlerPlugin } from './plugins/error-handler';
import { authRoutes } from './modules/auth/routes';
import { patientRoutes } from './modules/patients/routes';
import { appointmentRoutes } from './modules/appointments/routes';
import { recordRoutes } from './modules/records/routes';
import { followupRoutes } from './modules/followups/routes';
import { doctorRoutes } from './modules/doctors/routes';
import { agentRoutes } from './modules/agent/routes';
import { checkupRoutes } from './modules/checkup/routes';
import { messageRoutes } from './modules/messages/routes';

export async function buildApp() {
  const app = fastify({
    logger: {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-user-token"]',
          'req.headers["authorization"]',
          'headers.authorization',
          'headers["x-user-token"]',
          'body.phone',
          'body.summaryText',
          'body.aiContent',
          'body.draft',
          'body.token',
          'token',
          'authorization',
        ],
        censor: '[REDACTED]',
      },
    },
  });

  // Custom JSON Content-Type parser to handle empty bodies gracefully
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Security Plugins
  await app.register(helmet, {
    global: true,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'my-super-secret-cookie-key-for-mediflow-dev-only',
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile/Postman) or any localhost/127.0.0.1 origin
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-token', 'Cookie'],
  });

  // Rate Limiting (1000 requests/minute for live UI polling)
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  // Plugins
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(patientRoutes, { prefix: '/api/v1' });
  await app.register(appointmentRoutes, { prefix: '/api/v1' });
  await app.register(recordRoutes, { prefix: '/api/v1' });
  await app.register(followupRoutes, { prefix: '/api/v1' });
  await app.register(doctorRoutes, { prefix: '/api/v1' });
  await app.register(agentRoutes, { prefix: '/api/v1' });
  await app.register(checkupRoutes, { prefix: '/api/v1' });
  await app.register(messageRoutes, { prefix: '/api/v1' });

  // Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'MediFlow API',
        description: 'Backend API for MediFlow system',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:4000' }],
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => ({ status: 'ready' }));

  return app;
}
