# Prompt Heist

A live arcade-booth game for DevFest Pune 2026. Four or five players race to unlock a simulated treasure by writing prompts, scored live by AI on a public screen.

Product and delivery docs are in [`docs/`](docs/): the PRD, the backend overview, and [`STORIES.md`](docs/STORIES.md), which holds the decisions that override the PRD.

## Repository layout

| Path | What it is |
|---|---|
| [`backend/`](backend/) | Node.js 22 + TypeScript game server: REST, Socket.IO, timer, scoring, Gemini agents, Firestore |
| [`frontend/`](frontend/) | One Flutter web app with `/player`, `/controller` and `/audience` routes |
| [`contract/`](contract/) | OpenAPI + socket event contract, Prism mock server, game replay script |
| [`infra/`](infra/) | Cloud Run, Firebase Hosting and Storage config (placeholder) |
| [`tools/`](tools/) | Load test and event-day runbook (placeholder) |
| [`.github/workflows/`](.github/workflows/) | CI/CD (placeholder) |

## Prerequisites

- Node.js 22+ and npm
- Flutter stable (3.50+)
- A JDK (21+ recommended), only to run the Firestore emulator locally
