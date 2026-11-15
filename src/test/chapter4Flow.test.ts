/**
 * New-user Chapter 4 (Camp Horizon) acceptance: Solo enter → survey → radar →
 * upgrade → harvest → refine → launch → win, with Mission Coach at every beat.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { coachForState } from "@/frontier/game/coach";
import { loadCheckpointFromStorage } from "@/frontier/game/checkpoint";
import { CONFIG } from "@/frontier/game/config";
import { DOCK } from "@/frontier/game/sites";
import {
  CABEUS_ICE,
  CABEUS_OVERLOOK,
  CABEUS_RADAR,
  CARGO_CONSOLE,
  STORY,
  STORY_CHAPTERS,
  UPGRADE_BAY,
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

describe("New-user Chapter 4 (Camp Horizon) flow", () => {
  beforeEach(() => localStorage.clear());

  it("completes Solo → survey → radar → upgrade → ice → refine → launch with coaching", () => {
    const sim = new SimulationManager(12);
    const def = STORY_CHAPTERS.chapter4;

    sim.openChapterSelect("solo");
    sim.enterChapter("chapter4");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter4");
    expect(sim.state.selectedSite.name).toMatch(/Cabeus/i);
    expect(sim.state.energy).toBe(def.start.energy);
    expect(sim.state.modules.A.status).toBe("active");
    expect(sim.state.rover.battery).toBe(sim.state.rover.batteryMax);
    expect(sim.state.iceSites).toHaveLength(0);

    sim.state.phase = "playing";
    sim.state.menuOpen = false;
    sim.startLoop();
    sim.pauseLoop();

    expect(sim.state.stage).toBe("story");
    expect(sim.state.story.stepIndex).toBe(0);
    expect(expectCoach(sim, /survey|station|overlook/i).doThis).toMatch(/rover|beacon|overlook|hold e/i);

    // Survey station — step out required
    standAt(sim, CABEUS_OVERLOOK, true);
    expect(sim.storyAction()?.id).toBe("info");
    standAt(sim, CABEUS_OVERLOOK, false);
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.stepIndex).toBe(1);
    expect(expectCoach(sim, /radar|scan/i).doThis).toMatch(/radar|hold e|beacon/i);

    // Ground radar reveals ice
    standAt(sim, CABEUS_RADAR, false);
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.iceRevealed).toBe(true);
    expect(sim.state.iceSites.map((i) => i.id)).toEqual([201, 202, 203]);
    expect(sim.state.story.stepIndex).toBe(2);
    expect(expectCoach(sim, /upgrade|rover|lights/i).doThis).toMatch(/upgrade|bay|hold e|rover/i);

    // Harvest before upgrade is blocked
    standAt(sim, CABEUS_ICE[0]!, true);
    sim.fillIce(201);
    expect(sim.state.rover.waterTank).toBe(0);
    expect(sim.state.iceSites.find((i) => i.id === 201)!.deposit).toBe(20);

    // Upgrade from the driver's seat
    standAt(sim, UPGRADE_BAY, false);
    expect(sim.storyAction()?.actionText).toMatch(/drive the rover/i);
    standAt(sim, UPGRADE_BAY, true);
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.roverUpgraded).toBe(true);
    expect(sim.state.rover.batteryMax).toBe(CONFIG.ROVER.batteryMax + STORY.ROVER_UPGRADE_BONUS);
    expect(sim.state.rover.battery).toBe(sim.state.rover.batteryMax);
    expect(sim.state.story.stepIndex).toBe(3);
    expect(expectCoach(sim, /harvest|ice|crater/i).doThis).toMatch(/beacon|crater|hold e|rover/i);

    // On foot near ice — coach says board
    standAt(sim, CABEUS_ICE[0]!, false);
    expect(expectCoach(sim, /harvest|ice|crater/i).doThis).toMatch(/board|rover/i);

    // Harvest all three deposits in one tank load (3×20 = 60)
    for (const ice of CABEUS_ICE) {
      standAt(sim, ice, true);
      sim.fillIce(ice.id);
    }
    expect(sim.state.rover.waterTank).toBe(60);
    expect(sim.state.story.stepIndex).toBe(4);
    expect(expectCoach(sim, /refine|water/i).doThis).toMatch(/dock|refine|press e/i);

    // Far from dock — coach says drive back
    standAt(sim, CABEUS_ICE[0]!, true);
    expect(expectCoach(sim, /refine|water/i).doThis).toMatch(/dock|drive/i);

    // Refine at dock
    standAt(sim, DOCK, true);
    expect(expectCoach(sim, /refine|water/i).doThis).toMatch(/press e|refine/i);
    const waterBefore = sim.state.water;
    const energyBefore = sim.state.energy;
    sim.unloadWater();
    expect(sim.state.water).toBe(waterBefore + 60);
    expect(sim.state.energy).toBeLessThan(energyBefore);
    expect(sim.state.rover.waterTank).toBe(0);
    expect(sim.state.story.stepIndex).toBe(5);
    expect(expectCoach(sim, /launch|network|hopper/i).doThis).toMatch(/space|hopper|hold e|console/i);

    // Launch on foot
    standAt(sim, CARGO_CONSOLE, true);
    expect(sim.storyAction()?.id).toBe("info");
    standAt(sim, CARGO_CONSOLE, false);
    expect(act(sim).id).toBe("launch");
    run(sim, STORY.LAUNCH_SECONDS + 1);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.seenFacts).toContain("ch4_finale");
    expect(loadCampaign()).toContain("chapter4");
    expect(loadCheckpointFromStorage()).toBeNull();
    expectCoach(sim, /network|complete|horizon/i);
  });

  it("does not advance refine until the rover tank is empty", () => {
    const sim = new SimulationManager(12);
    sim.openStoryBriefing("chapter4");
    sim.state.phase = "playing";
    sim.state.story.stepIndex = 4;
    sim.state.story.roverUpgraded = true;
    sim.state.rover.waterTank = 40;
    sim.state.energy = 5; // only enough for partial refine (~14W at 0.35E/W)
    standAt(sim, DOCK, true);
    sim.unloadWater();
    expect(sim.state.rover.waterTank).toBeGreaterThan(0);
    expect(sim.state.story.stepIndex).toBe(4);

    sim.state.energy = 100;
    sim.unloadWater();
    expect(sim.state.rover.waterTank).toBe(0);
    expect(sim.state.story.stepIndex).toBe(5);
  });

  it("refuses survey build when energy is too low", () => {
    const sim = new SimulationManager(12);
    sim.openStoryBriefing("chapter4");
    sim.state.phase = "playing";
    sim.state.story.stepIndex = 0;
    sim.state.energy = 10;
    standAt(sim, CABEUS_OVERLOOK, false);
    const info = sim.storyAction();
    expect(info?.id).toBe("info");
    expect(info?.actionText).toMatch(/needs 15e|solar/i);
  });
});
