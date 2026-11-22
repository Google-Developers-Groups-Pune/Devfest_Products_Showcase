# Harsimar

Frontend · owns the design widgets, the Controller dashboard and the display results

**Your load:** 18.5 days across 13 stories, finishing around D20. Days after that are for bug fixes and rehearsals. Project overview and decisions are in [STORIES.md](../STORIES.md).

## Your stories, in working order

| Story | Title | Days | Planned | Needs | Priority |
|---|---|---|---|---|---|
| FE-26 | Shared design widgets | 2 | D1–D2 | – | Must |
| FE-11 | Controller login and auth guard | 0.5 | D3 | FE-01, FE-26 | Must |
| FE-12 | Open session and booth codes | 2 | D4–D5 | FE-02, FE-11 | Must |
| FE-13 | Treasure review | 2 | D6–D7 | FE-12 | Must |
| FE-14 | Ready and start | 1 | D8 | FE-13 | Must |
| FE-28 | Name review | 1 | D9 | FE-14 | Must |
| FE-15 | Live monitor | 2 | D10–D11 | FE-14, FE-03 | Must |
| FE-16 | Result review | 1.5 | D12–D13 | FE-15 | Must |
| FE-27 | Winner confirmed and Next group | 0.5 | D13 | FE-16 | Must |
| FE-17 | Event day card: winners, CSV, close | 2 | D14–D15 | FE-12 | Must |
| FE-18 | Audit log panel | 0.5 | D16 | FE-17 | Must |
| FE-23 | Audience result screens | 1.5 | D16–D17 | FE-19, FE-26 | Must |
| FE-25 | Controller integration | 2 | D18–D20 | FE-17, FE-18, FE-27, FE-28, BE-29, BE-36, BE-39 | Must |

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

### FE-26 · Shared design widgets

**Estimate:** 2d · **Planned:** D1–D2 · **Priority:** Must

Build the look once. Everything else reuses it.

