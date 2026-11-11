const environments = ['development', 'test', 'production'] as const;
const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export function loadSupabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) {
    throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be an HTTPS project URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must be an HTTPS project URL without credentials, path, query, or fragment');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key beginning sb_publishable_');
  }
  return { url: parsed.origin, publishableKey };
}

function enumValue<T extends string>(
  name: string,
  value: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim() || host !== host.trim() || /[\s/]/.test(host)) {
    throw new Error('HOST must be a hostname or IP address without spaces or a URL scheme');
  }

  return {
    nodeEnv: enumValue('NODE_ENV', env.NODE_ENV ?? 'development', environments),
    host,
    port: Number(port),
    logLevel: enumValue('LOG_LEVEL', env.LOG_LEVEL ?? 'info', logLevels),
    supabase: loadSupabaseConfig(env),
  };
}

export type Config = ReturnType<typeof loadConfig>;
