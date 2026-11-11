# SkinDex backend

Fastify + TypeScript foundation. Requires Node.js 22 or newer and npm.

From the repository root:

```bash
cd backend
npm ci
npm run dev
```

In another terminal:

```bash
curl http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok"}`.

Configuration is optional: copy `.env.example` to `.env` inside `backend/` to override defaults. Shell environment variables take precedence over the file. Run scripts from this directory so the environment file resolves correctly. Never commit `.env` or secrets.

| Variable | Default | Validation |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `HOST` | `127.0.0.1` | Nonempty hostname/IP without whitespace or URL scheme; use `0.0.0.0` for container access |
| `PORT` | `3000` | Integer 1–65535 |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

Invalid configuration stops startup with a nonzero exit code. Other environment variables are left alone for operating-system/tool compatibility.

## Supabase development project

In the Supabase dashboard, open the project's Connect dialog to find its project URL and publishable key. Settings → API Keys also lists keys. Put these values in `backend/.env`:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_actual_key
```

Use the publishable key for this setup; no database password or secret/service-role key is needed. Both values may be absent to keep running the health endpoint, but partially configured or invalid values stop startup. Restart the development server after editing `.env`.

From `backend/`, run:

```bash
npm run check:supabase
```

This makes a read-only request to the project's Auth settings endpoint (`/auth/v1/settings`), with a 10-second timeout. Success confirms Auth API reachability and key acceptance; it does not verify the Data API, database migrations, user sign-in, patient permissions, or a direct PostgreSQL connection. It neither creates tables nor changes data. The script prints no key or API response body. The REST OpenAPI root is unsuitable for this check because it requires a secret key.

Reference: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Build and run

```bash
npm run typecheck
npm run build
npm start
```

`npm run check` runs both typechecking and compilation. Development watches TypeScript source for changes; restart after changing environment configuration. Production startup runs compiled files from `dist/`. SIGINT/SIGTERM close the server gracefully.

`src/app.ts` constructs the application separately from `src/server.ts`, which loads configuration and opens the listening socket. Add feature modules under `src/` as their milestones begin. `/health` reports process liveness only; Supabase, authentication, database migrations, and patient endpoints are subsequent steps.

Framework reference: [Fastify TypeScript documentation](https://fastify.dev/docs/latest/Reference/TypeScript/).