**Design:** [Display: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%282%29.jpeg) · [Player: lobby](../WhatsApp%20Image%202026-11-05%20at%2019.30.09.jpeg) · [Display: winner and story](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Colours are the Google logo palette: blue `#4285F4`, red `#EA4335`, yellow `#FBBC05`, green `#34A853`, on the dark background from the design.
- [ ] `TopStripe`, `ShapeAvatar`, `PlayerPill`, `ScoreChip`, `TimerPill`, `StatusChip`, `Podium`, `Card`.
- [ ] `MessageScreen`: one reusable template for the simple designed-by-dev screens (kicked, closed, idle, round cancelled), which keeps them quick to build.
- [ ] Score colours, from one function: 0–39 red, 40–79 yellow, 80–99 blue, 100 green.
- [ ] A simple widget gallery page for review.

> Starts on Day 1 with no backend or client needed. Agree the package layout with Mrudula first thing.

**QE check:** Open the gallery and compare against the screenshots.

---

### FE-11 · Controller login and auth guard

**Estimate:** 0.5d · **Planned:** D3 · **Priority:** Must · **Needs:** FE-01 (Mrudula, D1), FE-26 (Harsimar, D1–D2)

Protect the dashboard.

**Design:** [Controller: login](../WhatsApp%20Image%202026-11-05%20at%2019.30.12.jpeg)

🎨 **You design this, no mock exists:** The "signed in elsewhere" message. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Login card with Username and Password. The mock says Email, so change the label. Error state, token kept for the session.
- [ ] Every route is guarded. On 401, back to login.
- [ ] On `controller:kicked`, show that the account signed in elsewhere and return to login.
- [ ] Header: stripe dots, phase chip, username, Sign out.
- [ ] Remove the "any email and password work" line.

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

**QE check:** Log in, refresh, sign out, try a dashboard URL directly.

---

### FE-12 · Open session and booth codes

**Estimate:** 2d · **Planned:** D4–D5 · **Priority:** Must · **Needs:** FE-02 (Mrudula, D2–D3), FE-11 (Harsimar, D3)

Setup and joining screens.

**Design:** [Controller: setup](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%281%29.jpeg) · [Controller: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%282%29.jpeg)

🎨 **You design this, no mock exists:** Abandon session dialog with reason. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Setup: filled in from `lastSettings` when available. 4 or 5 players, duration stepper in steps of 20 seconds with no maximum, 60/90/120 presets, Open session.
- [ ] Stepper stops before reaching zero. Duration must stay a positive whole number.
- [ ] Joining: five slot cards with code and name, updating live.
- [ ] Players panel: label, full name, entrance ID, status chip, score.
- [ ] Status chips: Unjoined, Lobby, Playing, Locked 100, Disconnected, Result pending, Complete.
- [ ] Generate treasure is disabled until all joined, with the reason shown.
- [ ] **Abandon session** action in Joining, Treasure review and Ready, with a confirmation step and a required reason. Not in the mock.

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
Errors: `409 SESSION_ALREADY_ACTIVE` · `409 EVENT_CLOSED` · `422 VALIDATION_FAILED` · `409 EVENT_CLOSING_FAILED`

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

**API 6 · `PATCH /api/controller/sessions/:id/duration`** · Auth: Controller

Request: `{ "roundDurationSeconds": 120 }`. Allowed in `JOINING`, `TREASURE_REVIEW`, `READY`.

200: `{ "session": { "id": "ses_01", "roundDurationSeconds": 120 } }`

Errors: `409 INVALID_PHASE` · `422 VALIDATION_FAILED` · `409 EVENT_CLOSING_FAILED`

**API 28 · `POST /api/controller/sessions/:id/close`** · Auth: Controller

**New API.** Closes the session without opening another. This is how the Controller abandons a session. The End session button also uses it for the last group of the day.

Allowed from `JOINING`, `TREASURE_REVIEW` and `READY` (abandon), and from `RESULTS`. Request: `{ "reason": "Only 3 players turned up" }`. `reason` is required except from `RESULTS` (`422 REASON_REQUIRED`). Abandoning releases entrance IDs, so those people can join a later session.

200: `{ "session": { "id": "ses_01", "phase": "CLOSED" } }`

Errors: `409 INVALID_PHASE` · `422 REASON_REQUIRED` (abandon without a reason) · `409 EVENT_CLOSING_FAILED`

</details>

<details open><summary><b>Socket events</b></summary>

`player:joined` → all
```json
{ "joinedCount": 3, "capacity": 5, "players": [ <full public list> ] }
// The whole list is sent because a collision can change an earlier player's label.
// Controller also receives fullName and entranceId per player.
// Audience and players receive joinedCount and capacity only, with no names, until players:revealed.
```

`player:connection` → all
```json
{ "slotNumber": 2, "label": "Priya", "connection": "DISCONNECTED" }
// label is null until players:revealed, so a disconnect in the lobby never shows a name early (D16).
```

`phase:changed` → all
```json
{ "sessionId": "ses_01", "phase": "READY", "previousPhase": "TREASURE_REVIEW", "at": "..." }
```

</details>

**QE check:** Open a session and watch slots fill. Disconnect a phone. Abandon a session.

---

### FE-13 · Treasure review

**Estimate:** 2d · **Planned:** D6–D7 · **Priority:** Must · **Needs:** FE-12 (Harsimar, D4–D5)

Human approval gate.

**Design:** [Controller: treasure review](../WhatsApp%20Image%202026-11-05%20at%2019.30.13.jpeg)

🎨 **You design this, no mock exists:** Generating state (up to 40 seconds), generation failed state, image placement in the review card. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Loading state during generation, which can take 40 seconds. Keep it visibly alive.
- [ ] **Show the generated image, which is not in the mock.** Approve stays disabled until it loads.
- [ ] Card with "Passed content filter" and rubric chips for the scoring criteria. Leave out the "reviewed" and "auto-filtered" counters.
- [ ] Approve, and Reject and regenerate.
- [ ] Retry button on `treasure:failed`.

<details open><summary><b>API contract</b></summary>

**API 7 · `POST /api/controller/sessions/:id/treasure`** · Auth: Controller

**Changed from Backend_overview: now asynchronous**, because text + image generation can take 20 to 40 seconds.
Needs all players joined. Moves `JOINING` to `TREASURE_REVIEW`. No request body.

202:
```json
{ "candidate": { "candidateId": "cnd_1", "status": "GENERATING" } }
```
The result arrives on `treasure:ready` or `treasure:failed`.

Errors: `409 PLAYERS_NOT_JOINED` · `409 INVALID_PHASE` · `409 GENERATION_IN_PROGRESS` · `409 EVENT_CLOSING_FAILED`

**API 8 · `POST /api/controller/treasure/:id/approve`** · Auth: Controller

Pins the treasure, rubric version and image. Immutable from here. Phase becomes `READY`. No request body.

200: `{ "session": { "id": "ses_01", "phase": "READY" }, "treasure": { "candidateId": "cnd_1", "status": "APPROVED" } }`

Errors: `404 NOT_FOUND` · `409 CANDIDATE_NOT_READY` (no image yet, or failed) · `409 INVALID_PHASE` · `409 EVENT_CLOSING_FAILED`

**API 9 · `POST /api/controller/treasure/:id/reject`** · Auth: Controller

One action, matching the "Reject and regenerate" button: marks it rejected and starts a new candidate.

202: `{ "rejectedCandidateId": "cnd_1", "candidate": { "candidateId": "cnd_2", "status": "GENERATING" } }`

Errors: `404 NOT_FOUND` · `409 INVALID_PHASE` · `409 EVENT_CLOSING_FAILED`

</details>

<details open><summary><b>Socket events</b></summary>

`treasure:ready` → controller only
```json
{ "candidateId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...",
  "imageUrl": "<15-minute signed URL>", "filterPassed": true,
  "rubric": { "version": "v1", "scoringCriteria": [ "Requests a poem", "Exactly three lines" ] } }
```

`treasure:failed` → controller only
```json
{ "candidateId": "cnd_1", "stage": "TEXT | FILTER | IMAGE", "retryable": true }
```

</details>

**QE check:** Reject twice, approve once. Force a failure from the backend and retry.

---

### FE-14 · Ready and start

**Estimate:** 1d · **Planned:** D8 · **Priority:** Must · **Needs:** FE-13 (Harsimar, D6–D7)

Last check before the round.

**Design:** [Controller: ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%282%29.jpeg)

🎨 **You design this, no mock exists:** Agent down message on the Ready screen. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Treasure title, round length, Change link, Start button.
- [ ] Start is disabled, with the reason shown, until all players are connected, all names are approved, and all five agents are up.
- [ ] Calls `/health/agents` on this screen and names any agent that is down.
- [ ] Maps `409` and `503` errors to clear messages.

<details open><summary><b>API contract</b></summary>

**API 10 · `POST /api/controller/sessions/:id/start`** · Auth: Controller

Sets `roundEndAt = now + duration`. Phase becomes `PLAYING`. No request body.

200:
```json
{ "round": { "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90,
    "startedAt": "...", "roundEndAt": "...", "serverNow": "..." } }
```
Errors: `409 PLAYERS_NOT_READY` (someone missing or disconnected) · `409 NAMES_NOT_REVIEWED` · `409 TREASURE_NOT_APPROVED` · `409 INVALID_PHASE` · `503 AGENTS_UNAVAILABLE` (any one agent down) · `409 EVENT_CLOSING_FAILED`

**API 6 · `PATCH /api/controller/sessions/:id/duration`** · Auth: Controller

Request: `{ "roundDurationSeconds": 120 }`. Allowed in `JOINING`, `TREASURE_REVIEW`, `READY`.

200: `{ "session": { "id": "ses_01", "roundDurationSeconds": 120 } }`

Errors: `409 INVALID_PHASE` · `422 VALIDATION_FAILED` · `409 EVENT_CLOSING_FAILED`

**API 18 · `GET /api/controller/health/agents`** · Auth: Controller

200:
```json
{ "checkedAt": "...", "allHealthy": true,
  "agents": { "treasure": { "status": "UP", "latencyMs": 820, "model": "..." },
              "image":    { "status": "UP", "latencyMs": 300, "model": "..." },
              "filter":   { "status": "UP", "latencyMs": 400, "model": "..." },
              "guard":    { "status": "UP", "latencyMs": 900, "model": "..." },
              "emoji":    { "status": "UP", "latencyMs": 500, "model": "..." } } }
```
Cached for 60 seconds. `status` is `UP` or `DOWN`.

</details>

**QE check:** Try to start with each error the server can return.

---

### FE-28 · Name review

**Estimate:** 1d · **Planned:** D9 · **Priority:** Must · **Needs:** FE-14 (Harsimar, D8)

The Controller checks every name before the round starts.

**Design:** [Controller: ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%282%29.jpeg) · [Controller: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.12%20%282%29.jpeg)

🎨 **You design this, no mock exists:** Name review and rename on the Controller players panel. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Each player in the panel shows whether their name is reviewed, with Approve and Reject actions.
- [ ] Reject asks the Controller to type the replacement name.
- [ ] Start stays disabled until all names are approved, and says why.

<details open><summary><b>API contract</b></summary>

**API 30 · `POST /api/controller/players/:id/name-review`** · Auth: Controller

**New API.** The Controller approves a name, or rejects it and types a replacement. Start is refused until every name is approved.

Approve: `{ "decision": "APPROVED" }`

Reject and rename, typed by the Controller: `{ "decision": "RENAMED", "fullName": "Aman Sharma" }`. This replaces the name everywhere, including the CSV.

200: `{ "player": { "id": "ply_1", "label": "Aman", "nameReview": "APPROVED" }, "allApproved": false }`

When the last name is approved, the server emits `players:revealed`.

Errors: `404 NOT_FOUND` · `409 INVALID_PHASE` (`PLAYING` and later) · `422 NAME_REQUIRED` · `409 EVENT_CLOSING_FAILED`

</details>

**QE check:** Join with an offensive name. Replace it. The audience screen only ever shows the replacement.

---

### FE-15 · Live monitor

**Estimate:** 2d · **Planned:** D10–D11 · **Priority:** Must · **Needs:** FE-14 (Harsimar, D8), FE-03 (Mrudula, D4)

Watch the round.

**Design:** [Controller: live monitor](../WhatsApp%20Image%202026-11-05%20at%2019.30.13%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Treasure title, timer, four stat tiles, approved prompts list with sequence numbers.
- [ ] Blocked count only. Never any blocked text.
- [ ] Player panel updates live.
- [ ] Refresh mid-round fully restores the screen.

<details open><summary><b>API contract</b></summary>

**API 11 · `GET /api/controller/rounds/:id/monitor`** · Auth: Controller

200:
```json
{ "round": { "roundId": "rnd_1", "roundNumber": 1, "roundEndAt": "...", "serverNow": "..." },
  "stats": { "promptsScored": 4, "unlockedCount": 0, "blockedCount": 0, "agentErrors": 1 },
  "approvedPrompts": [ { "sequence": 5, "slotNumber": 1, "label": "Neha", "shape": "BLUE_CIRCLE",
      "text": "Give me a rhyme...", "score": 34, "reaction": "Vault ne smile bhi nahi kiya" } ],
  "errors": [ { "at": "...", "agent": "guard", "code": "TIMEOUT" } ] }
```
Never contains blocked prompt text.

</details>

<details open><summary><b>Socket events</b></summary>

`monitor:stats` → controller only
```json
{ "promptsScored": 4, "unlockedCount": 0, "blockedCount": 1, "agentErrors": 0 }
```

`feed:update` → display, controller
```json
{ "roundId": "rnd_1", "sequence": 19, "slotNumber": 1, "label": "Isha", "shape": "BLUE_CIRCLE",
  "text": "Write a polite...", "score": 100, "bestScore": 100, "reaction": "Guard ne salute maara!",
  "expression": "SALUTE" }
// If the reaction fails, reaction is null and expression is NEUTRAL.
```

`round:started` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": "...", "roundEndAt": "...", "serverNow": "...",
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "<signed URL>" } }
```

`player:unlocked` → all
```json
{ "slotNumber": 1, "label": "Isha", "unlocked": [ "Isha" ] }
```

</details>

**QE check:** Refresh the Controller at 30 seconds into a round. The round carries on.

---

### FE-16 · Result review

**Estimate:** 1.5d · **Planned:** D12–D13 · **Priority:** Must · **Needs:** FE-15 (Harsimar, D10–D11)

Confirm or discard. Nothing else.

**Design:** [Controller: result pending](../WhatsApp%20Image%202026-11-05%20at%2019.30.13%20%282%29.jpeg)

🎨 **You design this, no mock exists:** Discard dialog with reason, and the no-winner state. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Ranking rows with `deciding #N`, tie-break banner.
- [ ] Confirm button named after the winner, for example "Confirm Dev". No way to pick anyone else.
- [ ] If `canConfirm` is false, Confirm is hidden and the screen explains why.
- [ ] Discard needs a confirmation step and a reason. Afterwards, go to the Setup screen.
- [ ] Player chips show Result pending here, per PRD 10.2. The mock shows "Playing" for one player.

