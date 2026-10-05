import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createScopedClient } from '../../lib/supabase';

const agentEventSchema = z.object({
  runId: z.string(),
  mode: z.string(),
  stage: z.string(),
  status: z.string(),
  message: z.string().optional().nullable(),
  timestamp: z.string().optional().nullable(),
});

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/agent/events', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const data = agentEventSchema.parse(request.body);
    const client = createScopedClient(request.token!);
    const doctor_id = request.user!.id;

    try {
      await client.from('agent_runs').upsert(
        { run_id: data.runId, doctor_id, mode: data.mode },
        { onConflict: 'run_id' }
      );
    } catch {
      // ignore optional run tracking error
    }


    const { data: event, error } = await client.from('agent_events')
      .insert({
        run_id: data.runId,
        doctor_id,
        mode: data.mode,
        stage: data.stage,
        status: data.status,
        message: data.message || null,
        timestamp: data.timestamp || new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: 'SAVE_EVENT_FAILED', message: error.message } });
    }

    return reply.status(201).send({ status: 'ok', event });
  });
};
