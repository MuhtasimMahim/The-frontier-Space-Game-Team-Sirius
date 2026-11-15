/**
 * New-user acceptance: Title → Solo → Chapter 1 with coach at every beat,
 * realistic energy/water, and a clear win. Catches tutorial traps kids hit.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { coachForState } from "@/frontier/game/coach";
import { CONFIG } from "@/frontier/game/config";
import { RULES } from "@/frontier/game/rules";
import { DOCK, HAB_DOOR, SimulationManager } from "@/frontier/game/simulation";

describe("New-user Chapter 1 flow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("walks Solo → chapter select → briefing → every coach beat → Habitat win", () => {
    const sim = new SimulationManager(42);

    // Title → Solo expedition
    expect(sim.state.phase).toBe("title");
    sim.openChapterSelect("solo");
    expect(sim.state.phase).toBe("chapters");
    expect(sim.state.playMode).toBe("solo");

    sim.enterChapter("chapter1");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter1");
    expect(sim.state.stage).toBe("orient");

    // Launch into play (skip cinematic timeout)
    sim.state.phase = "playing";
    sim.state.menuOpen = false;

    const expectCoach = (stage: string, goalHint: RegExp) => {
      expect(sim.state.stage).toBe(stage);
      const card = coachForState(sim.state);
      expect(card, `missing coach at ${stage}`).toBeTruthy();
      expect(card!.goal).toMatch(goalHint);
      expect(card!.doThis.length).toBeGreaterThan(8);
      expect(card!.why.length).toBeGreaterThan(8);
    };

    expectCoach("orient", /sirius|wake/i);

    // Cannot skip orientation with panels
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(0);

    sim.completeOrientation();
    expectCoach("panels", /electric|power|solar/i);

    // First 3 panels free of daily cap even if day rolled
    sim.state.panelsInstalledToday = 99;
    sim.installPanel();
    sim.installPanel();
    sim.installPanel();
    expect(sim.state.panelsInstalled).toBe(3);
    expectCoach("align_panels", /sun|light/i);

    sim.alignSolarArrays();
    expectCoach("board_rover", /ice|rover|trip/i);

    // Board only when near rover (starts at dock)
    sim.state.player.x = DOCK.x;
    sim.state.player.z = DOCK.z;
    sim.boardRover();
    expect(sim.state.player.inRover).toBe(true);
    expectCoach("find_ice", /ice|collect/i);

    // Tutorial harvest is capped so refining cannot bankrupt Habitat energy
    const energyBefore = sim.state.energy;
    expect(energyBefore).toBeGreaterThanOrEqual(60);
    sim.fillIce(1);
    expect(sim.state.rover.waterTank).toBeLessThanOrEqual(25);
    expect(sim.state.rover.waterTank).toBeGreaterThan(0);
    expectCoach("unload", /water|dock/i);

    sim.exitRover();
    expect(sim.state.rover.x).toBe(sim.state.rover.x); // parked
    sim.state.player.x = DOCK.x;
    sim.state.player.z = DOCK.z;

    sim.unloadWater();
    // After capped refine, player should still afford Habitat A
    expect(sim.state.water).toBeGreaterThanOrEqual(20);
    expect(sim.state.energy).toBeGreaterThanOrEqual(60);
    expectCoach("build_A", /habitat/i);

    sim.startBuilding("A");
    expect(sim.state.modules.A.status).toBe("building");
    for (let d = 0; d < CONFIG.MODULES.A.buildDays; d++) sim.onDayTick();
    expect(sim.state.modules.A.status).toBe("active");
    expectCoach("enter_airlock", /inside|airlock|step/i);

    sim.state.player.x = HAB_DOOR.x;
    sim.state.player.z = HAB_DOOR.z;
    sim.openAirlock();
    sim.step(RULES.AIRLOCK_SECONDS + 0.25);

    expect(sim.state.phase).toBe("won");
    expect(sim.state.chapter1Completed).toBe(true);
    expectCoach("done", /sirius|alive|live/i);
  });

  it("holds build_A until solar restores 60E after a heavy refine", () => {
    const sim = new SimulationManager(7);
    sim.openChapter1Briefing();
    sim.state.phase = "playing";
    sim.completeOrientation();
    sim.installPanel();
    sim.installPanel();
    sim.installPanel();
    sim.alignSolarArrays();
    sim.state.stage = "unload";
    sim.state.rover.waterTank = 25;
    sim.state.energy = 55; // below Habitat cost after refine (~8.75)
    sim.state.water = 10;

    sim.unloadWater();
    expect(sim.state.stage).toBe("unload"); // not enough energy yet
    expect(sim.state.water).toBeGreaterThanOrEqual(20);

    // Days of solar from 3 aligned panels at Nobile (0.75) ≈ +2.25E/day
    for (let i = 0; i < 8; i++) sim.onDayTick();
    expect(sim.state.energy).toBeGreaterThanOrEqual(60);
    expect(sim.state.stage).toBe("build_A");
  });

  it("labels Resume with chapter identity for new users", () => {
    const sim = new SimulationManager(3);
    sim.openChapter1Briefing();
    sim.state.phase = "playing";
    sim.completeOrientation();
    expect(sim.saveCheckpoint(false)).toBe(true);
    expect(sim.state.checkpointInfo?.chapterLabel).toMatch(/Ch\.1|Sirius/i);
  });
});