<details open><summary><b>API contract</b></summary>

**API 12 · `GET /api/controller/rounds/:id/result`** · Auth: Controller

200:
```json
{ "status": "PROVISIONAL",
  "winner": { "slotNumber": 2, "label": "Dev", "shape": "RED_SQUARE", "bestScore": 100 },
  "ranking": [ { "rank": 1, "playerId": "ply_2", "slotNumber": 2, "label": "Dev", "shape": "RED_SQUARE", "bestScore": 100,
      "decidingSubmissionId": "prm_19", "decidingSequence": 19, "decidingReceivedAt": "..." } ],
  "tieBreakExplanation": "Tie on 100. Dev reached it first (submission #19 before #32).",
  "canConfirm": true }
```
`status` is `PROVISIONAL` or `CONFIRMED`. `canConfirm` is false and `winner` is null when nobody scored.
Players with no score have `bestScore: null` and rank last, in alphabetical order by label.

Errors: `409 RESULT_NOT_READY`

**API 13 · `POST /api/controller/rounds/:id/confirm`** · Auth: Controller

Confirms the system's winner only. There is no winner field in the request. No request body.
Safe to repeat: a second call returns the same result. Phase becomes `RESULTS`.

200: `{ "result": { "status": "CONFIRMED", "roundNumber": 1, "confirmedAt": "..." }, "session": { "phase": "RESULTS" } }`

