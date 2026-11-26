# Prompt Heist backend

Game orchestration service: REST API, Socket.IO realtime gateway, server-authoritative round timer, scoring pipeline, AI agents (Gemini on Vertex AI) and Firestore persistence. Runs as one always-on Cloud Run instance (decision D1).

Node.js 22 · TypeScript 6 · Express 5 · Socket.IO 4 · Vitest · ESLint

## Commands

```sh
npm install
cp .env.example .env     # then fill in values
npm run dev              # watch mode on :8080
npm run lint
npm run typecheck
npm test                 # unit tests
npm run test:emulator    # tests against the Firestore emulator (needs a JDK; use 21+)
npm run seed:controller  # create or update the one Controller account (asks for username and password)
npm run build && npm start
```

`GET /health` returns `{"status":"ok"}`. Every response carries `X-Correlation-Id`, and every log line is JSON with a `correlationId`.

## Layout

| Path | Purpose | Stories |
|---|---|---|
| `src/server.ts` | Process entry: config, HTTP server, Socket.IO, shutdown | BE-01 |
| `src/app.ts` | Express app factory (`createApp({ clock, logger, corsOrigins })`), CORS for the app origin | BE-01 |
| `src/config/` | Environment config, validated with Zod. Model IDs and the domain are config only | BE-38 |
| `src/core/` | `Clock` (inject it, never call `new Date()` directly), logger, request context, `AppError` | BE-01, BE-04 |
| `src/http/middleware/` | Correlation ID, error envelope, then auth, idempotency and rate limits | BE-01, BE-05, BE-30 |
| `src/http/routes/controller/` | `/api/controller`: APIs 1–19, 28–30 | BE-05, 08, 09, 19, 20, 24–26, 28, 29, 36, 39 |
| `src/http/routes/player/` | `/api/player`: APIs 20–26 | BE-10–13, 21, 23 |
| `src/http/routes/display/` | `/api/display`: API 27 (public) | BE-13 |
| `src/realtime/` | Socket.IO namespaces `/controller`, `/player`, `/display` and the typed emit service | BE-07 |
| `src/domain/state-machines/` | Session, player and prompt state machines. Pure TS, no I/O | BE-06 |
| `src/domain/scoring/` | `calculateScore` (code adds up the Guard marks) | BE-17 |
| `src/domain/result/` | `resultCalculator`: plain code, never AI | BE-24 |
| `src/services/` | Use cases: session, join, treasure, round, prompt, result, CSV, event close, audit | various |
| `src/agents/` | AI gateway and agent interfaces: filter, guard, treasure, image, emoji | BE-14–18, BE-35 |
| `src/agents/fakes/` | Deterministic `Fake*` agents. Use these until the real ones land | BE-14 |
| `src/agents/prompts/` | Versioned system instructions (e.g. `guard-v1`) | BE-15–18 |
| `src/jobs/` | Round timer job and in-process scoring queue, recovered on start-up | BE-20, BE-22 |
| `src/data/` | Firestore client, typed repositories, Storage | BE-03, BE-35 |
| `src/projections/` | `toDisplayDto` / `toPlayerDto` allow-lists | BE-13 |
| `scripts/` | Controller seed script, `event:reset` | BE-05, BE-29 |
| `test/unit/` | Fast tests with `FakeClock` and fakes | all |
| `test/integration/` | HTTP, socket and Firestore emulator tests | all |
| `test/contract/` | Checks the typed socket events against `contract/openapi/asyncapi.yaml` | BE-07 |
| `test/fixtures/` | Shared emulator fixtures and agent fixture sets | BE-03, BE-15 |
| `test/harness/` | Whole-game simulation harness | BE-31 |

## Notes

- `Dockerfile` builds a Node 22 image for Cloud Run. Local development also works on Node 24.
- npm 11 holds back package install scripts until they are approved (`npm approve-scripts`). The runtime native modules (`argon2`, `sharp`) work without them. Approve them only if a tool you use needs them.
- `firebase.json` here only configures the local Firestore emulator.
- `CORS_ORIGINS` must list the Flutter app's origin (locally `http://localhost:5000`). It applies to both REST and Socket.IO. With it empty, browsers are refused.
- `.env` values left empty (as in `.env.example`) count as not set.
