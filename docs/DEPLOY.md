# Deploying NeuroClip

Nothing here has been run against real Vercel or Fly.io accounts. The files are ready; the steps below need your own accounts and secrets.

## API on Fly.io

1. Install `flyctl` and run `fly auth login`.
2. From `apps/api`, rename `app` in `fly.toml` to a unique name, then `fly launch --no-deploy --copy-config`.
3. Create Postgres and attach it: `fly postgres create`, then `fly postgres attach <db-app>`. The attach step sets `DATABASE_URL`. Check it uses the `postgresql+psycopg://` scheme, and re-set it with `fly secrets set` if not.
4. Optional secrets: `fly secrets set ANTHROPIC_API_KEY=... REDIS_URL=...`. Without them the mentor uses scripted lines and the cache is in-memory.
5. Set the web origin: `fly secrets set CORS_ORIGINS=https://<your-vercel-domain>`.
6. `fly deploy`. The release command runs `alembic upgrade head`, which also applies the row-level-security policies.
7. Check `https://<app>.fly.dev/health` and `/health/ready`.

Row-level security has only been checked as rendered SQL, never against a live Postgres. Verify it on the first deploy.

## Web on Vercel

1. Import the repo with the project root at the repository root. `vercel.json` sets the monorepo install and build.
2. Set `VITE_API_URL=https://<app>.fly.dev` for Production and Preview.
3. Deploy. The build copies the onnxruntime wasm into `apps/web/public/ort` (`prebuild`). The int8 models in `apps/web/public/models` are committed.

## Checks after deploy

- The page loads with the disclaimer, and the debug line shows `ML <n> ms`.
- Finish a run, confirm the server score appears and the leaderboard lists it.
- Run Lighthouse against the production URL and record the numbers in the README.