Errors: `409 NO_WINNER` (must discard) · `409 INVALID_PHASE` · `409 EVENT_CLOSING_FAILED`

**API 14 · `POST /api/controller/rounds/:id/discard`** · Auth: Controller

Request: `{ "reason": "Wi-Fi dropped for two players" }` (required, not blank).

Ends the session with no winner. Phase becomes `DISCARDED`, which is final. Entrance IDs are released, so the same people can join a new session with new codes.

200: `{ "session": { "id": "ses_01", "phase": "DISCARDED" } }`

Errors: `422 REASON_REQUIRED` · `409 INVALID_PHASE` · `409 EVENT_CLOSING_FAILED`

</details>

<details open><summary><b>Socket events</b></summary>

`round:ended` → all
```json
{ "roundId": "rnd_1", "endedAt": "..." }
```

`result:provisional` → display, controller
```json
{ "roundId": "rnd_1", "winner": { "slotNumber": 2, "label": "Dev", "shape": "RED_SQUARE", "bestScore": 100 } }
```

`round:discarded` → all
```json
{ "sessionId": "ses_01", "roundId": "rnd_1" }
// The session has ended. The discard reason is never sent to players or the display.
```

</details>

**QE check:** Try a tie at 100. Try a round with no scores. Try discarding with an empty reason.

