<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Current priority (roadmap)

Phases 0–3 are done: audit, stabilize, the Chapter 1 vertical slice (Nobile Rim 1 / Camp Sirius), and the four-site solo storyline — Chapters 2–4 (Camp Helios / Mons Mouton, Camp Relay / Malapert, Camp Horizon / Cabeus) are playable end to end, each on its own site reached by hopper, with energy packs replacing cable “Power Lines”.

**Do next — finish solo polish (before multiplayer):**
1. Phase 4: offline NASA DONKI dataset, mission-director pacing, storm visuals, and checkpoint polish around the chapters (story storms are scripted today).
2. Optional NASA LOLA terrain pipeline when datasets are approved (terrain is still procedural).

**Multiplayer (in progress / production path):** Colyseus server in `server/` (Heroku). Title has Solo / Online Crew / Same Device. Online uses room codes (`filterBy`), host launch, action broadcast + peer apply. Soft role seat locks and full authoritative sim are still follow-ups; story steps already name a crew role via `roleSeat()`.

See `docs/RECONCILIATION.md` §10 for the full phase list.

## Project conventions

- The game (src/frontier) is loaded only in the browser via lazy + ClientOnly in src/routes/index.tsx — its modules use window/WebGL at import time and would crash SSR.
- Lunar movement physics lives in src/frontier/game/lunarPhysics.ts (pure TS, no PlayCanvas) with tests in src/test/lunarPhysics.test.ts; the 3D world only draws its bodies — keeps feel tunable and testable.
- 3D models are CC0 Kenney Space Kit GLBs vendored in public/models (textures in public/textures, attribution in CREDITS.md). Place them with ModelKit.place() in sceneKit.ts: scale is in Kenney units, the palette is recoloured (MODEL_REMAP for per-model swaps), and primitive stand-ins are hidden only after load, so the game stays playable if a model fails. The astronaut and rover are built from primitives in playcanvasWorld.ts (initPlayer/initRover) so they can animate limbs and wheels.
- Each site has its own terrain, sky, and look in sites.ts / siteScene.ts; App.tsx keys the canvas by site so hopper travel rebuilds the whole world. initBase places camp structures at y = 0, so every site's ground is exactly level inside CAMP_PLATEAU_RADIUS (tested in storyline.test.ts).
- Permanently shadowed ground (Cabeus) is a separate terrain mesh with SUNLESS_MASK: the sun and fill skip it, and only lamps created with affectLightmapped: true light it. Set masks after addComponent("render"), because the meshInstances setter resets them.
- Dev-only hooks: window.__world and window.__gameSim (set in PlayCanvasLunarWorld constructor) for scripted browser checks.
- Design-doc game rules (events, charging, boost, holds, hall of fame) live as pure functions in src/frontier/game/rules.ts with tests in src/test/rules.test.ts; simulation.ts and playcanvasWorld.ts call them — keeps balance testable.
- World interactions go through findAction() in playcanvasWorld.ts (one prompt = one action, E/R, optional hold measured in real time) — avoids prompt and key handling drifting apart.
- Four-base network rules (unlock, daily power/food/water flow, win streak) live as pure functions in src/frontier/game/network.ts with tests in src/test/network.test.ts; simulation.ts applies them once per day — keeps cross-base balance testable.
- Chapter defs live in src/frontier/game/chapters.ts (all chapters + sandbox playable). Chapters 2–4 are data in src/frontier/game/storyline.ts (steps, briefings, routes, campaign progress) with tests in src/test/storyline.test.ts; simulation.ts runs the steps and storyScene.ts draws their props. Some steps complete through world actions in findAction() (antenna lock, airlock, ice harvest, unloading water at the dock) rather than storyAction().
- Every objective, ice site, and outpost stays inside the 380 m rim and within rover slope limits on its route from camp; storyline.test.ts checks this, so run it after moving anything.
