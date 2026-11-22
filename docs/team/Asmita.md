# Asmita

Backend · owns session rules, joining, results actions and the test harness

**Your load:** 18.0 days across 14 stories, finishing around D18. Days after that are for bug fixes and rehearsals. Project overview and decisions are in [STORIES.md](../STORIES.md).

## Your stories, in working order

| Story | Title | Days | Planned | Needs | Priority |
|---|---|---|---|---|---|
| BE-06 | Session, player and prompt state machines | 1.5 | D1–D2 | – | Must |
| BE-05 | Controller auth and RBAC | 1.5 | D2–D3 | BE-01 | Must |
| BE-08 | Create session and dashboard state | 1.5 | D4–D5 | BE-03, BE-05, BE-06 | Must |
| BE-09 | Change round duration | 0.5 | D5 | BE-08 | Must |
| BE-10 | Join code check | 1 | D6 | BE-08 | Must |
| BE-11 | Player join | 1.5 | D7–D8 | BE-10, BE-07 | Must |
| BE-12 | Rejoin, kick and connection state | 1.5 | D8–D9 | BE-11 | Must |
| BE-13 | Player and display state projections | 1.5 | D10–D11 | BE-07, BE-11 | Must |
| FE-31 | Emoji faces from an open-source 3D model | 1 | D11–D12 | – | Must |
| BE-18 | emojiAgent and expressions | 1.5 | D12–D13 | BE-14, BE-15 | Must |
| BE-23 | Prompt status and player result reads | 0.5 | D14 | BE-13 | Must |
| BE-25 | Confirm and discard | 1 | D14–D15 | BE-06, BE-03 | Must |
| BE-36 | Next group and close session | 1 | D15–D16 | BE-25, BE-08 | Must |
| BE-31 | Simulation harness and fairness tests | 2.5 | D16–D18 | BE-24, BE-25, BE-36 | Must |

## Shared contract (applies to every story)

**Words we use:** an **event** is the full day. A **session** is one game for one group of 4 or 5 players, with one **round**: the timed battle. When it finishes, the game is over, and a fresh session starts with new players. A discard ends the session with no winner.

**One app, three routes.** The domain is config and can change. The bare domain opens the player route.

| Surface | Path |
|---|---|
| Controller | `/controller` |
| Audience (big screen, called "display" in the API) | `/audience` |
| Player | `/player` |

**Conventions**

- JSON, camelCase. Timestamps are ISO 8601 UTC with milliseconds. Durations are whole seconds.
- `Authorization: Bearer <token>`. Token types: `controllerToken` (12 hours), `joinToken` (5 minutes), `playerToken` (until the session closes or the player rejoins elsewhere).
- Every response has `X-Correlation-Id`.
- The client never sends a player ID, score, timestamp or winner. The server works these out.
- All writes go through REST. Sockets only send from server to client.
- After any socket reconnect, call the hydrate endpoint: `GET /api/controller/sessions/active`, `GET /api/player/me` or `GET /api/display/state`.

**Sockets:** namespaces `/controller`, `/player`, `/display` on the API host. Pass the token in `auth: { token }`. `/display` needs no token.

**Error format**

```json
{ "error": { "code": "ROUND_EXPIRED", "message": "Safe text for the user", "correlationId": "..." } }
```

**Enums**

| Name | Values |
|---|---|
| Session `phase` | `SETUP` (no session open), `JOINING`, `TREASURE_REVIEW`, `READY`, `PLAYING`, `RESULT_PENDING`, `RESULTS`, `DISCARDED`, `CLOSED` |
| Player `state` | `LOBBY`, `PLAYING`, `LOCKED_100`, `RESULT_PENDING`, `COMPLETE` |
| `connection` | `CONNECTED`, `DISCONNECTED` |
| `slotState` (Controller) | `UNJOINED`, `LOBBY`, `PLAYING`, `LOCKED_100`, `DISCONNECTED`, `RESULT_PENDING`, `COMPLETE` |
| Prompt `status` | `RECEIVED`, `FILTERING`, `BLOCKED`, `APPROVED`, `SCORING`, `SCORED`, `FAILED`, `DISPLAYED` |
| Event `status` | `OPEN`, `CLOSING`, `CLOSED`, `CLOSING_FAILED` |

**Colour markers, fixed by slot.** These only tell players apart. Separately, each audience row has its own copy of one shared emoji, made from an open-source 3D model and pre-rendered, whose face reacts to each prompt.