---

### FE-27 · Winner confirmed and Next group

**Estimate:** 0.5d · **Planned:** D13 · **Priority:** Must · **Needs:** FE-16 (Harsimar, D12–D13)

Hand over to the next group, on the Controller's command.

**Design:** [Controller: winner confirmed](../WhatsApp%20Image%202026-11-05%20at%2019.30.14.jpeg)

**Acceptance criteria**

- [ ] Winner banner, "Recorded for the CSV" line, Next group button.
- [ ] Next group calls `next-group` straight away, reusing the last capacity and duration.
- [ ] One UUID per click. Button disabled while the call runs.
- [ ] Lands on the joining screen with new codes.
- [ ] **End session** button calls `close`, for the last group of the day. Not in the mock.
- [ ] Leave out the "Story time" chip shown in the mock (decision D43).

<details open><summary><b>API contract</b></summary>

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
Errors: `409 INVALID_PHASE` · `400 IDEMPOTENCY_KEY_REQUIRED` · `409 EVENT_CLOSING_FAILED`

**API 28 · `POST /api/controller/sessions/:id/close`** · Auth: Controller

**New API.** Closes the session without opening another. This is how the Controller abandons a session. The End session button also uses it for the last group of the day.

Allowed from `JOINING`, `TREASURE_REVIEW` and `READY` (abandon), and from `RESULTS`. Request: `{ "reason": "Only 3 players turned up" }`. `reason` is required except from `RESULTS` (`422 REASON_REQUIRED`). Abandoning releases entrance IDs, so those people can join a later session.

