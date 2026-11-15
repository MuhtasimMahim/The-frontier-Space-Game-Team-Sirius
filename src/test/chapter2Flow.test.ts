/**
 * New-user Chapter 2 (Camp Helios) acceptance: Solo enter → briefing →
 * survey → tower → packs (with flare) → launch → win, with Mission Coach
 * at every beat.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { coachForState } from "@/frontier/game/coach";
import { loadCheckpointFromStorage } from "@/frontier/game/checkpoint";
import {
  CARGO_CONSOLE,
  CARGO_PAD,
  HELIOS_TOWER,
  STORY,
  STORY_CHAPTERS,
  describeStep,
  loadCampaign,
} from "@/frontier/game/storyline";
import { SimulationManager } from "@/frontier/game/simulation";

function standAt(sim: SimulationManager, p: { x: number; z: number }, inRover = false) {
  sim.state.player.inRover = inRover;
  sim.state.player.x = p.x;
  sim.state.player.z = p.z;
  if (inRover) {
    sim.state.rover.x = p.x;
    sim.state.rover.z = p.z;
  }
}

function act(sim: SimulationManager) {
  const a = sim.storyAction();
  expect(a, `expected story prompt (step ${sim.state.story.stepIndex})`).not.toBeNull();
  expect(a!.id).not.toBe("info");
  sim.performStoryAction(a!);
  return a!;
}

function run(sim: SimulationManager, seconds: number) {
  for (let t = 0; t < seconds && sim.state.phase === "playing"; t += 0.25) sim.step(0.25);
}

function expectCoach(sim: SimulationManager, goalHint: RegExp) {
  const card = coachForState(sim.state);
  expect(card, "Mission Coach missing").toBeTruthy();
  expect(card!.goal).toMatch(goalHint);
  expect(card!.doThis.length).toBeGreaterThan(10);
  expect(card!.why.length).toBeGreaterThan(10);
  return card!;
}

describe("New-user Chapter 2 (Camp Helios) flow", () => {
  beforeEach(() => localStorage.clear());

  it("completes Solo → Ch.2 → survey → tower → packs → launch with coaching", () => {
    const sim = new SimulationManager(11);
    const def = STORY_CHAPTERS.chapter2;

    sim.openChapterSelect("solo");
    sim.enterChapter("chapter2");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter2");
    expect(sim.state.selectedSite.name).toBe("Mons Mouton");
    expect(sim.state.energy).toBe(def.start.energy);
    expect(sim.state.modules.A.status).toBe("active");
    expect(sim.state.rover.battery).toBe(sim.state.rover.batteryMax);

    // Skip landing cinematic
    sim.state.phase = "playing";
    sim.state.menuOpen = false;
    sim.startLoop();
    sim.pauseLoop();

    expect(sim.state.stage).toBe("story");
    expect(sim.state.story.stepIndex).toBe(0);
    expect(expectCoach(sim, /survey|sunlight/i).doThis).toMatch(/board|rover/i);
    // Docked rover must NOT steal coach away from the survey objective
    sim.state.player.inRover = true;
    sim.state.rover.x = 10;
    sim.state.rover.z = 0;
    sim.state.dockState = "docked";
    sim.state.rover.battery = sim.state.rover.batteryMax - 1;
    expect(expectCoach(sim, /survey|sunlight/i).doThis).toMatch(/beacon|mast|hold e/i);

    // Survey all three masts from the rover
    for (const mast of def.steps[0]!.targets!) {
      standAt(sim, mast, true);
      expect(act(sim).id).toBe("survey");
    }
    expect(sim.state.story.stepIndex).toBe(1);
    expectCoach(sim, /tower|solar|raise/i);

    // Must step out to build — rover only shows info
    standAt(sim, HELIOS_TOWER, true);
    const stuck = sim.storyAction();
    expect(stuck?.id).toBe("info");
    expect(stuck?.actionText).toMatch(/step out/i);
    expect(expectCoach(sim, /tower|solar|raise/i).doThis).toMatch(/space|step out/i);

    standAt(sim, HELIOS_TOWER, false);
    for (let i = 0; i < 3; i++) {
      expect(sim.state.energy).toBeGreaterThanOrEqual(10);
      expect(act(sim).id).toBe("build");
    }
    expect(sim.state.story.built).toEqual(["tower_1", "tower_2", "tower_3"]);
    expect(sim.state.story.stepIndex).toBe(2);
    expectCoach(sim, /pack|haul|energy/i);

    // Wait for packs; first charge should toast and tip
    standAt(sim, HELIOS_TOWER, true);
    run(sim, STORY.PACK_SECONDS + 0.5);
    expect(sim.state.story.packsMade).toBeGreaterThanOrEqual(1);
    expect(sim.state.seenTips).toContain("first_pack");

    // Two rover trips of 2 packs; first unload triggers flare
    for (let trip = 0; trip < 2; trip++) {
      standAt(sim, HELIOS_TOWER, true);
      run(sim, STORY.PACK_SECONDS * 3);
      expect(act(sim).id).toBe("load_packs");
      expect(sim.state.story.packsCarried).toBe(2);
      expect(expectCoach(sim, /pack|haul|energy/i).doThis).toMatch(/hopper|unload/i);

      standAt(sim, CARGO_PAD, true);
      expect(act(sim).id).toBe("unload_packs");
      if (trip === 0) {
        expect(sim.state.activeStorm).toBe(true);
        expect(sim.state.story.flareTimer).toBeGreaterThan(0);
        expectCoach(sim, /pack|haul|energy|flare/i);
        run(sim, STORY.FLARE_SECONDS + 1);
        expect(sim.state.activeStorm).toBe(false);
      }
    }
    expect(sim.state.story.packsLoaded).toBe(4);
    expect(sim.state.story.stepIndex).toBe(3);
    expectCoach(sim, /launch|sirius|hopper/i);

    // Launch on foot
    standAt(sim, CARGO_CONSOLE, true);
    expect(sim.storyAction()?.id).toBe("info");
    standAt(sim, CARGO_CONSOLE, false);
    expect(act(sim).id).toBe("launch");
    expect(describeStep(def, sim.state.story, sim.state).title).toBe("Hopper away!");
    expectCoach(sim, /hopper|away|launch/i);

    run(sim, STORY.LAUNCH_SECONDS + 1);
    expect(sim.state.phase).toBe("won");
    expect(loadCampaign()).toContain("chapter2");
    expect(loadCheckpointFromStorage()).toBeNull();
    expectCoach(sim, /helios|online/i);
  });

  it("refuses tower build when energy is too low and recovers after solar", () => {
    const sim = new SimulationManager(12);
    sim.openStoryBriefing("chapter2");
    sim.state.phase = "playing";
    sim.state.story.stepIndex = 1;
    sim.state.energy = 5;
    standAt(sim, HELIOS_TOWER, false);
    const info = sim.storyAction();
    expect(info?.id).toBe("info");
    expect(info?.actionText).toMatch(/needs 10e|solar/i);

    sim.state.energy = 40;
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.stagesBuilt).toBe(1);
  });
});
