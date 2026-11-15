# The Frontier

Lunar South Pole base survival — play **solo** through Chapters 1–4, or join an **online crew** (2–4 players) on a shared Colyseus room.

Land at Nobile Rim 1, Mons Mouton, Malapert Massif, or Cabeus. Deploy solar arrays, harvest ice, ride hoppers between camps, and ride out solar storms.

## Play modes

| Mode | Entry |
|------|--------|
| **Solo Expedition** | Full story + sandbox on one device |
| **Online Crew** | Create/join a 4-character room code (Heroku Colyseus) |
| **Same Device** | Hotseat chapter vote on one keyboard |

## Frontend (this repo)

```sh
npm install
npm run dev          # http://localhost:8080 (or Vite port)
npm run typecheck
npm run test
npm run build
```

Set the multiplayer server URL for production builds:

```sh
# .env / hosting env
VITE_MULTIPLAYER_URL=wss://the-frontier-colyseus.herokuapp.com
```

Local default without the env var: `ws://localhost:2567`.

## Multiplayer server

Lives in [`server/`](./server). Deployed separately (e.g. Heroku).

```sh
cd server
npm install
npm run dev          # ws://localhost:2567
npm run build && npm start
```

Heroku: `Procfile` runs `node dist/index.js`; `heroku-postbuild` compiles TypeScript. Optional: `ENABLE_MONITOR=1` for `/colyseus` (off in production by default).

Health: `GET /health`

## Credits

See [CREDITS.md](./CREDITS.md) — Kenney Space Kit, Poly Haven Moon 02, NASA Blue Marble.

## Stack

- React 19 + TanStack Start + Vite + PlayCanvas
- Colyseus 0.15 (`colyseus.js` client + `server/` Node room)
