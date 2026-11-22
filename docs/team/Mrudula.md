# Mrudula

Senior Frontend · owns Flutter architecture, the player app and the live display

**Your load:** 19.0 days across 14 stories, finishing around D19. Days after that are for bug fixes and rehearsals. Project overview and decisions are in [STORIES.md](../STORIES.md).

## Your stories, in working order

| Story | Title | Days | Planned | Needs | Priority |
|---|---|---|---|---|---|
| FE-01 | Flutter workspace and app scaffold | 1 | D1 | – | Must |
| FE-02 | API and socket client | 2 | D2–D3 | FE-01 | Must |
| FE-03 | Server-synced countdown | 0.5 | D4 | FE-02 | Must |
| FE-05 | Booth code screen | 1 | D4–D5 | FE-02, FE-26 | Must |
| FE-06 | Name, entrance ID and lobby | 1 | D5–D6 | FE-05 | Must |
| FE-07 | Rejoin and kicked screens | 1 | D6–D7 | FE-06 | Must |
| FE-08 | Battle screen | 2.5 | D7–D9 | FE-03, FE-06 | Must |
| FE-09 | Prompt feedback | 1 | D10 | FE-08 | Must |
| FE-10 | Unlocked, time up, result, discarded, closed | 2 | D11–D12 | FE-09 | Must |
| FE-19 | Audience route shell | 1 | D13 | FE-02, FE-26 | Must |
| FE-20 | Audience idle, joining and get ready | 0.5 | D14 | FE-19 | Must |
| FE-21 | Audience battle view | 3 | D14–D17 | FE-20, FE-03, FE-31 | Must |
| FE-22 | Unlock moment | 0.5 | D17 | FE-21 | Must |
| FE-24 | Player and display integration | 2 | D18–D19 | FE-10, FE-22, BE-24, BE-36 | Must |

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

### FE-01 · Flutter workspace and app scaffold

**Estimate:** 1d · **Planned:** D1 · **Priority:** Must

The structure both frontend engineers build in.

**Acceptance criteria**

- [ ] **One Flutter app with three routes:** `/controller`, `/audience`, `/player` (decision D9).
- [ ] Riverpod and go_router with path URLs, not `/#/`. Flavours for mock and real backend.
- [ ] Load the Controller and audience code with deferred imports, so phones do not download it.
- [ ] Fonts bundled, not fetched at runtime. Booth Wi-Fi cannot be trusted.
- [ ] Remove the prototype-only items: flask button, "Demo codes" hints, "any email and password work", and the blue privacy note.

**QE check:** Open all three routes against the mock.

---

### FE-02 · API and socket client

**Estimate:** 2d · **Planned:** D2–D3 · **Priority:** Must · **Needs:** FE-01 (Mrudula, D1)

Typed access to the backend, with reconnection handled once for everyone.

**Acceptance criteria**

- [ ] Dart client generated from OpenAPI. Token interceptor. Error envelope mapped to typed errors.
- [ ] Socket client with auto-reconnect. On every reconnect, the app calls its hydrate endpoint.
- [ ] Reconnect is required, not optional: Cloud Run closes each socket at 60 minutes.
- [ ] Mock and real builds behave the same.

> Start from the contract in these stories on Day 2. Switch to the generated client when BE-02 lands, which is before this story ends.

**QE check:** Cut the network for 10 seconds in the mock build and watch the app recover.

---

### FE-03 · Server-synced countdown

**Estimate:** 0.5d · **Planned:** D4 · **Priority:** Must · **Needs:** FE-02 (Mrudula, D2–D3)

Every screen shows the same time.

**Design:** [Player: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.08.jpeg) · [Display: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%282%29.jpeg)

**Acceptance criteria**

- [ ] Offset calculated from `serverNow`, renders from `roundEndAt`.
- [ ] Shows a reconnecting state if `timer:sync` stops.
- [ ] Display only. It never decides whether a submission is allowed.
- [ ] Format `01:20`, mono font, turns red at `00:00`.

<details open><summary><b>Socket events</b></summary>

`timer:sync` → all, every 3 seconds while PLAYING
```json
{ "roundId": "rnd_1", "roundEndAt": "...", "serverNow": "..." }
```

</details>

**QE check:** Set a phone clock 2 minutes wrong and compare with the display.

---

