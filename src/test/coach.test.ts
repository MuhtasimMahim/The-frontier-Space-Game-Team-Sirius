import { describe, expect, it } from "vitest";
import { coachForState } from "@/frontier/game/coach";
import { SimulationManager } from "@/frontier/game/simulation";

describe("Mission Coach", () => {
  it("guides Chapter 1 orientation with goal / do / why", () => {
    const sim = new SimulationManager(1);
    sim.openChapter1Briefing();
    sim.state.phase = "playing";
    sim.state.stage = "orient";
    const card = coachForState(sim.state);
    expect(card?.goal.toLowerCase()).toContain("sirius");
    expect(card?.doThis.toLowerCase()).toMatch(/e|glow/);
    expect(card?.why.length).toBeGreaterThan(10);
  });

  it("warns when rover needs charging on the dock", () => {
    const sim = new SimulationManager(2);
    sim.state.phase = "playing";
    sim.state.missionMode = "chapter1";
    sim.state.player.inRover = true;
    sim.state.dockState = "docked";
    sim.state.rover.battery = 10;
    sim.state.rover.batteryMax = 50;
    const card = coachForState(sim.state);
    expect(card?.goal.toLowerCase()).toContain("charge");
  });

  it("keeps Chapter 2 survey coach even when docked with a partial battery", () => {
    const sim = new SimulationManager(11);
    sim.openStoryBriefing("chapter2");
    sim.state.phase = "playing";
    sim.state.player.inRover = true;
    sim.state.dockState = "docked";
    sim.state.rover.battery = sim.state.rover.batteryMax - 1;
    const card = coachForState(sim.state);
    expect(card?.goal.toLowerCase()).toMatch(/survey|sunlight/);
    expect(card?.doThis.toLowerCase()).not.toMatch(/^charge/);
  });
});
