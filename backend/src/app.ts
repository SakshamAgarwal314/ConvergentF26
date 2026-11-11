import Fastify from 'fastify';
import type { Config } from './config.js';

export function buildApp(config: Config) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
  });

  // Liveness only. Database readiness will be added when a database exists.
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' }));

  return app;
}
