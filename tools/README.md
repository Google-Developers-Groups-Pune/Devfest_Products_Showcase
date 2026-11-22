# Operational tools (placeholder)

| Folder | Story | Contents to add |
|---|---|---|
| `load-test/` | BE-37 (Shreya) | A small standalone load script: 5 players submitting every 2 seconds for 120 seconds, repeated for 10 sessions. It records p95 acknowledgement time (target under 1s) and score delivery time. It is kept separate from the BE-31 harness so it does not depend on it. |
| `runbook/` | BE-37 (Shreya) | Event-day runbook: pre-event checks, restart steps, deletion-failure steps, Gemini outage steps, and Controller login recovery. |

The whole-game simulation harness (BE-31) lives in `backend/test/harness/`, because it runs in backend CI.