### FE-05 · Booth code screen

**Estimate:** 1d · **Planned:** D4–D5 · **Priority:** Must · **Needs:** FE-02 (Mrudula, D2–D3), FE-26 (Harsimar, D1–D2)

First screen on the phone.

**Design:** [Player: booth code](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%281%29.jpeg)

**Acceptance criteria**

- [ ] Two digit boxes, Join button, "Rejoin a game" link.
- [ ] Stays on screen with a clear message on any error, and allows repeated tries.
- [ ] Holds the `joinToken` in memory for the next step.

<details open><summary><b>API contract</b></summary>

**API 20 · `POST /api/player/join/code`** · Auth: none

Request: `{ "code": "12" }`. Validates only; does not claim the slot.

200: `{ "joinToken": "<5-minute token>", "expiresAt": "...", "slot": { "slotNumber": 1, "capacity": 5, "shape": "BLUE_CIRCLE" } }`

Errors: `404 CODE_INVALID` · `409 CODE_ALREADY_CLAIMED` · `409 NO_ACTIVE_SESSION`

</details>

**QE check:** Enter a wrong code, a claimed code, then a right code.

---

### FE-06 · Name, entrance ID and lobby

**Estimate:** 1d · **Planned:** D5–D6 · **Priority:** Must · **Needs:** FE-05 (Mrudula, D4–D5)

Finish joining and wait.

**Design:** [Player: name and ID](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%282%29.jpeg) · [Player: lobby](../WhatsApp%20Image%202026-11-05%20at%2019.30.09.jpeg)

**Acceptance criteria**

- [ ] No privacy note. Leave out the blue box shown in the mock (decision D15).
- [ ] Messages for blank, duplicate and already-played IDs.
- [ ] Lobby: 5/5 progress bars, player pills, "Your shape: blue circle", "(you)" marker. Other players' names stay hidden until `players:revealed`, so show only the count until then (decision D16).
- [ ] Updates live. Moves to battle on `round:started` with no button.
- [ ] Token kept in session storage so a refresh does not lose the player.

<details open><summary><b>API contract</b></summary>

**API 21 · `POST /api/player/join`** · Auth: joinToken

Request: `{ "fullName": "Aman Sharma", "entranceId": "DF-2026-0007" }`. Name max 80 characters. The ID can contain any characters, max 128.

201:
```json
{ "playerToken": "<token>",
  "player": { "id": "ply_1", "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE", "state": "LOBBY" } }
```
Errors: `422 NAME_REQUIRED` · `422 ENTRANCE_ID_REQUIRED` · `409 ENTRANCE_ID_IN_SESSION` · `409 ENTRANCE_ID_USED` · `409 CODE_ALREADY_CLAIMED` · `401 JOIN_TOKEN_EXPIRED`

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

</details>

<details open><summary><b>Socket events</b></summary>

`player:joined` → all
```json
{ "joinedCount": 3, "capacity": 5, "players": [ <full public list> ] }
// The whole list is sent because a collision can change an earlier player's label.
// Controller also receives fullName and entranceId per player.
// Audience and players receive joinedCount and capacity only, with no names, until players:revealed.
```

`players:revealed` → audience, players
```json
{ "players": [ <full public list, with final names> ] }
// Sent once, when the last name is approved. All names appear together.
```

`player:connection` → all
```json
{ "slotNumber": 2, "label": "Priya", "connection": "DISCONNECTED" }
```

`phase:changed` → all
```json
{ "sessionId": "ses_01", "phase": "READY", "previousPhase": "TREASURE_REVIEW", "at": "..." }
```