200: `{ "session": { "id": "ses_01", "phase": "CLOSED" } }`

Errors: `409 INVALID_PHASE` · `422 REASON_REQUIRED` (abandon without a reason) · `409 EVENT_CLOSING_FAILED`

</details>

<details open><summary><b>Socket events</b></summary>

`result:confirmed` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "winner": { ... }, "ranking": [ ... ], "tieBreakExplanation": "..." }
```

`session:closed` → all
```json
{ "sessionId": "ses_01", "nextSessionOpened": true }
```

`session:opened` → display, controller
```json
{ "sessionId": "ses_02", "capacity": 5, "roundDurationSeconds": 90 }
```

</details>

**QE check:** Wait past 60 seconds: nothing changes. Click Next group twice fast: one new session.

---

### FE-17 · Event day card: winners, CSV, close

**Estimate:** 2d · **Planned:** D14–D15 · **Priority:** Must · **Needs:** FE-12 (Harsimar, D4–D5)

End-of-day tools.

**Design:** [Controller: winner confirmed](../WhatsApp%20Image%202026-11-05%20at%2019.30.14.jpeg) · [Controller: ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%282%29.jpeg)

🎨 **You design this, no mock exists:** Close event dialog, and the Closing, Closed and Closing failed status screens. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Sidebar card on every screen: confirmed count, winners list.
- [ ] Export stays enabled at zero winners, unlike the mock, because an empty CSV is needed to close the day. Download uses a Blob, because a plain link cannot send the auth header.
- [ ] Close event day: available at any time, with a confirmation dialog. Blocked, with a clear message, until a CSV covering every winner has been exported (decision D44).
- [ ] Status screen for Closing, Closed and Closing failed, with the failing stage.

<details open><summary><b>API contract</b></summary>

**API 15 · `GET /api/controller/winners/export`** · Auth: Controller

200 `text/csv`, `Content-Disposition: attachment; filename="prompt-heist-winners.csv"`. Built in memory.

Columns: `full_name,entrance_id,round_number,confirmed_at,winning_score,treasure_title,treasure_id`

With no winners, this returns the header row only. That empty CSV still counts as exported.

Errors: `409 EVENT_CLOSED`

**API 16 · `POST /api/controller/event/close`** · Auth: Controller

Request: `{ "confirmation": "CLOSE EVENT" }`. Calling it again from `CLOSING_FAILED` retries the deletion.
Allowed in any phase. A live round is stopped, and any unconfirmed result is lost. Blocked until a CSV has been exported that covers every confirmed winner. With no winners, an empty CSV must still be exported first.

202: `{ "status": "CLOSING" }`. Outcome arrives on `event:status` and `GET /event/status`.

Errors: `409 CSV_NOT_EXPORTED` · `422 CONFIRMATION_REQUIRED` · `409 EVENT_CLOSED`

**API 17 · `GET /api/controller/event/status`** · Auth: Controller

200: `{ "status": "CLOSED", "closedAt": "...", "failure": null }`

`status` is `OPEN`, `CLOSING`, `CLOSED` or `CLOSING_FAILED`. On failure:
`"failure": { "stage": "STORAGE", "code": "DELETE_FAILED", "remaining": 3 }`. Reads the single status record kept after deletion.

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

`event:status` → controller only
```json
{ "status": "CLOSED", "failure": null }
```

</details>

**QE check:** Export, close, check the status screen. Force a failure from the backend.

---

### FE-18 · Audit log panel

**Estimate:** 0.5d · **Planned:** D16 · **Priority:** Must · **Needs:** FE-17 (Harsimar, D14–D15)

Operational view.

**Design:** [Controller: live monitor](../WhatsApp%20Image%202026-11-05%20at%2019.30.13%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Audit log in the sidebar, as in every mock Controller screen, newest first.

<details open><summary><b>API contract</b></summary>

**API 19 · `GET /api/controller/audit-logs?limit=50&cursor=`** · Auth: Controller

200:
```json
{ "items": [ { "id": "aud_1", "at": "...", "actor": "controller", "action": "TREASURE_APPROVED",
      "summary": "Treasure approved - The Saffron Vault", "reason": null, "correlationId": "..." } ],
  "nextCursor": null }