| Slot | `shape` | Look |
|---|---|---|
| 1 | `BLUE_CIRCLE` | Blue circle |
| 2 | `RED_SQUARE` | Red rounded square |
| 3 | `YELLOW_DIAMOND` | Yellow diamond |
| 4 | `GREEN_PILL` | Green pill |
| 5 | `GREEN_CIRCLE` | Green circle |

**Colours:** Google logo palette: blue `#4285F4`, red `#EA4335`, yellow `#FBBC05`, green `#34A853`. Scores: 0–39 red, 40–79 yellow, 80–99 blue, 100 green.

**Must never reach a phone or the audience screen:** full names of other people, entrance IDs, the rubric, unapproved treasures, blocked or pending prompts, agent credentials, system prompts, raw model output.

**Working agreement**

- One story, one PR. Suraj reviews every PR and runs the QE check, so keep PRs small and open them as soon as a story is done.
- Your PR description says how to run the QE check.
- A story is done when its acceptance criteria pass, tests are green, the contract is up to date, and it is demoed on dev. Frontend stories are demoed against the mock if the backend story has not landed, and rechecked in integration.
- `game.txt` holds the sample agent prompts. The stories adapt them, so use the story version.
- Backend: agents sit behind interfaces, so use the `Fake*` versions until the real one lands. Use the injected `Clock` in tests rather than sleeping.
- Frontend: build against the mock server. Do not wait for real endpoints.
- **Mockups are not final.** Change them where the story or the screen needs it.
- Frontend: some screens have no mock. Stories marked 🎨 are yours to design, using the existing style. Show the design in your PR.
- **Do not guess business rules.** If a story, the PRD and a screen disagree, or a rule is unclear, raise it with Suraj. Stories marked with an open question stay partly blocked until it is answered.
- A "Needs" entry means the story cannot finish without that work. If you are blocked, say so in stand-up the same day.


## Stories

### BE-06 · Session, player and prompt state machines

**Estimate:** 1.5d · **Planned:** D1–D2 · **Priority:** Must

One tested module that owns every legal transition.

**Acceptance criteria**

- [ ] Pure TypeScript, no database, no I/O.
- [ ] Session: `JOINING, TREASURE_REVIEW, READY, PLAYING, RESULT_PENDING, RESULTS, DISCARDED, CLOSED`, plus `SETUP` meaning no session is open.
- [ ] `JOINING` to `TREASURE_REVIEW` happens on the first treasure request. `TREASURE_REVIEW` to `READY` on approve.
- [ ] `RESULTS` to `CLOSED` only by Controller action, never by a timer.
- [ ] Abandon: `JOINING`, `TREASURE_REVIEW`, `READY` to `CLOSED`.
- [ ] Discard: `RESULT_PENDING` to `DISCARDED`, which is final (decision D34).
- [ ] Player and prompt machines per PRD 10.2 and 10.3, plus `FAILED` for prompts. `LOCKED_100` can never return to `PLAYING`.
- [ ] Illegal transitions throw a typed error.

**QE check:** Read the table-driven test: every legal and illegal transition is listed.

---

### BE-05 · Controller auth and RBAC

**Estimate:** 1.5d · **Planned:** D2–D3 · **Priority:** Must · **Needs:** BE-01 (Shreya, D1)

Lock the Controller routes.

**Design:** [Controller: login](../WhatsApp%20Image%202026-11-05%20at%2019.30.12.jpeg)

**Acceptance criteria**

- [ ] One Controller account. Username and password are set directly in the `controllers` collection, using a seed script that stores an argon2 hash, never the plain password.
- [ ] No second factor. The account is not event data, so it survives closure.
- [ ] Signed token, 12-hour expiry, logout revokes it.
- [ ] Middleware `requireController`, `requirePlayer`, `requireJoinToken`.
- [ ] Player tokens carry a token ID checked against `player.activeTokenId`.
- [ ] Limit of 5 tries per minute. No long lockout, because there is only one account.
- [ ] A new login ends the previous one: the old token is revoked and `controller:kicked` goes to the old socket, once BE-07 lands (decision D29).

<details open><summary><b>API contract</b></summary>

**API 1 · `POST /api/controller/auth/login`** · Auth: none

