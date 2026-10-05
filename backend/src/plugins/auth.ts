import fp from 'fastify-plugin';
import { supabaseAdmin } from '../lib/supabase';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOnboarded: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireDoctor: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireStaff: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
      role: 'doctor' | 'staff' | 'patient';
      onboarding_status: string;
    };
    token?: string;
  }
}

export const authPlugin = fp(async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } });
      }

      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
      }

      let role: 'doctor' | 'staff' | 'patient' = 'patient';
      let onboarding_status = 'complete';

      const [{ data: doctor }, { data: staff }] = await Promise.all([
        supabaseAdmin.from('doctor_profiles').select('id, onboarding_status').eq('id', user.id).maybeSingle(),
        supabaseAdmin.from('staff_profiles').select('id, onboarding_status').eq('id', user.id).maybeSingle()
      ]);

      if (doctor) {
        role = 'doctor';
        onboarding_status = doctor.onboarding_status;
      } else if (staff) {
        role = 'staff';
        onboarding_status = staff.onboarding_status;
      } else {
        // Fallback to user_metadata if profile row is not yet queried or inserted
        const metaRole = (user.user_metadata?.role as string | undefined)?.toLowerCase();
        if (metaRole === 'doctor') {
          role = 'doctor';
          onboarding_status = 'in_progress';
          await supabaseAdmin.from('doctor_profiles').insert({
            id: user.id,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'Doctor',
            phone: user.user_metadata?.phone || '',
            onboarding_status: 'in_progress',
            onboarding_step: 'info'
          }).select().maybeSingle();
        } else if (metaRole === 'staff' || metaRole === 'receptionist') {
          role = 'staff';
          onboarding_status = 'complete';
          await supabaseAdmin.from('staff_profiles').insert({
            id: user.id,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'Staff',
            phone: user.user_metadata?.phone || '',
            onboarding_status: 'complete'
          }).select().maybeSingle();
        }
      }

      request.user = {
        id: user.id,
        email: user.email,
        role,
        onboarding_status
      };
      request.token = token;

    } catch (err: any) {
      request.log.error({ err: err.message }, '[authPlugin] Authentication Exception');
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed' } });
    }
  });

  fastify.decorate('requireOnboarded', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.onboarding_status !== 'complete') {
      request.log.warn(`[requireOnboarded] 403 Incomplete onboarding for user ${request.user?.id}`);
      return reply.status(403).send({ error: { code: 'ONBOARDING_INCOMPLETE', message: 'Onboarding is not complete' } });
    }
  });

  fastify.decorate('requireDoctor', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'doctor') {
      request.log.warn(`[requireDoctor] 403 Forbidden: User ${request.user?.id} has role '${request.user?.role}'`);
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Doctor access required' } });
    }
  });

  fastify.decorate('requireStaff', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== 'staff') {
      request.log.warn(`[requireStaff] 403 Forbidden: User ${request.user?.id} has role '${request.user?.role}'`);
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Receptionist access required' } });
    }
  });
});