`round:started` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": "...", "roundEndAt": "...", "serverNow": "...",
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "<signed URL>" } }
```

</details>

**QE check:** Join 5 phones and watch the lobby fill. Refresh one.

---

### FE-07 · Rejoin and kicked screens

**Estimate:** 1d · **Planned:** D6–D7 · **Priority:** Must · **Needs:** FE-06 (Mrudula, D5–D6)

Get a player back into the game.

**Design:** [Player: booth code](../WhatsApp%20Image%202026-11-05%20at%2019.30.08%20%281%29.jpeg)

🎨 **You design this, no mock exists:** Rejoin screen, and the "you joined on another device" screen. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Rejoin screen asks only for the entrance ID.
- [ ] Routes to the correct screen for the restored state: lobby, battle, locked, time up, or results.
- [ ] Old device shows "You joined on another device" and stops.
- [ ] `401 SESSION_CLOSED`: clear the phone and return to the booth code screen.

<details open><summary><b>API contract</b></summary>

**API 22 · `POST /api/player/rejoin`** · Auth: none

Request: `{ "entranceId": "DF-2026-0007" }`. Restores the slot, issues a new token, kicks the old device.

200: `{ "playerToken": "<new token>", "player": { "id": "ply_1", "slotNumber": 1, "label": "Aman", "shape": "BLUE_CIRCLE", "state": "PLAYING" } }`

Errors: `404 NO_ACTIVE_GAME` · `429 TOO_MANY_ATTEMPTS` (10 per IP per minute)

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

</details>

<details open><summary><b>Socket events</b></summary>

`player:kicked` → old player socket only
```json
{ "reason": "REJOINED_ON_ANOTHER_DEVICE" }
```

</details>

**QE check:** Rejoin from a second phone in each phase.

---

### FE-08 · Battle screen

**Estimate:** 2.5d · **Planned:** D7–D9 · **Priority:** Must · **Needs:** FE-03 (Mrudula, D4), FE-06 (Mrudula, D5–D6)

The main phone screen.

**Design:** [Player: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.08.jpeg)

🎨 **You design this, no mock exists:** Image placement in the treasure card, and the Story view. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Timer pill, thin time bar, Best chip, treasure card, prompt list, input at the bottom.
- [ ] **Add the treasure image, which is not in the mock.**
- [ ] A missing image shows a placeholder and never delays the timer or the input.
- [ ] Input limited to 200 characters with a counter. Send button.
- [ ] Any language is allowed, so the placeholder drops "in English" from the mock.
- [ ] One UUID per prompt, generated before sending, reused on a retry.
- [ ] Input stays usable while earlier prompts are being evaluated.
- [ ] Shows status labels: submitting, evaluating.
- [ ] Input works with the on-screen keyboard on iOS Safari and Android Chrome.

<details open><summary><b>API contract</b></summary>

**API 24 · `POST /api/player/prompts`** · Auth: Player

Headers: `Idempotency-Key: <uuid>` (required; reuse the same key on a retry).

Request: `{ "text": "Write a polite 3-line poem..." }`. 1 to 200 characters after trimming.

202 (new) or 200 (repeat of a known key, returning the stored state):
```json
{ "promptId": "prm_1", "status": "RECEIVED", "sequence": 19, "receivedAt": "..." }
```
Errors: `400 IDEMPOTENCY_KEY_REQUIRED` · `422 PROMPT_EMPTY` · `422 PROMPT_TOO_LONG` · `409 ROUND_NOT_PLAYING` · `409 ROUND_EXPIRED` · `409 PLAYER_LOCKED` · `401 TOKEN_SUPERSEDED`

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

</details>

<details open><summary><b>Socket events</b></summary>

`round:started` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": "...", "roundEndAt": "...", "serverNow": "...",
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "<signed URL>" } }
```

</details>

**QE check:** Submit 5 prompts quickly. Throttle the network and check no duplicates appear.

---

### FE-09 · Prompt feedback

**Estimate:** 1d · **Planned:** D10 · **Priority:** Must · **Needs:** FE-08 (Mrudula, D7–D9)

Show each outcome clearly.

**Design:** [Player: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.08.jpeg)

🎨 **You design this, no mock exists:** Blocked prompt state, failed prompt state, reconnecting state. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Card per prompt: score circle in its band colour, feedback, prompt text.
- [ ] Blocked: neutral message, ready to retry. Failed: retry message.
- [ ] Pending for over 10 seconds: checks `GET /prompts/:id`.

<details open><summary><b>API contract</b></summary>

**API 25 · `GET /api/player/prompts/:id`** · Auth: Player

Fallback if a socket event is missed. Owner only.

200: `{ "promptId": "prm_1", "status": "SCORED", "score": 9, "feedback": "...", "message": null, "receivedAt": "...", "sequence": 19 }`

