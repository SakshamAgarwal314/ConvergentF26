import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  const app = buildApp(config);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    const timeout = setTimeout(() => {
      app.log.error('Shutdown timed out');
      process.exit(1);
    }, 10_000);
    timeout.unref();

    try {
      await app.close();
    } catch (error) {
      app.log.error(error, 'Shutdown failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  };

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error, 'Server failed to start');
    await app.close();
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Server startup failed');
  process.exitCode = 1;
});
