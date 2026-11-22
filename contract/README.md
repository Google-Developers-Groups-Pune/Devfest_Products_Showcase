# Prompt Heist contract

The single source of truth for the API between `backend/` and `frontend/` (BE-02, owner: Shravani). If you change the contract after Day 2, update it here in the same PR and post in the team channel.

| Path | Purpose |
|---|---|
| `openapi/openapi.yaml` | OpenAPI 3.1 for `/health` and all 30 REST endpoints, including error codes. The Dart client in `frontend/` is generated from it. |
| `openapi/asyncapi.yaml` | AsyncAPI 3.0 for all 23 socket events and their audiences. Shares schemas with `openapi.yaml` through `./openapi.yaml` refs, so the two files stay in the same folder. |
| `mock/replay/game.yaml` | The scripted game: timed socket events with their audiences and payloads. |
| `mock/replay/replay.ts` | Replay server: checks `game.yaml` against `asyncapi.yaml`, then plays it over Socket.IO and forwards REST to Prism. |

## Commands

```sh
npm install
npm run lint             # Redocly lint of openapi.yaml and asyncapi.yaml
npm run typecheck        # tsc over mock/
npm run replay:validate  # check every step of game.yaml against asyncapi.yaml
npm run mock             # Prism only: REST on http://localhost:4010
npm run mock:game        # Prism + scripted game: REST and Socket.IO on http://localhost:4010
```

## QE check: play a full game with no backend

1. `cd contract && npm install && npm run mock:game -- --start-delay 30`
2. Start the Flutter app with the mock flavour (`config/mock.json`, which points REST and sockets at `http://localhost:4010`) and open `/audience`, `/controller` and `/player` within 30 seconds.
3. The game takes about 2.5 minutes:
   - five players join, two named Meera, labelled `Meera (Player 2)` and `Meera (Player 5)`
   - names are revealed together
   - the first treasure fails and the second is ready, then the round starts
   - during the 90-second round: live scores, a blocked prompt, a scoring failure, a disconnect and reconnect, a reaction that failed, and two unlocks at 100
   - after time is up: provisional winner, confirmed winner (Dev wins a tie on 100, broken by time), then **Next group** opens a new session

`npm run mock:game` options: `--start-delay <seconds>` (default 10), `--port` (default 4010), `--prism-port` (default 4011).

## How the mock behaves

- **REST** is Prism: every route returns the example in `openapi.yaml`. Prism validates requests, so missing auth or a bad body gets the documented error. To see a specific error, send `Prefer: code=409, example=EVENT_CLOSED` (any example name from the file).
- **Which 401:** when a route has more than one 401 code, Prism answers with the first one. A player route with no token returns `TOKEN_SUPERSEDED`; send `Prefer: code=401, example=SESSION_CLOSED` to test the other.
- **Sockets** follow `game.yaml` on a fixed clock. Controller actions in the app get valid REST answers but do not change the script. Hydrate calls after a reconnect return the static Prism examples, not the replay's current state.
- **Phones** all play slot 1, because Prism's join and rejoin examples return slot 1. A phone sees slot 1's private `prompt:*` events and never another slot's.
- **Handshake:** `/controller` and `/player` need a non-empty `auth.token`, otherwise the connection is refused with `UNAUTHENTICATED`. `/display` needs none.
- **Treasure image:** `game.yaml` points at `/mock/treasure.png`, a placeholder the replay server generates.

## Changing the scripted game

Edit `mock/replay/game.yaml`, then run `npm run replay:validate`. Each step names its event, the asyncapi channels it goes to (`controller`, `player`, `playerPrivate` with a `slot`, `display`) and its payload. `{{now}}` and `{{t+N}}` in strings become timestamps when the step is sent. The replay refuses to start if any step does not match `asyncapi.yaml`.

## Known lint warnings

- `operation-4xx-response` on `/health` and API 27 `/api/display/state`: public, and neither has an error response.
- `security-defined` on the `/display` send operation: the audience screen needs no token.
