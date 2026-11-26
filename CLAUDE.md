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
- [x] 0. Monorepo skeleton, CI, placeholder brain, aperture
- [x] M1 Scene: aperture/vignette, wheel zoom 1-4x, focus slider + DOF, wet PBR brain, HR-driven vertex pulsation, procedural vessel tree + MCA aneurysm sac, raycast tool tip with Shift fine mode, FPS/draw-call overlay (F3)
- [x] M2 Tools: ten tools in src/tools (toolDefs.ts), keys 1-0, tool belt UI, visible effects, failure-rule unit tests
- [ ] M3 Steps and mentor: surgeryMachine.ts (XState), step checklist rail, mentor captions, speech synthesis
- [ ] M4 Vitals and rupture: vitalsModel.ts, sparklines/tiles/alarms, Web Audio beep, rupture + recovery
- [ ] M5 Backend: sessions, gzip telemetry, server-side scoring, debrief, leaderboard (Redis), SSE mentor, Alembic, RLS, rate limits, web client
- [ ] M6 ML: headless agents, 20k runs, GBM + CNN-GRU skill + LSTM rupture risk, int8 ONNX, worker inference at 10 Hz
- [ ] M7 Polish and launch: intro, sound, share card, GIF replay, Emergency mode, anatomy seeds, settings, references, Lighthouse, README, Vercel + Fly.io deploy
