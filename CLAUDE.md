# NeuroClip

Browser-based educational MCA aneurysm clipping simulator (pterional approach). Educational use only; no patient data.

## Architecture
- `apps/web` Vite + React 18 + TS strict, react-three-fiber/drei, Tailwind, Zustand (UI/session state), XState (procedure step machine). Play runs fully client-side.
- `apps/api` FastAPI + Pydantic v2 (SQLAlchemy 2, Alembic, Postgres planned): runs, leaderboard, LLM mentor proxy. Server recomputes every score from submitted telemetry; the client is never trusted.
- `packages/shared` zod schemas and constants (modes, steps, tools, telemetry) consumed by web as TS source.
- `ml` PyTorch training and ONNX export; inference via onnxruntime-web in a Web Worker.
- Deploy: web on Vercel, API on Fly.io.

## Commands
- `pnpm install`, `pnpm dev` (web at :5173)
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), `pnpm e2e` (Playwright; needs `playwright install chromium`)
- API (from `apps/api`): `python -m venv .venv`, `pip install -e ".[dev]"`, `pytest`, `ruff check .`, `alembic upgrade head`, `uvicorn app.main:app --reload` (optional LLM mentor: `pip install -e ".[llm]"`)

## API (apps/api)
- Anonymous players: `POST /v1/players` returns a bearer token (only its SHA-256 is stored). All run endpoints need it.
- `POST /v1/sessions`, `POST /v1/sessions/{id}/telemetry` (gzip or plain JSON, chunked with `offset`), `POST /v1/sessions/{id}/finish` (server recomputes the score from telemetry), `GET /v1/sessions/{id}/debrief`, `GET /v1/leaderboard` (cached, Redis if `REDIS_URL` else in-memory), `POST /v1/mentor/ask` (SSE, scripted fallback, LLM if `ANTHROPIC_API_KEY`), `GET /health`, `GET /health/ready`.
- Scoring lives in `app/scoring.py` (0-1000: completion 400, safety 300, blood 150, efficiency 150). Implausible telemetry is flagged and kept off the leaderboard.
- Postgres Row Level Security is created by the Alembic migration (`app.player_id` set per transaction in `app/db.py`). Tests run on SQLite; RLS is only checked as rendered SQL, not against a live Postgres.
- Migrations: `alembic upgrade head` from `apps/api`. Set `AUTO_CREATE_TABLES=true` only for local SQLite dev.
- Web talks to it via `apps/web/src/api/client.ts`; set `VITE_API_URL`.

## Conventions
- Small milestones: short plan, implement, run lint + typecheck + tests, conventional commit.
- Concise code; comments only for non-obvious logic.
- No secrets in code; use `.env` (see `.env.example`).
- Budgets: <150 draw calls, GLB <15 MB, 60 fps desktop.
- Visible educational-use disclaimer must stay in the UI.

## Milestones
- [x] 0. Monorepo skeleton, CI, placeholder brain, aperture
- [x] M1 Scene: aperture/vignette, wheel zoom 1-4x, focus slider + DOF, wet PBR brain, HR-driven vertex pulsation, procedural vessel tree + MCA aneurysm sac, raycast tool tip with Shift fine mode, FPS/draw-call overlay (F3)
- [x] M2 Tools: ten tools in src/tools (toolDefs.ts), keys 1-0, tool belt UI, visible effects, failure-rule unit tests
- [x] M3 Steps and mentor: surgeryMachine.ts (XState), step checklist rail, mentor captions, speech synthesis
- [x] M4 Vitals and rupture: vitalsModel.ts, sparklines/tiles/alarms, Web Audio beep, rupture + recovery
- [x] M5 Backend: sessions, gzip telemetry, server-side scoring, debrief, leaderboard (Redis), SSE mentor, Alembic, RLS, rate limits, web client
- [ ] M6 ML: headless agents, 20k runs, GBM + CNN-GRU skill + LSTM rupture risk, int8 ONNX, worker inference at 10 Hz
- [ ] M7 Polish and launch: intro, sound, share card, GIF replay, Emergency mode, anatomy seeds, settings, references, Lighthouse, README, Vercel + Fly.io deploy
