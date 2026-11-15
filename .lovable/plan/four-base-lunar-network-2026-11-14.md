# Four-base lunar network

Expand the game from one base into four connected bases, each with its own job, as described in the Team Sirius document. Single player; you can travel between bases by rover. All text stays in English.

## The four bases

- **Base A, Communication (Malapert Massif):** find a high spot, build the main antenna, line it up (hold E and turn until the signal bar is full), then build relay stations. Higher spots give a better signal but take more rover battery to reach.
- **Base B, Power (Mons Mouton):** airlock, solar panels, then a solar tower and power lines. Sends electricity to the other bases.
- **Base C, Food and water (Nobile Rim 1):** airlock, ice mining, water recycling, a farm, and optional LED lighting (more food, more power used).
- **Base D, Exploration (Peak near Cabeus B):** survey stations, radar scans that reveal hidden ice on the map, and rover upgrades (longer range).

## How they depend on each other

- Base B's power is shared over power lines. A base with no line runs only on its own panels.
- Base C supplies food and water to every base.
- Base A gives early warnings: with the antenna up, storm warnings come 2 days earlier.
- Base D reveals new ice sites and gives the rover more range.
- A network panel shows each base's status and what flows between them.

## Game flow changes

- Landing picks your first base. The other three unlock once your first base has an airlock and power.
- The win condition becomes: all four bases running together for 5 days in a row, within 90 days.
- Radiation storms stop ice mining and make it unsafe to stay outside for 1 to 2 days. Geomagnetic storms cut Base A's link to Earth until a backup is built.

## Not included

- Multiplayer and real NASA elevation maps (bases use generated terrain shaped after the doc's descriptions).

## Order of work

1. Network rules and tests. 2. Four base areas in the 3D world plus rover travel. 3. Each base's buildings. 4. Network panel and new win screen. 5. Storms.

## Technical details

- New pure module `network.ts` (base state, power and water flow, unlocks, win check) with Vitest tests; `simulation.ts` holds four base states instead of one.
- `config.ts` gets base definitions, building costs and upkeep; world places four base clusters about 400 m apart, reusing current models and findAction().
- HUD gets a base switcher and network panel; minimap shows all four bases.
