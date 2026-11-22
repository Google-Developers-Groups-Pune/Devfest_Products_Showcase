# Prompt Heist contract

The single source of truth for the API between `backend/` and `frontend/` (BE-02, owner: Shravani). If you change the contract after Day 2, update it here in the same PR and post in the team channel.

| Path | Purpose |
|---|---|
| `openapi/openapi.yaml` | OpenAPI 3.1 for `/health` and all 30 REST endpoints, including error codes. The Dart client in `frontend/` is generated from it. |
| `openapi/asyncapi.yaml` | AsyncAPI 3.0 for all 23 socket events and their audiences. Shares schemas with `openapi.yaml` through `./openapi.yaml` refs, so the two files stay in the same folder. |
| `mock/replay/game.yaml` | The scripted game: timed socket events with their audiences and payloads. |
| `mock/replay/replay.ts` | Replay server: checks `game.yaml`, then plays it over Socket.IO, answers the hydrate calls from the game state and forwards other REST to Prism. |
| `mock/replay/state.ts` | The game state built from the steps sent so far, and the API 5, 23 and 27 responses made from it. |

## Commands

```sh
npm install
npm run lint             # Redocly lint of openapi.yaml and asyncapi.yaml
npm run typecheck        # tsc over mock/
npm run replay:validate  # check game.yaml against asyncapi.yaml, and every hydrate response against openapi.yaml
npm run mock             # Prism only: REST on http://localhost:4010
npm run mock:game        # Prism + scripted game: REST and Socket.IO on http://localhost:4010
```

## QE check: play a full game with no backend

1. `cd contract && npm install && npm run mock:game -- --start-delay 30`
2. Start the Flutter app with the mock flavour (`config/mock.json`, which points REST and sockets at `http://localhost:4010`) and open `/audience`, `/controller` and `/player` within 30 seconds. Reloading any screen at any point lands in the same state as the sockets. On the phone, wait until the session opens (the console prints `session:opened`) before entering a booth code: before that, the phone is sent back to the booth code screen with `SESSION_CLOSED`.
3. The game takes about 2.5 minutes:
   - five players join, two named Meera, labelled `Meera (Player 2)` and `Meera (Player 5)`. Meera's phone drops and comes back in the lobby, with no name shown (D16)
   - names are revealed together
   - the first treasure fails and the second is ready, then the round starts
   - during the 90-second round: live scores, a blocked prompt, a scoring failure, a disconnect and reconnect, a reaction that failed, and two unlocks at 100
   - after time is up: provisional winner, confirmed winner (Dev wins a tie on 100, broken by time), then **Next group** opens a new session

`npm run mock:game` options: `--start-delay <seconds>` (default 10), `--port` (default 4010), `--prism-port` (default 4011).

## How the mock behaves

- **Sockets** follow `game.yaml` on a fixed clock. Controller actions in the app get valid REST answers but do not change the script.
- **Hydrate calls** (API 5 `/api/controller/sessions/active`, API 23 `/api/player/me`, API 27 `/api/display/state`) are answered from the game state built from the steps sent so far, so they always match the socket events. Before the game starts the state is `SETUP`.
- **Other REST** is Prism: every route returns the example in `openapi.yaml`. Prism validates requests, so missing auth or a bad body gets the documented error. To see a specific error, send `Prefer: code=409, example=EVENT_CLOSED` (any example name from the file). A `Prefer` header on a hydrate call also goes to Prism. When a route has more than one 401 code, Prism answers with the first: `UNAUTHENTICATED`.
- **Phones** all play slot 1, because Prism's join and rejoin examples return slot 1. A phone sees slot 1's private `prompt:*` events and never another slot's. Join on the phone after the session opens: before it opens, and after **Next group** closes it, `/api/player/me` and the `/player` handshake answer `SESSION_CLOSED`, as the real backend does for that token.
- **Refusals:** `/controller` and `/player` refuse a missing `auth.token` with `UNAUTHENTICATED`; `/display` never refuses. The client gets the `connect_error` documented in `asyncapi.yaml`: `err.message` is the code and `err.data` is the REST error body. To test a code, use it as the token: a token of `TOKEN_SUPERSEDED`, `SESSION_CLOSED` or `UNAUTHENTICATED` is refused with that code, on the socket and on the hydrate calls.
- **Treasure image:** `game.yaml` points at `/mock/treasure.png`, a placeholder the replay server generates.

## Changing the scripted game

Edit `mock/replay/game.yaml`, then run `npm run replay:validate`. Each step names its event, the asyncapi channels it goes to (`controller`, `player`, `playerPrivate` with a `slot`, `display`) and its payload. Prompt steps also carry `promptText`, the text the player typed, which API 23 returns. `{{now}}` and `{{t+N}}` in strings become timestamps when the step is sent. The replay refuses to start if any step does not match `asyncapi.yaml`, if any hydrate response would not match `openapi.yaml`, or if a `player:connection` before `players:revealed` carries a name (D16).

## Known lint warnings

- `operation-4xx-response` on `/health` and API 27 `/api/display/state`: public, and neither has an error response.
- `security-defined` on the `/display` send operation: the audience screen needs no token.