Request:
```json
{ "username": "controller", "password": "..." }
```
200:
```json
{ "token": "<controllerToken>", "expiresAt": "2026-12-05T20:00:00.000Z",
  "controller": { "id": "ctl_1", "username": "controller" } }
```
Errors: `401 INVALID_CREDENTIALS` · `429 TOO_MANY_ATTEMPTS` (5 tries per minute; never a long lockout, as there is only one account)

**API 2 · `POST /api/controller/auth/logout`** · Auth: Controller

204, no body. The token is added to a server-side revoked list until it expires.

**API 3 · `GET /api/controller/auth/me`** · Auth: Controller

200: `{ "controller": { "id": "ctl_1", "username": "controller" } }` · Errors: `401 UNAUTHENTICATED`

</details>

<details open><summary><b>Socket events</b></summary>

`controller:kicked` → old controller socket only
```json
{ "reason": "SIGNED_IN_ELSEWHERE" }
```

</details>

**QE check:** Call every `/api/controller/*` route without a token and with a player token: all 401 or 403. The design's "any email works" must not be true here.

---

### BE-08 · Create session and dashboard state

**Estimate:** 1.5d · **Planned:** D4–D5 · **Priority:** Must · **Needs:** BE-03 (Shravani, D2–D3), BE-05 (Asmita, D2–D3), BE-06 (Asmita, D1–D2)

Open a session and hydrate the dashboard.

**Design:** [Controller: setup](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%281%29.jpeg) · [Controller: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%282%29.jpeg)

**Acceptance criteria**

- [ ] Refuses a second session unless the current one is `CLOSED`.
- [ ] Creates `EventDay` on the first session of the day. Refuses with `EVENT_CLOSED` after closure.
- [ ] Codes are unique within the session (PRD 7.1). They may repeat in later sessions, because two digits run out in under 20 sessions otherwise.
- [ ] Each slot has a fixed colour marker (shape).
- [ ] `GET /sessions/active` returns `session: null` when nothing is open, with winners still listed.
- [ ] Audit: "Session opened - 5 players - 90s round".

<details open><summary><b>API contract</b></summary>

**API 4 · `POST /api/controller/sessions`** · Auth: Controller

Opens a new session. Generates one unique 2-digit code per slot. Phase becomes `JOINING`.
Creates the `EventDay` record if this is the first session of the day.

Request:
```json
{ "capacity": 5, "roundDurationSeconds": 90 }
```
`capacity` must be 4 or 5. `roundDurationSeconds` is optional (default 90), a positive whole number, with no maximum.

201:
```json
{ "session": { "id": "ses_01", "phase": "JOINING", "capacity": 5, "roundDurationSeconds": 90,
    "joinedCount": 0, "createdAt": "..." },
  "slots": [ { "slotNumber": 1, "code": "29", "shape": "BLUE_CIRCLE", "slotState": "UNJOINED", "player": null } ] }
```
Errors: `409 SESSION_ALREADY_ACTIVE` · `409 EVENT_CLOSED` · `422 VALIDATION_FAILED`

**API 5 · `GET /api/controller/sessions/active`** · Auth: Controller

Full dashboard hydrate. Called on load and on every socket reconnect. `session` is null in the Setup screen.

200:
```json
{ "serverNow": "...",
  "eventDay": { "id": "evt_01", "status": "OPEN", "confirmedCount": 1, "csvExportedAt": null, "csvUpToDate": false,
    "lastSettings": { "capacity": 5, "roundDurationSeconds": 90 },
    "winners": [ { "roundNumber": 1, "fullName": "Dev Khan", "score": 100 } ] },
  "session": { "id": "ses_01", "phase": "READY", "capacity": 5, "roundDurationSeconds": 90, "joinedCount": 5 },
  "slots": [ { "slotNumber": 1, "code": "29", "shape": "BLUE_CIRCLE", "slotState": "LOBBY",
      "player": { "id": "ply_1", "label": "Neha", "fullName": "Neha Rao", "entranceId": "DF-2026-2802",
                  "connection": "CONNECTED", "bestScore": null, "nameReview": "APPROVED" } } ],
  "treasure": { "candidateId": "cnd_1", "status": "APPROVED", "title": "The Saffron Vault",
      "backstory": "...", "lockObjective": "...", "imageUrl": "https://storage.googleapis.com/...",
      "filterPassed": true,
      "rubric": { "version": "v1", "scoringCriteria": ["Requests a poem"] } },
  "round": { "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": null, "roundEndAt": null },
  "audit": [ { "at": "...", "summary": "Session opened - 5 players - 90s round" } ] }
```
This is the only payload family that may contain `fullName`, `entranceId` and `rubric`. `nameReview` is `PENDING` or `APPROVED`.

