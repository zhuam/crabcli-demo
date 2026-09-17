# crabcli-demo

## Games

The `games/` directory contains small browser games: `099-idle-lemonade-stand`, `dice`, `pomodoro`, `stopwatch`, and `trivia-royale`.

hello from 105

## Health Check

Both server entries expose a `GET /health` endpoint (no auth required) for liveness probes. It returns `200` with JSON and never touches the database or WebSocket state.

### Gateway — main entry, port 3000

```bash
npm start                              # NODE_ENV=production tsx src/gateway/server.ts
curl -s http://localhost:3000/health
```

```json
{ "status": "ok", "version": "1.0.0", "uptime": 12.345, "games": 120 }
```

### Trivia Royale standalone server — port 3001

```bash
npm run dev:trivia                     # trivia server on http://localhost:3001
curl -s http://localhost:3001/health
```

```json
{ "status": "ok", "version": "1.0.0", "rooms": 0, "uptime": 12.345 }
```

### Fields

| Field     | Type   | Meaning                                                            |
| --------- | ------ | ------------------------------------------------------------------ |
| `status`  | string | Always `"ok"` while the process is alive (liveness, not readiness) |
| `version` | string | App version from `package.json`, read once at startup              |
| `uptime`  | number | Process uptime in seconds (`process.uptime()`)                     |
| `games`   | number | Registered game count (gateway only)                               |
| `rooms`   | number | Active trivia rooms (trivia server only)                           |

### Running the tests

Test suites talk to an already-running server:

```bash
npm start &                          # gateway on :3000
npm run test:hub                     # hub gateway integration tests (health, registry, auth, scores, favorites)
npx tsx tests/integration.test.ts    # trivia standalone tests (needs server on :3001)
```
