import { loadSupabaseConfig } from './config.js';

async function main() {
  const config = loadSupabaseConfig();
  if (!config) {
    throw new Error('Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to backend/.env first');
  }

  // Auth settings accepts publishable keys; the REST OpenAPI root requires a secret key.
  // This read-only check does not inspect patient records.
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(`Supabase Auth API check failed (HTTP ${response.status}); check project URL, publishable key, and project status`);
  }
  console.log('Supabase Auth API is reachable and accepted the publishable key. No records were changed.');
}

main().catch((error: unknown) => {
  // Do not print response bodies, URLs, keys, or full network error objects.
  console.error(error instanceof Error && error.message.startsWith('fetch')
    ? 'Could not reach Supabase. Check the project URL, network access, and project status.'
    : error instanceof Error ? error.message : 'Supabase connection check failed');
  process.exitCode = 1;
});