</details>

<details open><summary><b>Socket events</b></summary>

`session:opened` → display, controller
```json
{ "sessionId": "ses_02", "capacity": 5, "roundDurationSeconds": 90 }
```

</details>

**QE check:** Create 4 and 5 player sessions. Try a second one: 409. Try capacity 6: 422.

---

### BE-09 · Change round duration

**Estimate:** 0.5d · **Planned:** D5 · **Priority:** Must · **Needs:** BE-08 (Asmita, D4–D5)

Let the Controller adjust time before the round.

**Design:** [Controller: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%282%29.jpeg) · [Controller: ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%282%29.jpeg)

**Acceptance criteria**

- [ ] Positive whole seconds, with no maximum.
- [ ] Allowed in `JOINING`, `TREASURE_REVIEW`, `READY`. Locked at start.

<details open><summary><b>API contract</b></summary>

**API 6 · `PATCH /api/controller/sessions/:id/duration`** · Auth: Controller

Request: `{ "roundDurationSeconds": 120 }`. Allowed in `JOINING`, `TREASURE_REVIEW`, `READY`.

200: `{ "session": { "id": "ses_01", "roundDurationSeconds": 120 } }`

Errors: `409 INVALID_PHASE` · `422 VALIDATION_FAILED`

</details>

**QE check:** With a seeded session: change to 120 and read it back. Try 0, -5 and 1.5: 422. Set the phase to `PLAYING`: 409.

---

### BE-10 · Join code check

**Estimate:** 1d · **Planned:** D6 · **Priority:** Must · **Needs:** BE-08 (Asmita, D4–D5)

First step of joining.