```

</details>

**QE check:** Perform actions and watch the log fill.

---

### FE-23 · Audience result screens

**Estimate:** 1.5d · **Planned:** D16–D17 · **Priority:** Must · **Needs:** FE-19 (Mrudula, D13), FE-26 (Harsimar, D1–D2)

The finish.

**Design:** [Display: time up](../WhatsApp%20Image%202026-11-05%20at%2019.30.09%20%282%29.jpeg) · [Display: winner and story](../WhatsApp%20Image%202026-11-05%20at%2019.30.11%20%281%29.jpeg)

🎨 **You design this, no mock exists:** Provisional winner state, ranking for all players, discard screen, image in the story card. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Time up: big "Time's up!", "Calculating results...".
- [ ] **Provisional winner, not in the mock:** show the winner and score, marked as pending (decision D22).
- [ ] Winner: "Isha wins!", tie-break line, and **every player ranked**, including places 4 and 5 (decision D47). The mock shows only the top 3.
- [ ] Story card with treasure image, backstory, "How it works" agent chips.
- [ ] Stays until the Controller moves on. No auto-advance.
- [ ] Discarded: never shows the reason.

<details open><summary><b>Socket events</b></summary>

`round:ended` → all
```json
{ "roundId": "rnd_1", "endedAt": "..." }
```

`result:provisional` → display, controller
```json
{ "roundId": "rnd_1", "winner": { "slotNumber": 2, "label": "Dev", "shape": "RED_SQUARE", "bestScore": 100 } }
```

`result:confirmed` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "winner": { ... }, "ranking": [ ... ], "tieBreakExplanation": "..." }
```

`round:discarded` → all
```json
{ "sessionId": "ses_01", "roundId": "rnd_1" }
// The session has ended. The discard reason is never sent to players or the display.
```

`session:closed` → all
```json
{ "sessionId": "ses_01", "nextSessionOpened": true }
```

</details>

**QE check:** Run through confirm and discard on the projector.

---

### FE-25 · Controller integration

**Estimate:** 2d · **Planned:** D18–D20 · **Priority:** Must · **Needs:** FE-17 (Harsimar, D14–D15), FE-18 (Harsimar, D16), FE-27 (Harsimar, D13), FE-28 (Harsimar, D9), BE-29 (Shreya, D13–D15), BE-36 (Asmita, D15–D16), BE-39 (Shreya, D17–D18)

Real backend, real booth laptop.

**Acceptance criteria**

- [ ] Whole Controller flow on the booth laptop and browser.
- [ ] Refresh and reconnect recovery in every phase.
- [ ] Three groups back to back using Next group.
- [ ] Full end-of-day: export, close, verify.

**QE check:** Full rehearsal.

---
