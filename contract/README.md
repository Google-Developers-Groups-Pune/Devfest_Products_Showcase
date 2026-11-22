# Prompt Heist contract

The single source of truth for the API between `backend/` and `frontend/` (BE-02, owner: Shravani). If you change the contract after Day 2, update it here in the same PR and post in the team channel.

| Path | Purpose |
|---|---|
| `openapi/openapi.yaml` | OpenAPI 3.1 for all 30 REST endpoints, including error codes. Currently a stub with `/health` only. The Dart client in `frontend/` is generated from it. |
| `events/` | Socket event definitions and their audiences: AsyncAPI or a typed event file (BE-02 chooses). |
| `mock/replay/` | Script that replays a scripted game over sockets, so the Flutter app can play a full game with no backend. |

## Commands

```sh
npm install
npm run lint     # Redocly lint of the OpenAPI file
npm run mock     # Prism mock server on http://localhost:4010
```
