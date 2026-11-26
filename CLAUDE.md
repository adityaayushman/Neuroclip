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
- API (from `apps/api`): `python -m venv .venv`, `pip install -e ".[dev]"`, `pytest`, `ruff check .`, `uvicorn app.main:app --reload`

## Conventions
- Small milestones: short plan, implement, run lint + typecheck + tests, conventional commit.
- Concise code; comments only for non-obvious logic.
- No secrets in code; use `.env` (see `.env.example`).
- Budgets: <150 draw calls, GLB <15 MB, 60 fps desktop.
- Visible educational-use disclaimer must stay in the UI.

## Milestones
- [x] 1. Monorepo skeleton, CI, placeholder brain mesh, microscope aperture
- [ ] 2. Microscope controls: zoom 1x-4x, focus slider, depth-of-field
- [ ] 3. Tool system (keys 1-0), effects and failure modes
- [ ] 4. Six-step procedure flow on XState, modes (Guided/Expert/Emergency)
- [ ] 5. Vitals simulation and panel with alarms; bleeding/rupture model
- [ ] 6. Mentor panel (scripted) and telemetry capture
- [ ] 7. API: runs, server-side scoring, leaderboard, Alembic, Postgres
- [ ] 8. Debrief screen
- [ ] 9. ML skill score: training, ONNX export, in-browser worker inference
- [ ] 10. LLM mentor Q&A endpoint
- [ ] 11. Real GLB assets, perf pass, Vercel/Fly.io deploy
