import fp from 'fastify-plugin';
import { ZodError } from 'zod';

export const errorHandlerPlugin = fp(async (fastify) => {
  fastify.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;
    const err = error as any;
    
    if (error instanceof ZodError) {
      const details = error.issues?.map((issue) => {
        let index: number | undefined;
        let field = issue.path.join('.');

        // Extract index and field if path looks like ['items', 0, 'start_time']
        if (issue.path.length >= 2 && typeof issue.path[1] === 'number') {
          index = issue.path[1] as number;
          field = String(issue.path[2] || issue.path[1]);
        } else if (issue.path.length >= 1 && typeof issue.path[0] === 'number') {
          index = issue.path[0] as number;
          field = String(issue.path[1] || issue.path[0]);
        }

        return {
          index,
          field,
          message: issue.message,
        };
      }) || [];

      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please fix the highlighted fields',
          details,
          requestId,
        },
      });
    }

    if (err && typeof err.statusCode === 'number') {
      return reply.status(err.statusCode).send({
        error: {
          code: err.code || 'ERROR',
          message: err.message || 'Error occurred',
          details: err.details,
          requestId
        }
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId
      }
    });
  });
});
