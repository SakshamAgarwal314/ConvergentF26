# Skindex API

Backend for the Skindex React Native app. FastAPI on Render, Postgres and photo storage on Supabase, sign-in handled by Supabase Auth, and the dermatologist-trained skin model running on every check-in.

```
React Native app ──(Supabase Auth: sign in)──> Supabase Auth
       │  Authorization: Bearer <access token>
       ▼
FastAPI on Render ── verifies token (JWKS) ──> Postgres (Supabase)
       │                                   └─> Storage bucket "checkin-photos" (private)
       └── background task ──> ONNX skin model ──> analyses table ──> app polls the check-in
```

```
app/
  main.py            app setup, health check, local photo links
  config.py          all settings, from env vars / .env
  db.py              tables: profiles, preferences, products, cabinet_items, entries, analyses
  auth.py            Supabase token verification, profile auto-creation, admin check
  storage.py         Supabase Storage (prod) or a local folder (dev), signed URLs only
  imaging.py         decode, rotate, strip metadata, resize, quality check
  ml/analyzer.py     loads model.onnx + model.json, runs inference
  ml/pipeline.py     runs the model after a check-in and saves the result
  routers/           me, catalog (quiz, products, cabinet), entries (+ progress), admin
alembic/             database migrations
scripts/             dev model + dev login token
tests/               21 tests; run on SQLite or Postgres
```

## Run it locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
echo "SUPABASE_JWT_SECRET=dev-secret" >> .env      # lets you mint local test logins
python scripts/make_dev_model.py models/dev && echo "MODEL_DIR=models/dev" >> .env
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs. Get a test login with `python scripts/dev_token.py you@example.com`, click Authorize in the docs page, and paste the token. Without `DATABASE_URL` it uses a local SQLite file; set it to a Postgres URL and run `alembic upgrade head` to use Postgres.

The dev model is untrained and gives meaningless scores. It exists so the whole pipeline runs before the real model is ready.

Tests: `pytest -q` (SQLite) or `TEST_DATABASE_URL=postgresql://... pytest -q` (Postgres).

## Set up Supabase (once)

1. Create a project. In **Storage**, create a bucket named `checkin-photos` and leave it **private**.
2. **Settings > API Keys**: copy the project URL and a **secret key** (`sb_secret_...`). The secret key only ever goes on the server.
3. **Connect**: copy the **Session pooler** connection string. That's `DATABASE_URL`.
4. In **Authentication**, turn on the sign-in methods you want (email, Apple, Google).
5. Run the migrations once from your machine: `DATABASE_URL=... alembic upgrade head`. Render also runs them on every deploy.

Migration 0002 turns on row-level security for every table. Supabase auto-exposes public tables through its REST API, and the app never uses that API, so this blocks that path entirely while the backend keeps full access.

## Deploy on Render

Push this repo to GitHub, then in Render choose **New > Blueprint** and select the repo; `render.yaml` sets everything up. Fill in `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `ADMIN_USER_IDS` when prompted. Check `https://<your-service>.onrender.com/v1/health`: it reports the database, storage and model version.

The blueprint uses the Starter instance because free instances sleep after 15 minutes and take about a minute to wake.

## Plugging in the real model

Export the trained PyTorch model to ONNX and put it in `models/prod/` with a `model.json` (format documented at the top of `app/ml/analyzer.py`):

```python
torch.onnx.export(model.eval(), torch.randn(1, 3, 224, 224), "models/prod/model.onnx",
                  input_names=["image"], output_names=["logits"], dynamic_axes={"image": {0: "n"}})
```

`model.json` holds the version, label names shown to patients, the preprocessing (input size, mean, std, sigmoid or softmax), the display threshold, and which labels flag "see a dermatologist." Every analysis stores the model version that produced it. Commit the model (or use Git LFS if it's over ~50 MB) and redeploy.

If the model is missing or crashes, the check-in still saves; its analysis shows `skipped` or `failed`.

## Calling it from the React Native app

Sign in with `@supabase/supabase-js` using the **publishable** key, then send the access token on every request:

```ts
const { data } = await supabase.auth.getSession();
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${API_URL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session?.access_token}` } });

// new check-in
const form = new FormData();
form.append("photo", { uri: photo.uri, name: "checkin.jpg", type: "image/jpeg" } as any);
form.append("feel", "Dry");
form.append("local_date", new Date().toLocaleDateString("en-CA")); // YYYY-MM-DD, user's own day
form.append("product_ids", "1,2");
const entry = await (await api("/v1/entries", { method: "POST", body: form })).json();
// entry.analysis.status === "pending": poll GET /v1/entries/{id} every ~1s until it's "done"
```

Photo URLs in responses are signed and expire after an hour, so load them as returned and refetch the list rather than caching links.

## API

All routes except products, quiz options and health need the bearer token. Full schemas at `/docs`.

| Route | Purpose |
| --- | --- |
| `GET/PATCH/DELETE /v1/me` | profile, display name, **training consent**; delete removes photos, data and the login |
| `GET /v1/quiz/options` · `GET/PUT /v1/preferences` | skin quiz |
| `GET /v1/products` · `/v1/products/recommended` · `/v1/products/{slug}` | catalog and quiz-based picks |
| `GET/POST /v1/cabinet` · `DELETE /v1/cabinet/{id}` | the user's products |
| `GET/POST /v1/entries` | check-ins (paged with `cursor`); POST is multipart with `photo`, `feel`, `note`, `local_date`, `product_ids` |
| `GET/PATCH/DELETE /v1/entries/{id}` | one check-in, including its `analysis` |
| `GET /v1/progress` | totals, aloe leaves, streaks |
| `GET /v1/admin/training-export` | consented photos as Label Studio tasks, no personal info (admins only) |
| `GET /v1/health` | database, storage and model status |

## Privacy and data handling

- **No passwords on the server.** Supabase Auth owns sign-in. Tokens are verified against the project's public keys with the algorithm pinned.
- **Photos are cleaned on upload.** They're re-encoded with location and device metadata stripped, stored in a private bucket, and only ever shared through expiring signed links. Other users' check-ins return 404.
- **Training consent is separate and revocable.** Each check-in records whether the user had consented when it was taken. Withdrawing consent removes all of their photos from future training exports.
- **Deleting an account removes everything:** photos, rows and the Supabase login.

Before storing real patients' photos, move Supabase and Render to their HIPAA tiers (with BAAs) or another HIPAA-eligible host. Also add rate limiting on uploads, error monitoring that never logs photos or tokens, and a written data-retention policy.