**Design:** [Player: booth code](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Valid unclaimed code returns a 5-minute `joinToken`.
- [ ] Failure changes nothing. Unlimited retries are allowed.
- [ ] Distinct errors for invalid, claimed, and no active session.

<details open><summary><b>API contract</b></summary>

**API 20 · `POST /api/player/join/code`** · Auth: none

Request: `{ "code": "12" }`. Validates only; does not claim the slot.

200: `{ "joinToken": "<5-minute token>", "expiresAt": "...", "slot": { "slotNumber": 1, "capacity": 5, "shape": "BLUE_CIRCLE" } }`

Errors: `404 CODE_INVALID` · `409 CODE_ALREADY_CLAIMED` · `409 NO_ACTIVE_SESSION`

</details>

**QE check:** Try a valid code, a wrong code, a claimed code, and a code with no session open.

---

### BE-11 · Player join

**Estimate:** 1.5d · **Planned:** D7–D8 · **Priority:** Must · **Needs:** BE-10 (Asmita, D6), BE-07 (Shravani, D4–D6)

Second step of joining.

**Design:** [Player: name and ID](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%282%29.jpeg) · [Display: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.10.jpeg) · [Display: get ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Name and entrance ID stored as entered, with no encryption (decision D3).
- [ ] The ID can be any letters, numbers or special characters. No format validation. `abc-123` and `ABC-123` are the same person: compare after trimming and lower-casing.
- [ ] Slot claim, player create and `entranceIds` create happen in one transaction.
- [ ] Rejects a blank name, blank ID, an ID in this session, or an ID marked `USED`.
- [ ] On a first-name collision, **all** colliding players become `Meera (Player 2)`, `Meera (Player 5)`, including the one who joined first, as on the screens. New players start with `nameReview: PENDING`.
- [ ] Duplicate full names are allowed.
- [ ] `player:joined` carries the whole public list.

<details open><summary><b>API contract</b></summary>

**API 21 · `POST /api/player/join`** · Auth: joinToken

Request: `{ "fullName": "Aman Sharma", "entranceId": "DF-2026-0007" }`. Name max 80 characters. The ID can contain any characters, max 128.

201:
```json
{ "playerToken": "<token>",
  "player": { "id": "ply_1", "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE", "state": "LOBBY" } }
```
Errors: `422 NAME_REQUIRED` · `422 ENTRANCE_ID_REQUIRED` · `409 ENTRANCE_ID_IN_SESSION` · `409 ENTRANCE_ID_USED` · `409 CODE_ALREADY_CLAIMED` · `401 JOIN_TOKEN_EXPIRED`

</details>

<details open><summary><b>Socket events</b></summary>

`player:joined` → all
```json
{ "joinedCount": 3, "capacity": 5, "players": [ <full public list> ] }
// The whole list is sent because a collision can change an earlier player's label.
// Controller also receives fullName and entranceId per player.
// Audience and players receive joinedCount and capacity only, with no names, until players:revealed.
```

</details>

**QE check:** Two API calls with the same ID at the same moment: exactly one succeeds. Join two Meeras: the `player:joined` payload labels both.

---

### BE-12 · Rejoin, kick and connection state

**Estimate:** 1.5d · **Planned:** D8–D9 · **Priority:** Must · **Needs:** BE-11 (Asmita, D7–D8)

Let a player come back, on any device.

**Design:** [Player: booth code](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Finds the player by entrance ID in the active session.
- [ ] New token, old token revoked, `player:kicked` to the old socket.
- [ ] Restores stored state, including `LOCKED_100`. Never returns a locked player to `PLAYING`.
- [ ] After expiry the player lands on result-pending or results.
- [ ] Rate limited at 10 per IP per minute, because the entrance ID is the only credential.
- [ ] The round never pauses.

<details open><summary><b>API contract</b></summary>

**API 22 · `POST /api/player/rejoin`** · Auth: none

Request: `{ "entranceId": "DF-2026-0007" }`. Restores the slot, issues a new token, kicks the old device.

200: `{ "playerToken": "<new token>", "player": { "id": "ply_1", "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE", "state": "PLAYING" } }`

Errors: `404 NO_ACTIVE_GAME` · `429 TOO_MANY_ATTEMPTS` (10 per IP per minute)

</details>

<details open><summary><b>Socket events</b></summary>

`player:kicked` → old player socket only
```json
{ "reason": "REJOINED_ON_ANOTHER_DEVICE" }
```

`player:connection` → all
```json
{ "slotNumber": 2, "label": "Priya", "connection": "DISCONNECTED" }
```

</details>

**QE check:** With two socket clients: rejoin on client B, client A gets `player:kicked` and its token gets 401. Seed a `LOCKED_100` player: rejoin keeps that state.

---

### BE-13 · Player and display state projections

**Estimate:** 1.5d · **Planned:** D10–D11 · **Priority:** Must · **Needs:** BE-07 (Shravani, D4–D6), BE-11 (Asmita, D7–D8)

One allow-list layer for what each audience may see.

**Design:** [Display: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%282%29.jpeg) · [Player: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.08.jpeg)

**Acceptance criteria**

- [ ] `toDisplayDto` and `toPlayerDto` build objects field by field. Never spread a stored document.
- [ ] Display `treasure` is null until `PLAYING`. Same for players.
- [ ] Audience and player `players` lists stay empty until every name is approved.
- [ ] Display rows include the latest approved prompt only.
- [ ] Signed image URLs are refreshed on every hydrate.
- [ ] Test serialises every payload and fails on forbidden fields.

<details open><summary><b>API contract</b></summary>

**API 23 · `GET /api/player/me`** · Auth: Player

Hydrate call, used on load and on every reconnect.

200:
```json
{ "serverNow": "...",
  "player": { "id": "ply_1", "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE",
              "state": "PLAYING", "bestScore": 45 },
  "session": { "id": "ses_01", "phase": "PLAYING", "capacity": 5, "joinedCount": 5 },
  "players": [ { "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE", "connection": "CONNECTED", "state": "PLAYING" } ],
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "..." },
  "round": { "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": "...", "roundEndAt": "..." },
  "prompts": [ { "promptId": "prm_1", "text": "apple", "status": "SCORED", "score": 9,
                 "feedback": "The Guard yawns...", "receivedAt": "..." } ],
  "canSubmit": true }
```
`treasure` and `round` are null before the round starts. `players` is empty until every name is approved. Other players' `bestScore` is not included here.

Errors: `401 TOKEN_SUPERSEDED` (show the kicked screen) · `401 SESSION_CLOSED` (clear the phone and return to the booth code screen)

**API 27 · `GET /api/display/state`** · Auth: none (public)

Allow-listed. Never contains full names, entrance IDs, rubric, or blocked or pending prompts.

200:
```json
{ "serverNow": "...", "phase": "PLAYING", "joinUrl": "heist.devfestpune.dev",
  "session": { "capacity": 5, "joinedCount": 5 },
  "players": [ { "slotNumber": 1, "label": "Isha", "shape": "BLUE_CIRCLE", "connection": "CONNECTED",
      "state": "LOCKED_100", "bestScore": 100,
      "latest": { "text": "Write a polite 3-line poem...", "reaction": "Guard ne salute maara!", "expression": "SALUTE" } } ],
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "..." },
  "round": { "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "roundEndAt": "..." },
  "unlocked": [ "Isha", "Meera (Player 5)" ],
  "result": null }
```
`phase` is `SETUP` when no session is open. `treasure` is null until the round starts. `players` is empty until every name is approved, so the screen shows `joinedCount` only, then all names at once.
`result` has the provisional winner in `RESULT_PENDING` and the full public ranking and tie-break text in `RESULTS`.

</details>

**QE check:** Call `GET /api/display/state` in every phase and read the JSON for leaks.

---

### FE-31 · Emoji faces from an open-source 3D model

**Estimate:** 1d · **Planned:** D11–D12 · **Priority:** Must

Produce the pre-rendered emoji animations that FE-21 plays (decision D8).

**Acceptance criteria**

- [ ] Choose an open-source 3D model with facial expressions. Record the licence, which must allow public use at an event.
- [ ] Render one short animation per expression, with a transparent background, in a format Flutter Web can play.
- [ ] Publish the final `expression` list, which BE-18 and FE-21 both use.
- [ ] Total size is small enough for the audience route to load quickly. Record it.
- [ ] Play 5 together on a laptop like the booth one, and check it stays smooth.

> This sits with Asmita because frontend has no spare capacity. If nobody on the team has used 3D tools before, raise it early, as 1 day may not be enough.

**QE check:** Watch 5 faces changing together on the booth laptop.

---

### BE-18 · emojiAgent and expressions

**Estimate:** 1.5d · **Planned:** D12–D13 · **Priority:** Must · **Needs:** BE-14 (Shreya, D3–D4), BE-15 (Shreya, D5–D7)

Funny Hindi-English reactions that never slow the game.

**Design:** [Display: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%282%29.jpeg) · [Display: unlocked](../WhatsApp%20Image%202026-11-05%20at%2019.30.11.jpeg)

**Acceptance criteria**

- [ ] One call per approved prompt, 2-second timeout. Returns reaction text, at most 100 characters, and an `expression`.
- [ ] Each audience row has its own copy of the shared emoji, and its face follows `expression` (decision D8). The text reaction stays beside it.
- [ ] `expression` values: `NEUTRAL, BORED, UNIMPRESSED, CURIOUS, IMPRESSED, SHOCKED, SALUTE`. This is a starting list. The final list comes from FE-31, because the model decides which faces exist.
- [ ] Output must pass `filterAgent.checkReaction`.
- [ ] Implements the prompt below. Must not mock a person, or use anything beyond the public label.
- [ ] There are no fallback lines (decision D42). On timeout or failure, `reaction` is null and `expression` is `NEUTRAL` (decision D49).

#### Prompt and Emoji prompt

Based on section 4 of `game.txt`. Addition: `expression`, which drives the 3D face.

```text
You are the Prompt & Emoji Agent for Prompt Heist.

Create a short, funny Hindi-English reaction for the audience, and pick the face that fits it.

Rules:
- Keep it short.
- Be funny and positive.
- Do not insult the player.
- Do not reveal private information.
- Do not repeat unsafe content.
- You may use the player's public name, and nothing else about them.

Return JSON matching the response schema, with "reaction" (at most 100 characters) and
"expression".
```

**Examples from `game.txt`:**

- Score high: "Arey wah Aman ji! 🥭 Aapne toh Barnaby ka dil hi jeet liya! Ab bas mango smoothie party bachti hai! 🎉✨"
- Score low: "Arre Aman bhai, itna seedha prompt? Guard ko thodi toh makkhan lagana padega na! 🥭😂 Thoda masala daalo!"

**QE check:** Force a timeout: no reaction appears, the face stays neutral, and the score is not delayed.

---

### BE-23 · Prompt status and player result reads

**Estimate:** 0.5d · **Planned:** D14 · **Priority:** Must · **Needs:** BE-13 (Asmita, D10–D11)

Read endpoints for the phone.

**Design:** [Player: final result](../WhatsApp%20Image%202026-11-05%20at%2019.30.07.jpeg) · [Player: time up](../WhatsApp%20Image%202026-11-05%20at%2019.30.09%20%281%29.jpeg)

**Acceptance criteria**

- [ ] `GET /prompts/:id` is owner-only. Another player gets 404.
- [ ] `GET /result` returns `PENDING` until the Controller confirms. A provisional winner is never shown to players.
- [ ] `myRank` comes from the player token.

<details open><summary><b>API contract</b></summary>

**API 25 · `GET /api/player/prompts/:id`** · Auth: Player

Fallback if a socket event is missed. Owner only.

200: `{ "promptId": "prm_1", "status": "SCORED", "score": 9, "feedback": "...", "message": null, "receivedAt": "...", "sequence": 19 }`

`status`: `RECEIVED`, `FILTERING`, `BLOCKED`, `APPROVED`, `SCORING`, `SCORED`, `FAILED`, `DISPLAYED`. Errors: `404 NOT_FOUND` (also returned for someone else's prompt)

**API 26 · `GET /api/player/result`** · Auth: Player

200 before confirmation: `{ "status": "PENDING" }`

200 after confirmation (a player with no score has `bestScore: null`, shown as zero):
```json
{ "status": "CONFIRMED", "roundNumber": 2, "myRank": 4,
  "winner": { "slotNumber": 3, "label": "Rohan", "shape": "YELLOW_DIAMOND", "bestScore": 73 },
  "ranking": [ { "rank": 1, "slotNumber": 3, "label": "Rohan", "shape": "YELLOW_DIAMOND", "bestScore": 73 } ],
  "tieBreakExplanation": null,
  "story": { "title": "The Golden Chai Cup", "backstory": "...", "imageUrl": "..." } }
```

</details>

**QE check:** Call the result endpoint before and after confirming.

---

### BE-25 · Confirm and discard

**Estimate:** 1d · **Planned:** D14–D15 · **Priority:** Must · **Needs:** BE-06 (Asmita, D1–D2), BE-03 (Shravani, D2–D3)

The only two actions after a round.

**Design:** [Controller: result pending](../WhatsApp%20Image%202026-11-05%20at%2019.30.13%20%282%29.jpeg) · [Controller: winner confirmed](../WhatsApp%20Image%202026-11-05%20at%2019.30.14.jpeg)

**Acceptance criteria**

- [ ] Confirm takes no winner input. No override endpoint exists.
- [ ] Confirm, in one transaction: result `CONFIRMED`, all players' `entranceIds` become `USED`, winner stored, `confirmedCount` up, players `COMPLETE`, phase `RESULTS`.
- [ ] Confirm returns `NO_WINNER` if nobody scored. Discard is the only way out.
- [ ] Discard: reason required, audit with Controller identity and time.
- [ ] Discard ends the session with no winner: phase `DISCARDED`, entrance IDs released, player tokens revoked, `round:discarded` emitted (decision D34).
- [ ] The reason is never sent to phones or the display.

> You can start before BE-24 by seeding a result document in tests.

<details open><summary><b>API contract</b></summary>

**API 13 · `POST /api/controller/rounds/:id/confirm`** · Auth: Controller

Confirms the system's winner only. There is no winner field in the request. No request body.
Safe to repeat: a second call returns the same result. Phase becomes `RESULTS`.

200: `{ "result": { "status": "CONFIRMED", "roundNumber": 1, "confirmedAt": "..." }, "session": { "phase": "RESULTS" } }`

Errors: `409 NO_WINNER` (must discard) · `409 INVALID_PHASE`

**API 14 · `POST /api/controller/rounds/:id/discard`** · Auth: Controller

Request: `{ "reason": "Wi-Fi dropped for two players" }` (required, not blank).

Ends the session with no winner. Phase becomes `DISCARDED`, which is final. Entrance IDs are released, so the same people can join a new session with new codes.

200: `{ "session": { "id": "ses_01", "phase": "DISCARDED" } }`

Errors: `422 REASON_REQUIRED` · `409 INVALID_PHASE`

</details>

<details open><summary><b>Socket events</b></summary>

`result:confirmed` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "winner": { ... }, "ranking": [ ... ], "tieBreakExplanation": "..." }
```

`round:discarded` → all
```json
{ "sessionId": "ses_01", "roundId": "rnd_1" }
// The session has ended. The discard reason is never sent to players or the display.
```

</details>

**QE check:** With a seeded result: confirm twice, get the same result. Discard another: the reason is in the audit log, no winner is stored, and those IDs can join a new session. Check the CSV once BE-28 lands.

---

### BE-36 · Next group and close session

**Estimate:** 1d · **Planned:** D15–D16 · **Priority:** Must · **Needs:** BE-25 (Asmita, D14–D15), BE-08 (Asmita, D4–D5)

Controller-driven end of a session, per decision D2. No timers.

**Design:** [Controller: winner confirmed](../WhatsApp%20Image%202026-11-05%20at%2019.30.14.jpeg)

**Acceptance criteria**

- [ ] `next-group` in one transaction: close the session, create the next with the same capacity and duration, generate codes.
- [ ] Replaying the same `Idempotency-Key` returns the same new session.
- [ ] `close` abandons a session from `JOINING`, `TREASURE_REVIEW` or `READY`, and ends one from `RESULTS` with no new session.
- [ ] Abandon needs a reason, and releases `RESERVED` entrance IDs so those people can join a later session.
- [ ] Emit `session:closed`, then revoke player tokens. Phones keep the final result until this moment, then clear (decision D30).
- [ ] The display goes to the joining screen when a new session opens, or to idle otherwise.
- [ ] Audit: "Session closed" with reason where given.
- [ ] The session stays in `RESULTS` indefinitely until the Controller acts.

<details open><summary><b>API contract</b></summary>

**API 28 · `POST /api/controller/sessions/:id/close`** · Auth: Controller

**New API.** Closes the session without opening another. This is how the Controller abandons a session. The End session button also uses it for the last group of the day.

Allowed from `JOINING`, `TREASURE_REVIEW` and `READY` (abandon), and from `RESULTS`. Request: `{ "reason": "Only 3 players turned up" }`. `reason` is required except from `RESULTS` (`422 REASON_REQUIRED`). Abandoning releases entrance IDs, so those people can join a later session.

200: `{ "session": { "id": "ses_01", "phase": "CLOSED" } }`

Errors: `409 INVALID_PHASE`

**API 29 · `POST /api/controller/sessions/:id/next-group`** · Auth: Controller

**New API, behind the "Next group" button.** In one transaction it closes the session and opens a fresh one.
Allowed from `RESULTS` only. Nothing happens on a timer: the session stays in `RESULTS` until the Controller calls this.

Headers: `Idempotency-Key: <uuid>` (required, so a double click cannot open two sessions).

No request body. Reuses the capacity and duration of the closed session.

201:
```json
{ "closedSessionId": "ses_01",
  "session": { "id": "ses_02", "phase": "JOINING", "capacity": 5, "roundDurationSeconds": 90, "joinedCount": 0 },
  "slots": [ { "slotNumber": 1, "code": "41", "shape": "BLUE_CIRCLE", "slotState": "UNJOINED", "player": null } ] }
```
Errors: `409 INVALID_PHASE` · `400 IDEMPOTENCY_KEY_REQUIRED`

</details>

<details open><summary><b>Socket events</b></summary>

`session:closed` → all
```json
{ "sessionId": "ses_01", "nextSessionOpened": true }
```

`session:opened` → display, controller
```json
{ "sessionId": "ses_02", "capacity": 5, "roundDurationSeconds": 90 }
```

</details>

**QE check:** Wait 5 minutes on the results screen: nothing changes. Double-click Next group: one new session. Abandon a session in Joining: a new one can open.

---

### BE-31 · Simulation harness and fairness tests

**Estimate:** 2.5d · **Planned:** D16–D18 · **Priority:** Must · **Needs:** BE-24 (Shravani, D14–D15), BE-25 (Asmita, D14–D15), BE-36 (Asmita, D15–D16)

One command that plays a whole game.

**Acceptance criteria**

- [ ] Drives Controller, 5 bot players and a display over real HTTP and sockets.
- [ ] Scenarios: happy path, 4 and 5 players, name review, abandon, tie at 100, disconnect and rejoin, late submission, duplicate retry, all blocked, discard, next group, event close.
- [ ] Runs in CI with fake agents, and by hand against real Gemini.
- [ ] Prints a pass or fail report per scenario.

**QE check:** Run it and read the report. It should be the first thing you run on any new build.

---
