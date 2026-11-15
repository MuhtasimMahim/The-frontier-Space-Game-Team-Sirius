/**
 * New-user Chapter 3 (Camp Relay) acceptance: Solo enter → climb → antenna →
 * aim → relay → shelter → win, with Mission Coach at every beat.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { coachForState } from "@/frontier/game/coach";
import { loadCheckpointFromStorage } from "@/frontier/game/checkpoint";
import { EARTH_DIRECTION, HAB_DOOR } from "@/frontier/game/sites";
import {
  MALAPERT_ANTENNA,
  RELAY_STATION,
  STORY,
  STORY_CHAPTERS,
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

describe("New-user Chapter 3 (Camp Relay) flow", () => {
  beforeEach(() => localStorage.clear());

  it("completes Solo → climb → antenna → aim → relay → shelter with coaching", () => {
    const sim = new SimulationManager(3);
    const def = STORY_CHAPTERS.chapter3;

    sim.openChapterSelect("solo");
    sim.enterChapter("chapter3");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.missionMode).toBe("chapter3");
    expect(sim.state.selectedSite.name).toMatch(/Malapert/i);
    expect(sim.state.energy).toBe(def.start.energy);
    expect(sim.state.modules.A.status).toBe("active");
    expect(sim.state.rover.battery).toBe(sim.state.rover.batteryMax);

    sim.state.phase = "playing";
    sim.state.menuOpen = false;
    sim.startLoop();
    sim.pauseLoop();

    expect(sim.state.stage).toBe("story");
    expect(sim.state.story.stepIndex).toBe(0);
    expect(expectCoach(sim, /climb|massif/i).doThis).toMatch(/board|rover/i);

    // Dock charge tip must not steal climb coaching
    sim.state.player.inRover = true;
    sim.state.dockState = "docked";
    sim.state.rover.battery = sim.state.rover.batteryMax - 1;
    expect(expectCoach(sim, /climb|massif/i).doThis).toMatch(/beacon|summit|climb/i);

    // Reach summit (reach step advances on step)
    standAt(sim, MALAPERT_ANTENNA, true);
    sim.step(0.1);
    expect(sim.state.story.stepIndex).toBe(1);
    expect(expectCoach(sim, /antenna|build/i).doThis).toMatch(/space|step out/i);

    // Must step out to build
    standAt(sim, MALAPERT_ANTENNA, true);
    expect(sim.storyAction()?.id).toBe("info");
    standAt(sim, MALAPERT_ANTENNA, false);
    expect(expectCoach(sim, /antenna|build/i).doThis).toMatch(/hold e/i);
    expect(act(sim).id).toBe("build");
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.built).toEqual(["antenna_1", "antenna_2"]);
    expect(sim.state.story.stepIndex).toBe(2);

    // Aim: rover shows step-out; on foot starts aim; coach tracks signal
    standAt(sim, MALAPERT_ANTENNA, true);
    const aimInfo = sim.storyAction();
    expect(aimInfo?.id).toBe("info");
    expect(aimInfo?.actionText).toMatch(/step out/i);
    standAt(sim, MALAPERT_ANTENNA, false);
    expect(expectCoach(sim, /aim|earth/i).doThis).toMatch(/press e/i);
    expect(act(sim).id).toBe("start_aim");
    expect(sim.state.story.aiming).toBe(true);
    expect(expectCoach(sim, /aim|earth/i).doThis).toMatch(/signal|steer|a\/d/i);

    // Lock requires Earth alignment
    sim.lockAntenna();
    expect(sim.state.story.linkLocked).toBe(false);
    const e = EARTH_DIRECTION.malapert;
    sim.adjustAim(e.yaw - sim.state.story.aimYaw, e.pitch - sim.state.story.aimPitch);
    expect(sim.aimSignal()).toBeGreaterThanOrEqual(STORY.AIM_LOCK_SIGNAL);
    expect(expectCoach(sim, /aim|earth/i).doThis).toMatch(/hold e|lock/i);
    sim.lockAntenna();
    expect(sim.state.story.linkLocked).toBe(true);
    expect(sim.state.story.stepIndex).toBe(3);
    expect(expectCoach(sim, /relay|connect/i).doThis).toMatch(/rover|beacon|relay|hold e/i);

    // Relay at camp
    standAt(sim, RELAY_STATION, true);
    expect(sim.storyAction()?.id).toBe("info");
    standAt(sim, RELAY_STATION, false);
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.stepIndex).toBe(4);
    expect(sim.state.eventBanner?.phase).toBe("warn");
    expect(sim.state.story.stormCountdown).toBe(STORY.STORM_WARNING_SECONDS);
    expect(expectCoach(sim, /shelter|storm/i).doThis).toMatch(/airlock|habitat|door/i);

    // Shelter path: exit rover → open airlock → stand in doorway through storm
    standAt(sim, HAB_DOOR, true);
    expect(expectCoach(sim, /shelter|storm/i).doThis).toMatch(/space|exit/i);
    standAt(sim, HAB_DOOR, false);
    sim.openAirlock();
    // Cycle the door
    run(sim, 7);
    expect(sim.state.airlock.open).toBe(true);
    // Stay at door so insideAirlock is true while storm runs
    standAt(sim, HAB_DOOR, false);
    run(sim, STORY.STORM_WARNING_SECONDS + STORY.STORM_SECONDS + 2);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.story.stormDose).toBe(0);
    expect(loadCampaign()).toContain("chapter3");
    expect(loadCheckpointFromStorage()).toBeNull();
    expectCoach(sim, /relay|online/i);
  });

  it("coaches storm shelter while the airlock is closed vs open vs inside", () => {
    const sim = new SimulationManager(3);
    sim.openStoryBriefing("chapter3");
    sim.state.phase = "playing";
    sim.state.story.stepIndex = 4;
    sim.state.story.stormCountdown = 30;
    sim.state.story.built = ["antenna_1", "antenna_2", "earth_link", "relay"];
    sim.state.modules.A.status = "active";

    standAt(sim, HAB_DOOR, false);
    sim.state.airlock.open = false;
    expect(expectCoach(sim, /shelter|storm/i).doThis).toMatch(/press e|open/i);

    sim.state.airlock.open = true;
    sim.state.player.insideAirlock = false;
    expect(expectCoach(sim, /shelter|storm/i).doThis).toMatch(/walk|doorway|door/i);

    sim.state.player.insideAirlock = true;
    sim.state.story.stormCountdown = 0;
    sim.state.story.stormTimer = 12;
    expect(expectCoach(sim, /shelter|storm/i).doThis).toMatch(/stay|safe|inside/i);
  });

  it("refuses antenna build when energy is too low", () => {
    const sim = new SimulationManager(3);
    sim.openStoryBriefing("chapter3");
    sim.state.phase = "playing";
    sim.state.story.stepIndex = 1;
    sim.state.energy = 10;
    standAt(sim, MALAPERT_ANTENNA, false);
    const info = sim.storyAction();
    expect(info?.id).toBe("info");
    expect(info?.actionText).toMatch(/needs 15e|solar/i);
  });
});