`status`: `RECEIVED`, `FILTERING`, `BLOCKED`, `APPROVED`, `SCORING`, `SCORED`, `FAILED`, `DISPLAYED`. Errors: `404 NOT_FOUND` (also returned for someone else's prompt)

</details>

<details open><summary><b>Socket events</b></summary>

`prompt:scored` → that player only
```json
{ "promptId": "prm_1", "score": 45, "feedback": "...", "bestScore": 45 }
```

`prompt:blocked` → that player only
```json
{ "promptId": "prm_2", "message": "That prompt cannot be displayed. Try a different game-focused prompt." }
```

`prompt:failed` → that player only
```json
{ "promptId": "prm_3", "message": "We could not score that one. Please try again.", "canRetry": true }
```

</details>

**QE check:** Use the mock replay to trigger scored, blocked and failed.

---

### FE-10 · Unlocked, time up, result, discarded, closed

**Estimate:** 2d · **Planned:** D11–D12 · **Priority:** Must · **Needs:** FE-09 (Mrudula, D10)

Everything after the battle.

**Design:** [Player: time up](../WhatsApp%20Image%202026-11-05%20at%2019.30.09%20%281%29.jpeg) · [Player: final result](../WhatsApp%20Image%202026-11-05%20at%2019.30.07.jpeg)

🎨 **You design this, no mock exists:** Treasure unlocked state on the phone, the winner's own result, the "Your score is zero" state, and the round cancelled message. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] "Treasure unlocked!" with disabled input after 100. The timer keeps running.
- [ ] Time up: "Calculating results", best score, prompts scored, rule text.
- [ ] Result: "You came 4th", podium, rest of the list, story card with image.
- [ ] A player with no score sees "Your score is zero" (decision D40).
- [ ] `round:discarded`: show a short round cancelled message, then return to the booth code screen. The reason is never shown.
- [ ] The final result stays until `session:closed`. Then clear the phone and return to the booth code screen (decision D30).

<details open><summary><b>API contract</b></summary>

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

<details open><summary><b>Socket events</b></summary>

`player:unlocked` → all
```json
{ "slotNumber": 1, "label": "Isha", "unlocked": [ "Isha" ] }
```

`round:ended` → all
```json
{ "roundId": "rnd_1", "endedAt": "..." }
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

**QE check:** Reach 100 on one phone while others play. Confirm a winner, then start the next session: the phone clears.

---

### FE-19 · Audience route shell

**Estimate:** 1d · **Planned:** D13 · **Priority:** Must · **Needs:** FE-02 (Mrudula, D2–D3), FE-26 (Harsimar, D1–D2)

A screen that looks after itself.

**Acceptance criteria**

- [ ] No login. Hydrates from `/api/display/state`.
- [ ] Router driven only by `phase`.
- [ ] Auto-reconnect and rehydrate. A refresh mid-round lands on the right screen.
- [ ] Designed for 1080p and 4K, no scrolling.
- [ ] Keeps the screen awake if the browser allows.

<details open><summary><b>API contract</b></summary>

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

<details open><summary><b>Socket events</b></summary>

`phase:changed` → all
```json
{ "sessionId": "ses_01", "phase": "READY", "previousPhase": "TREASURE_REVIEW", "at": "..." }
```

</details>

**QE check:** Unplug the network mid-round for 10 seconds, then reconnect.

---

### FE-20 · Audience idle, joining and get ready

**Estimate:** 0.5d · **Planned:** D14 · **Priority:** Must · **Needs:** FE-19 (Mrudula, D13)

What the crowd sees before the round.

**Design:** [Display: joining](../WhatsApp%20Image%202026-11-05%20at%2019.30.10.jpeg) · [Display: get ready](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%281%29.jpeg)

🎨 **You design this, no mock exists:** Idle screen, and a joining screen with no names. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] A screen for when no session is open.
- [ ] Joining: URL panel and joined count only. **No names appear one by one**, unlike the mock. When `players:revealed` arrives, all names appear at once (decision D16).
- [ ] Get ready: "The Controller is choosing today's treasure" and player pills.
- [ ] Nothing from an unapproved treasure is ever shown.
- [ ] Goes back to joining when `session:opened` arrives.

<details open><summary><b>Socket events</b></summary>

`session:opened` → display, controller
```json
{ "sessionId": "ses_02", "capacity": 5, "roundDurationSeconds": 90 }
```

`player:joined` → all
```json
{ "joinedCount": 3, "capacity": 5, "players": [ <full public list> ] }
// The whole list is sent because a collision can change an earlier player's label.
// Controller also receives fullName and entranceId per player.
// Audience and players receive joinedCount and capacity only, with no names, until players:revealed.
```

`players:revealed` → audience, players
```json
{ "players": [ <full public list, with final names> ] }
// Sent once, when the last name is approved. All names appear together.
```

`player:connection` → all
```json
{ "slotNumber": 2, "label": "Priya", "connection": "DISCONNECTED" }
```

</details>

**QE check:** Run through a session open, joins, and next group.

---

### FE-21 · Audience battle view

**Estimate:** 3d · **Planned:** D14–D17 · **Priority:** Must · **Needs:** FE-20 (Mrudula, D14), FE-03 (Mrudula, D4), FE-31 (Asmita, D11–D12)

The screen the audience watches.

**Design:** [Display: battle](../WhatsApp%20Image%202026-11-05%20at%2019.30.10%20%282%29.jpeg)

🎨 **You design this, no mock exists:** A row layout that fits a full 200-character prompt, a 100-character reaction and the emoji, plus image placement and a disconnected badge. Use the existing style and show the design in your PR.

**Acceptance criteria**

- [ ] Title, timer, challenge card, five player rows sorted by best score, as on the screen.
- [ ] **Add the treasure image.** The challenge card has spare space between the objective and the backstory.
- [ ] Row: colour marker, label, its own emoji animation for the latest `expression`, latest prompt, reaction, score and bar.
- [ ] **Prompts and reactions show in full, never cut off** (decision D46). Five rows of 200-character prompts must fit with no scrolling, so change the mock layout as needed.
- [ ] The emoji is the main entertainment for the crowd, so it must read clearly from a distance and change visibly with each prompt.
- [ ] **Never cut off "(Player 5)".** The mock truncates to "Meera (Player ...", which hides the only thing telling two Meeras apart. Shorten the name part or wrap to two lines.
- [ ] Disconnected badge per row.
- [ ] Check emoji in reactions render correctly on Flutter Web, which may need a bundled emoji font.

<details open><summary><b>Socket events</b></summary>

`round:started` → all
```json
{ "roundId": "rnd_1", "roundNumber": 1, "durationSeconds": 90, "startedAt": "...", "roundEndAt": "...", "serverNow": "...",
  "treasure": { "treasureId": "cnd_1", "title": "...", "backstory": "...", "lockObjective": "...", "imageUrl": "<signed URL>" } }
```

`feed:update` → display, controller
```json
{ "roundId": "rnd_1", "sequence": 19, "slotNumber": 1, "label": "Isha", "shape": "BLUE_CIRCLE",
  "text": "Write a polite...", "score": 100, "bestScore": 100, "reaction": "Guard ne salute maara!",
  "expression": "SALUTE" }
// If the reaction fails, reaction is null and expression is NEUTRAL.
```

</details>

**QE check:** Replay a full mock game on the projector and read it from 5 metres away.

---

### FE-22 · Unlock moment

**Estimate:** 0.5d · **Planned:** D17 · **Priority:** Must · **Needs:** FE-21 (Mrudula, D14–D17)

Celebrate a 100 without implying the game is over.

**Design:** [Display: unlocked](../WhatsApp%20Image%202026-11-05%20at%2019.30.11.jpeg)

**Acceptance criteria**

- [ ] Row turns green with "Unlocked!" at once.
- [ ] Banner: "Isha, Meera (Player 5) unlocked the treasure! The winner is still decided when the timer hits 00:00."

<details open><summary><b>Socket events</b></summary>

`player:unlocked` → all
```json
{ "slotNumber": 1, "label": "Isha", "unlocked": [ "Isha" ] }
```

</details>

**QE check:** Trigger two unlocks in a row.

---

### FE-24 · Player and display integration

**Estimate:** 2d · **Planned:** D18–D19 · **Priority:** Must · **Needs:** FE-10 (Mrudula, D11–D12), FE-22 (Mrudula, D17), BE-24 (Shravani, D14–D15), BE-36 (Asmita, D15–D16)

Real backend, real devices.

**Acceptance criteria**

- [ ] iOS Safari and Android Chrome on 5 real phones.
- [ ] Cellular and throttled network.
- [ ] Projector at real resolution.
- [ ] Player first-load time recorded and acceptable.

**QE check:** Full rehearsal.

---
