import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/frontier/game/config";
import { DOCK, HAB_DOOR, LANDER_POS, SimulationManager } from "@/frontier/game/simulation";

function makePlayingSim(seed = 42) {
  const sim = new SimulationManager(seed);
  sim.state.phase = "playing";
  return sim;
}

describe("Phase 1 simulation regressions", () => {
  it("rover recovery preserves harvested water cargo and fixes empty unload stage", () => {
    const sim = makePlayingSim();
    sim.state.rover.x = 220;
    sim.state.rover.z = -180;
    sim.state.rover.waterTank = 45;
    sim.state.rover.battery = 0;
    sim.state.rover.damage = 2;
    sim.state.stage = "unload";

    sim.recoverRover();

    expect(sim.state.rover.x).toBe(DOCK.x);
    expect(sim.state.rover.z).toBe(DOCK.z);
    expect(sim.state.rover.waterTank).toBe(45);
    expect(sim.state.rover.damage).toBe(0);
    expect(sim.state.rover.battery).toBeGreaterThanOrEqual(
      sim.state.rover.batteryMax * CONFIG.ROVER.recoverBatteryRatio,
    );
    expect(sim.state.stage).toBe("unload");

    // If recovered with an empty tank while stage was 'unload', stage falls back to 'find_ice'
    sim.state.rover.waterTank = 0;
    sim.recoverRover();
    expect(sim.state.stage).toBe("find_ice");
  });

  it("seals Habitat A airlock when damaged and blocks unauthorized O2 refill", () => {
    const sim = makePlayingSim();
    sim.state.modules.A.status = "active";
    sim.state.airlock.open = true;
    sim.state.player.x = HAB_DOOR.x;
    sim.state.player.z = HAB_DOOR.z;
    sim.state.player.oxygen = 50;

    // Active + open airlock refills oxygen
    sim.step(1);
    expect(sim.state.player.oxygen).toBeGreaterThan(50);

    // Damaging Habitat A immediately seals the airlock and prevents opening or Lander O2 exploit
    sim.damageModule("A");
    expect(sim.state.airlock.open).toBe(false);
    sim.openAirlock();
    expect(sim.state.airlock.opening).toBe(0);

    const beforeAtDoor = sim.state.player.oxygen;
    sim.step(1);
    expect(sim.state.player.oxygen).toBeLessThan(beforeAtDoor);

    sim.state.player.x = LANDER_POS.x;
    sim.state.player.z = LANDER_POS.z;
    const beforeAtLander = sim.state.player.oxygen;
    sim.step(1);
    expect(sim.state.player.oxygen).toBeLessThan(beforeAtLander);
  });

  it("drains oxygen in an unpowered rover instead of granting infinite free O2", () => {
    const sim = makePlayingSim();
    sim.state.player.inRover = true;
    sim.state.player.oxygen = 60;
    sim.state.rover.x = 200;
    sim.state.rover.z = 200;
    sim.state.rover.battery = 0;

    sim.step(2);
    expect(sim.state.player.oxygen).toBeLessThan(60);

    // Restoring battery restores rover life-support refill
    const drained = sim.state.player.oxygen;
    sim.state.rover.battery = 25;
    sim.step(1);
    expect(sim.state.player.oxygen).toBeGreaterThan(drained);
  });

  it("charges a parked rover on the dock even while the player is seated inside", () => {
    const sim = makePlayingSim();
    sim.state.player.inRover = true;
    sim.state.rover.x = DOCK.x;
    sim.state.rover.z = DOCK.z;
    sim.state.rover.speed = 0;
    sim.state.rover.battery = 20;
    sim.state.energy = 50;

    sim.step(2);
    expect(sim.state.dockState).toBe("charging");
    expect(sim.state.rover.battery).toBeCloseTo(24, 5);
    expect(sim.state.energy).toBeCloseTo(46, 5);
  });

  it("preserves solar panel objective progress across days while resetting daily cap", () => {
    const sim = makePlayingSim();
    sim.installPanel();
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(2);
    expect(sim.state.panelsInstalledToday).toBe(2);
    expect(sim.state.stage).toBe("panels");

    // Advance to Day 2: daily cap resets, cumulative count stays 2, 3rd panel advances stage
    sim.onDayTick();
    expect(sim.state.day).toBe(2);
    expect(sim.state.panelsInstalledToday).toBe(0);
    expect(sim.state.panelsInstalled).toBe(2);

    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(3);
    expect(sim.state.stage).toBe("board_rover");
  });

  it("includes four-base network flow in daily HUD deltas and keeps batteryMax per-instance", () => {
    const baseMax = CONFIG.ROVER.batteryMax;
    const sim = makePlayingSim();
    sim.state.modules.A.status = "active";
    sim.state.panelsInstalled = 4;
    sim.state.energy = 500;
    sim.state.water = 200;

    // Build all 3 stages of POWER and EXPLORE
    for (let i = 0; i < 3; i++) {
      sim.buildFacility("POWER");
      sim.buildFacility("EXPLORE");
    }

    expect(sim.state.rover.batteryMax).toBe(baseMax + 20);
    expect(CONFIG.ROVER.batteryMax).toBe(baseMax);

    sim.onDayTick();
    // Solar = 4 * 0.85 = 3.4; Habitat A upkeep = 3E; POWER net = +8 - 2 = +6; EXPLORE = -2 => net +4E from network
    expect(sim.state.networkFlow.energy).toBe(4);
    expect(sim.state.dailyEnergyDelta).toBeCloseTo(4.4, 5);
  });

  it("cancels pending landing timeout when restarting the game", () => {
    vi.useFakeTimers();
    try {
      const sim = new SimulationManager(1);
      sim.startGame();
      sim.selectSite(CONFIG.SITES[0]!);
      expect(sim.state.phase).toBe("landing");

      sim.restartGame(2);
      expect(sim.state.phase).toBe("selecting");

      vi.advanceTimersByTime(CONFIG.LANDING_SECONDS * 1000 + 500);
      expect(sim.state.phase).toBe("selecting");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Chapter 1 blocks panels until orientation and frees the first three from the daily cap", () => {
    const sim = makePlayingSim();
    sim.state.missionMode = "chapter1";
    sim.state.chapter1Completed = false;
    sim.state.siteOriented = false;
    sim.state.stage = "orient";
    sim.state.panelsInstalled = 0;
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(0);

    sim.completeOrientation();
    expect(sim.state.siteOriented).toBe(true);
    sim.state.panelsInstalledToday = 3;
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(1);
    sim.installPanel();
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(3);
  });

  it("exiting the rover parks it in place and boarding requires walking back", () => {
    const sim = makePlayingSim();
    sim.state.rover.x = 120;
    sim.state.rover.z = -80;
    sim.state.player.x = 120;
    sim.state.player.z = -80;
    sim.boardRover();
    expect(sim.state.player.inRover).toBe(true);

    sim.state.rover.x = 200;
    sim.state.rover.z = -150;
    sim.exitRover();
    expect(sim.state.player.inRover).toBe(false);
    expect(sim.state.rover.x).toBe(200);
    expect(sim.state.rover.z).toBe(-150);
    expect(sim.state.player.x).toBeCloseTo(202.5, 5);

    // Too far away — cannot remount without walking over
    sim.state.player.x = 0;
    sim.state.player.z = 0;
    sim.boardRover();
    expect(sim.state.player.inRover).toBe(false);
    expect(sim.state.rover.x).toBe(200);
    expect(sim.state.rover.z).toBe(-150);

    sim.state.player.x = 201;
    sim.state.player.z = -150;
    sim.boardRover();
    expect(sim.state.player.inRover).toBe(true);
    expect(sim.state.rover.x).toBe(200);
    expect(sim.state.rover.z).toBe(-150);
  });

  it("Esc pause menu freezes the day clock and exitToTitle returns to title", () => {
    const sim = makePlayingSim();
    sim.state.dayTimer = 4;
    sim.openPauseMenu();
    expect(sim.state.menuOpen).toBe(true);

    sim.step(2);
    expect(sim.state.dayTimer).toBe(4);

    sim.closePauseMenu();
    expect(sim.state.menuOpen).toBe(false);
    sim.step(1);
    expect(sim.state.dayTimer).toBe(5);

    sim.openPauseMenu();
    sim.exitToTitle();
    expect(sim.state.phase).toBe("title");
    expect(sim.state.menuOpen).toBe(false);
  });

  it("provides extended oxygen capacity (5 minutes) and triggers rescue banner on zero O2", () => {
    const sim = makePlayingSim();
    // Move away from base/lander so player is outside
    sim.state.player.x = 100;
    sim.state.player.z = 100;
    sim.state.player.inRover = false;
    sim.state.player.oxygen = 100;

    // Verify extended drain rate: drains exactly 100/300 per second
    expect(CONFIG.OXYGEN.drainPerSecond).toBeCloseTo(100 / 300, 4);
    sim.step(30);
    // After 30s, oxygen should be approximately 90% (10% used)
    expect(sim.state.player.oxygen).toBeCloseTo(90, 0);

    // Set oxygen to right at the 15-second critical suffocation mark (15 * (100/300) = 5.0)
    sim.state.player.oxygen = 4.0; // <= 15s remaining
    sim.step(1);
    expect(sim.state.player.oxygen).toBeLessThan(4.0);

    // Drain completely to trigger emergency rescue drone
    sim.state.player.oxygen = 0.1;
    sim.step(1);

    // Verify emergency drone rescue banner and state
    expect(sim.state.rescueBanner).not.toBeNull();
    expect(sim.state.rescueBanner?.message).toContain("Suit oxygen reached zero");
    expect(sim.state.rescueBanner?.penaltyText).toContain("Penalty");
    expect(sim.state.player.oxygen).toBe(CONFIG.OXYGEN.max);
    expect(sim.state.stats.oxygenDeaths).toBe(1);
  });
});
