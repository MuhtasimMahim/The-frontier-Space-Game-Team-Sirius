import { beforeEach, describe, expect, it } from "vitest";
import {
  CHECKPOINT_STORAGE_KEY,
  clearCheckpointFromStorage,
  loadCheckpointFromStorage,
  parseCheckpoint,
} from "@/frontier/game/checkpoint";
import { CONFIG } from "@/frontier/game/config";
import {
  RULES,
  applyOxygenRescuePenalty,
  dailySolarOutput,
  isChapter1Complete,
  solarAlignmentMultiplier,
} from "@/frontier/game/rules";
import { DOCK, HAB_DOOR, LANDER_POS, SimulationManager } from "@/frontier/game/simulation";

describe("Phase 2 — Nobile Rim 1 vertical slice & checkpoints", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reduces unaligned polar solar output to 70% and restores 100% once sun-tracked", () => {
    expect(solarAlignmentMultiplier(false)).toBe(0.7);
    expect(solarAlignmentMultiplier(true)).toBe(1.0);

    const unaligned = dailySolarOutput({
      panelsInstalled: 3,
      panelOutput: 1,
      siteSunlight: 0.75,
      solarAligned: false,
      activeStorm: false,
    });
    const aligned = dailySolarOutput({
      panelsInstalled: 3,
      panelOutput: 1,
      siteSunlight: 0.75,
      solarAligned: true,
      activeStorm: false,
    });
    expect(unaligned).toBeCloseTo(2.25 * 0.7, 5);
    expect(aligned).toBeCloseTo(2.25, 5);
  });

  it("completes the full Chapter 1 Nobile Rim 1 mission loop from briefing to Habitat A airlock", () => {
    const sim = new SimulationManager(101);
    sim.openChapter1Briefing();
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter1");
    expect(sim.state.selectedSite.name).toBe("Nobile Rim 1");
    expect(sim.state.stage).toBe("orient");
    expect(sim.state.solarAligned).toBe(false);

    // Enter playing directly at Nobile Rim 1
    sim.state.phase = "playing";

    // 1. Site orientation
    sim.completeOrientation();
    expect(sim.state.siteOriented).toBe(true);
    expect(sim.state.stage).toBe("panels");

    // 2. Deploy 3 solar panels -> advances to sun-tracker alignment
    sim.installPanel();
    sim.installPanel();
    sim.installPanel();
    expect(sim.state.stage).toBe("align_panels");
    expect(sim.state.networkOpen).toBe(false);

    // 3. Align polar sun-tracker -> advances to rover expedition
    sim.alignSolarArrays();
    expect(sim.state.solarAligned).toBe(true);
    expect(sim.state.stage).toBe("board_rover");
    expect(sim.state.seenFacts).toContain("solar_alignment");

    // 4. Walk to the rover, board, collect candidate ice, refine water at dock
    sim.state.player.x = DOCK.x + 2;
    sim.state.player.z = DOCK.z;
    sim.toggleRoverBoard();
    expect(sim.state.stage).toBe("find_ice");
    sim.fillIce(1);
    expect(sim.state.stage).toBe("unload");
    sim.toggleRoverBoard();
    sim.state.energy = 80;
    sim.unloadWater();
    expect(sim.state.stage).toBe("build_A");

    // 5. Build Habitat A and advance construction days
    sim.startBuilding("A");
    expect(sim.state.modules.A.status).toBe("building");
    for (let d = 0; d < CONFIG.MODULES.A.buildDays; d++) {
      sim.onDayTick();
    }
    expect(sim.state.modules.A.status).toBe("active");
    expect(sim.state.stage).toBe("enter_airlock");
    expect(sim.state.phase).toBe("playing");

    // 6. Open Habitat A airlock, cycle 6s, step inside -> Chapter 1 Victory!
    sim.state.player.x = HAB_DOOR.x;
    sim.state.player.z = HAB_DOOR.z;
    sim.openAirlock();
    sim.step(RULES.AIRLOCK_SECONDS + 0.2);

    expect(sim.state.chapter1Completed).toBe(true);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.stage).toBe("done");
    expect(loadCheckpointFromStorage()).toBeNull();

    // Optional continuation into full 4-base network
    sim.continueAfterChapter1();
    expect(sim.state.phase).toBe("playing");
    expect(sim.state.missionMode).toBe("full");
    expect(sim.state.networkOpen).toBe(true);
    expect(sim.state.stage).toBe("build_B");
  });

  it("triggers non-punitive emergency O2 rescue instead of abrupt Game Over", () => {
    expect(applyOxygenRescuePenalty(10, 5, { food: 1, water: 2 })).toEqual({ food: 9, water: 3 });
    expect(applyOxygenRescuePenalty(0, 1, { food: 1, water: 2 })).toEqual({ food: 0, water: 0 });

    const sim = new SimulationManager(55);
    sim.state.phase = "playing";
    sim.state.player.x = 180;
    sim.state.player.z = -150;
    sim.state.player.oxygen = 0.5;
    const startWater = sim.state.water;
    const startFood = sim.state.food;

    sim.step(2);

    expect(sim.state.phase).toBe("playing");
    expect(sim.state.stats.oxygenDeaths).toBe(1);
    expect(sim.state.player.oxygen).toBe(CONFIG.OXYGEN.max);
    expect(sim.state.player.x).toBe(LANDER_POS.x);
    expect(sim.state.water).toBe(startWater - CONFIG.OXYGEN.deathPenalty.water);
    expect(sim.state.food).toBe(startFood - CONFIG.OXYGEN.deathPenalty.food);
  });

  it("saves, validates, and restores versioned Zod checkpoints reproducibly", () => {
    const sim = new SimulationManager(777);
    sim.openChapter1Briefing();
    sim.state.phase = "playing";
    sim.completeOrientation();
    sim.installPanel();
    sim.installPanel();
    sim.state.day = 4;
    sim.state.energy = 63;
    sim.state.water = 31;
    sim.state.player.x = -14;
    sim.state.player.z = -8;

    expect(sim.saveCheckpoint(false)).toBe(true);
    expect(loadCheckpointFromStorage()?.day).toBe(4);

    // Fresh simulation restores exact mission state and deterministic event schedule
    const resumed = new SimulationManager(1);
    expect(resumed.state.hasCheckpoint).toBe(true);
    expect(resumed.resumeCheckpoint()).toBe(true);
    expect(resumed.state.phase).toBe("playing");
    expect(resumed.state.missionMode).toBe("chapter1");
    expect(resumed.state.day).toBe(4);
    expect(resumed.state.energy).toBe(63);
    expect(resumed.state.water).toBe(31);
    expect(resumed.state.panelsInstalled).toBe(2);
    expect(resumed.state.player.x).toBe(-14);
    expect(resumed.state.events).toEqual(sim.state.events);

    // Corrupted or incompatible schema version is safely rejected
    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify({ version: 999, day: "bad" }));
    expect(parseCheckpoint({ version: 999 })).toBeNull();
    expect(loadCheckpointFromStorage()).toBeNull();
    clearCheckpointFromStorage();
  });

  it("verifies every NASA science fact includes Game-vs-Real note and source URL", () => {
    expect(CONFIG.FACTS.length).toBeGreaterThanOrEqual(10);
    for (const f of CONFIG.FACTS) {
      expect(f.gameVsReal.length).toBeGreaterThan(15);
      expect(f.sourceUrl).toMatch(/^https:\/\/(www\.|science\.|nssdc\.gsfc\.)?nasa\.gov/);
    }
    expect(
      isChapter1Complete({
        habitatStatus: "active",
        airlockOpen: true,
        oxygenSource: "airlock",
      }),
    ).toBe(true);
  });
});
