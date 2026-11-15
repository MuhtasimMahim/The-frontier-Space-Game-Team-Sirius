# Add the missing features from the design docs

The design docs describe several things the web game doesn't have yet. This plan adds only those, keeping everything else as is. All text stays in English.

## 1. Random events (biggest gap)

- Solar storms and micrometeor strikes on a fixed, repeatable schedule.
- Warning banner under the Day panel: grey for "coming", red for "happening now", plus one line explaining the science.
- Micrometeors can damage a module or destroy solar panels. A damaged module stops working but still costs upkeep; walk up and hold R to repair it. Destroyed panels can be reinstalled.

## 2. Module control panels and Farm pause

- Each finished module gets a panel outside with a status light (running / standby / damaged), its daily cost, and E/R hints.
- Press E at the Farm panel to pause or resume it, saving power and water.
- The Farm only makes food when there's enough power.
- When a module finishes, the message lists its daily cost (and for the Farm, how to pause it).

## 3. Hold-to-act and the airlock

- Installing a panel takes a 2-second hold, harvesting ice takes 3 seconds, with a progress ring.
- Habitat airlock: press E to open the door (6 seconds). You only count as "inside", and only get your oxygen back, once you're through.

## 4. Rover rules

- Repair the rover by holding R for 4 seconds next to it. Today pressing E there just gets you in.
- Each damage hit lowers top speed by 10%.
- Recovery console at base: brings a stranded rover home, empties its tank, recharges it to 20% and clears the damage.
- Charging uses base energy one-for-one and stops when the base runs out.
- The booster needs 20% battery to start, can run for 4 seconds, then needs 6 seconds to cool down.
- One warning at 25% battery, and the radar shows whether you have enough battery for the round trip.
- The charging pad changes color for empty, docked, charging and full, with a short message each time it changes.

## 5. Tips and science facts

- Tip cards appear at the right moments (first ice trip, low water, Farm pause, first event), with separate "Show tips" and "Show facts" checkboxes under the card.
- Fact cards show one at a time, each once per game, close themselves after 10 seconds, and fire at the right times (water fact when you first unload water, oxygen fact when oxygen runs low).
- The "too much energy" warning shows the first time and then every 5 days, not every day.

## 6. Small fixes

- The game ends on Day 90 itself, not the day after.
- Ice crystals shrink as you mine them, down to about a third of their size.

## 7. Results screen

- The crew log shows the real amount of water delivered and the modules built.
- The Hall of Fame keeps real winning runs saved on this device: top 5, with your rank.
- "Today's science brief" lists the facts you actually saw during the game.
- New sounds for repair, charging/full, airlock and construction, and separate win and loss sounds.

## Not included

- Multiplayer and the Roblox tooling.
- The difficulty numbers already match the latest docs, so they stay as they are.

## Order of work

1, 2, 4, 3, 5, 6, 7. I'll check each step in a test browser, but you'll need to judge how it feels and sounds on your own device.

## Technical details

- Add event scheduling (seeded), module damage, pause, hold timers, dock state, booster timers and the fact queue to `simulation.ts`. Put the numbers in `config.ts` under the GDD values.
- Add pure helpers for the event schedule, charge cost, speed after damage and hold progress, with Vitest tests next to `lunarPhysics.test.ts`.
- `playcanvasWorld.ts`: R key handling with keyup tracking, separate repair and boarding priority, airlock door entity and wall blocking, control-panel lamps, crystal scaling, dock pad color.
- HUD: event banner, tip card with toggles, hold progress ring, radar battery check. Modals: real stats and Hall of Fame saved in localStorage.
