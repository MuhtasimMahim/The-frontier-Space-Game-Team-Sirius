import { beforeEach, describe, expect, it } from "vitest";
import { loadCheckpointFromStorage } from "@/frontier/game/checkpoint";
import { CONFIG } from "@/frontier/game/config";
import { RULES } from "@/frontier/game/rules";
import {
  DOCK,
  EARTH_DIRECTION,
  HAB_DOOR,
  makeSiteTerrain,
  maxRouteSlope,
} from "@/frontier/game/sites";
import {
  CABEUS_ICE,
  CARGO_CONSOLE,
  CARGO_PAD,
  HELIOS_TOWER,
  MALAPERT_ANTENNA,
  STORY,
  STORY_CHAPTERS,
  STORY_CHAPTER_IDS,
  UPGRADE_BAY,
  antennaSignal,
  chapterRoute,
  describeStep,
  freshStory,
  loadCampaign,
  nextChapterId,
  recommendedChapter,
  roleSeat,
  storyActionAt,
  type StoryChapterId,
} from "@/frontier/game/storyline";
import { BASES } from "@/frontier/game/network";
import { HIDDEN_ICE, SimulationManager } from "@/frontier/game/simulation";

function startChapter(id: StoryChapterId, seed = 3) {
  const sim = new SimulationManager(seed);
  sim.openStoryBriefing(id);
  sim.state.phase = "playing";
  return sim;
}

function standAt(sim: SimulationManager, p: { x: number; z: number }, inRover = false) {
  sim.state.player.inRover = inRover;
  sim.state.player.x = p.x;
  sim.state.player.z = p.z;
  sim.state.rover.x = inRover ? p.x : sim.state.rover.x;
  sim.state.rover.z = inRover ? p.z : sim.state.rover.z;
}

function act(sim: SimulationManager) {
  const a = sim.storyAction();
  expect(a, "expected a story prompt here").not.toBeNull();
  expect(a!.id).not.toBe("info");
  sim.performStoryAction(a!);
  return a!;
}

/** Advance in small steps so per-tick story logic sees every second. */
function run(sim: SimulationManager, seconds: number) {
  for (let t = 0; t < seconds && sim.state.phase === "playing"; t += 0.25) sim.step(0.25);
}

describe("Phase 3 — four-site storyline", () => {
  beforeEach(() => localStorage.clear());

  it("keeps every chapter's drive routes within rover climbing limits", () => {
    for (const id of STORY_CHAPTER_IDS) {
      const def = STORY_CHAPTERS[id];
      const terrain = makeSiteTerrain(def.siteKey);
      const route = chapterRoute(def);
      for (let i = 0; i < route.length - 1; i++) {
        const slope = maxRouteSlope(terrain.height, route[i]!, route[i + 1]!);
        expect(slope, `${id} leg ${i}`).toBeLessThan(0.55);
      }
      for (const p of route) {
        expect(Math.hypot(p.x, p.z), `${id} point inside playable rim`).toBeLessThan(380);
      }
    }
  });

  it("keeps every Camp Sirius / sandbox ice site and base drivable inside the rim", () => {
    const terrain = makeSiteTerrain("nobile", { iceCraters: [...CONFIG.ICE_SITES, ...HIDDEN_ICE] });
    for (const p of [...CONFIG.ICE_SITES, ...HIDDEN_ICE, ...BASES]) {
      const label = "id" in p ? `site ${p.id}` : String(p);
      expect(Math.hypot(p.x, p.z), `${label} inside playable rim`).toBeLessThan(380);
      expect(maxRouteSlope(terrain.height, DOCK, p), `${label} drive from dock`).toBeLessThan(0.55);
    }
  });

  it("keeps camp cores flat and puts Cabeus ice in deep permanent shadow", () => {
    // Module pads (corners included), lander, and dock are built at y = 0 at every site
    const padCorners = [
      [20, -10],
      [35, 5],
      [25, 25],
    ].flatMap(([x, z]) =>
      [-8.5, 8.5].flatMap((dx) => [-8.5, 8.5].map((dz) => ({ x: x! + dx, z: z! + dz }))),
    );
    const footprint = [{ x: 0, z: 0 }, { x: 0, z: -18 }, DOCK, ...padCorners];
    const terrains = [
      makeSiteTerrain("nobile", { iceCraters: [...CONFIG.ICE_SITES, ...HIDDEN_ICE] }),
      ...STORY_CHAPTER_IDS.map((id) => makeSiteTerrain(STORY_CHAPTERS[id].siteKey)),
    ];
    for (const t of terrains)
      for (const p of footprint)
        expect(Math.abs(t.height(p.x, p.z)), `${t.key} ground at ${p.x},${p.z}`).toBeLessThan(0.01);
    const cabeus = makeSiteTerrain("cabeus");
    for (const ice of CABEUS_ICE) {
      expect(cabeus.shadow(ice.x, ice.z)).toBe(1);
      expect(cabeus.height(ice.x, ice.z)).toBeLessThan(-30);
    }
    expect(cabeus.shadow(0, 0)).toBe(0);
    const malapert = makeSiteTerrain("malapert");
    expect(malapert.height(MALAPERT_ANTENNA.x, MALAPERT_ANTENNA.z)).toBeGreaterThan(60);
  });

  it("scores antenna signal by pointing error toward Earth", () => {
    const e = EARTH_DIRECTION.malapert;
    expect(antennaSignal(e.yaw, e.pitch, e.yaw, e.pitch)).toBe(100);
    expect(antennaSignal(e.yaw + 0.05, e.pitch, e.yaw, e.pitch)).toBeGreaterThanOrEqual(90);
    expect(antennaSignal(e.yaw + 0.2, e.pitch, e.yaw, e.pitch)).toBeLessThan(STORY.AIM_LOCK_SIGNAL);
    expect(antennaSignal(e.yaw + Math.PI, e.pitch, e.yaw, e.pitch)).toBe(0);
  });

  it("orders the campaign, recommends the next chapter, and deals soft crew roles", () => {
    expect(nextChapterId("chapter1")).toBe("chapter2");
    expect(nextChapterId("chapter4")).toBeNull();
    expect(recommendedChapter(["chapter1", "chapter2"])).toBe("chapter3");
    expect(recommendedChapter(["chapter1", "chapter2", "chapter3", "chapter4"])).toBeNull();
    const def = STORY_CHAPTERS.chapter2;
    expect(roleSeat(def, "Surveyor", 2)).toBe(0);
    expect(roleSeat(def, "Engineer", 2)).toBe(1);
    expect(roleSeat(def, "Rover Driver", 2)).toBe(0);
    expect(roleSeat(def, "Flight Controller", 4)).toBe(3);
  });

  it("asks drivers to step out for on-foot builds and waits for energy", () => {
    const def = STORY_CHAPTERS.chapter2;
    const story = { ...freshStory(), stepIndex: 1 };
    const base = { px: 0, pz: 0, rx: 0, rz: 0, inRover: false, energy: 100, iceSites: [] };
    const fromRover = storyActionAt(def, story, {
      ...base,
      rx: HELIOS_TOWER.x,
      rz: HELIOS_TOWER.z,
      inRover: true,
    });
    expect(fromRover?.id).toBe("info");
    expect(fromRover?.actionText).toMatch(/step out/i);
    const broke = storyActionAt(def, story, {
      ...base,
      px: HELIOS_TOWER.x,
      pz: HELIOS_TOWER.z,
      energy: 2,
    });
    expect(broke?.id).toBe("info");
    const ok = storyActionAt(def, story, { ...base, px: HELIOS_TOWER.x, pz: HELIOS_TOWER.z });
    expect(ok?.id).toBe("build");
    expect(ok?.hold).toBe(3);
  });

  it("plays Chapter 2 (Camp Helios) from hopper landing to cargo launch", () => {
    const sim = startChapter("chapter2");
    const def = STORY_CHAPTERS.chapter2;
    expect(sim.state.missionMode).toBe("chapter2");
    expect(sim.state.stage).toBe("story");
    expect(sim.state.selectedSite.name).toBe("Mons Mouton");
    expect(sim.state.modules.A.status).toBe("active");

    // Survey all three masts from the rover
    for (const mast of def.steps[0]!.targets!) {
      standAt(sim, mast, true);
      expect(act(sim).id).toBe("survey");
    }
    expect(sim.state.story.stepIndex).toBe(1);

    // Build three tower sections on foot
    standAt(sim, HELIOS_TOWER);
    for (let i = 0; i < 3; i++) expect(act(sim).id).toBe("build");
    expect(sim.state.story.built).toEqual(["tower_1", "tower_2", "tower_3"]);
    expect(sim.state.story.stepIndex).toBe(2);

    // Haul 4 packs in two rover trips; the first unload triggers a short solar flare
    for (let trip = 0; trip < 2; trip++) {
      standAt(sim, HELIOS_TOWER, true);
      run(sim, STORY.PACK_SECONDS * 2 * 2 + 1);
      expect(act(sim).id).toBe("load_packs");
      expect(sim.state.story.packsCarried).toBe(2);
      standAt(sim, CARGO_PAD, true);
      expect(act(sim).id).toBe("unload_packs");
      if (trip === 0) {
        expect(sim.state.activeStorm).toBe(true);
        run(sim, STORY.FLARE_SECONDS + 1);
        expect(sim.state.activeStorm).toBe(false);
      }
    }
    expect(sim.state.story.packsLoaded).toBe(4);
    expect(sim.state.story.stepIndex).toBe(3);

    // Launch on foot, then the hopper climbs for a few seconds before victory
    standAt(sim, CARGO_CONSOLE);
    expect(act(sim).id).toBe("launch");
    expect(describeStep(def, sim.state.story, sim.state).title).toBe("Hopper away!");
    run(sim, STORY.LAUNCH_SECONDS + 1);
    expect(sim.state.phase).toBe("won");
    expect(loadCampaign()).toContain("chapter2");
    expect(loadCheckpointFromStorage()).toBeNull();
  });

  it("plays Chapter 3 (Camp Relay): climb, aim at Earth, relay, and storm shelter", () => {
    const sim = startChapter("chapter3");
    standAt(sim, MALAPERT_ANTENNA, true);
    sim.step(0.1);
    expect(sim.state.story.stepIndex).toBe(1);

    standAt(sim, MALAPERT_ANTENNA);
    act(sim);
    act(sim);
    expect(sim.state.story.built).toEqual(["antenna_1", "antenna_2"]);

    expect(act(sim).id).toBe("start_aim");
    expect(sim.state.story.aiming).toBe(true);
    sim.lockAntenna();
    expect(sim.state.story.linkLocked).toBe(false);
    const e = EARTH_DIRECTION.malapert;
    sim.adjustAim(e.yaw - sim.state.story.aimYaw, e.pitch - sim.state.story.aimPitch);
    expect(sim.aimSignal()).toBeGreaterThanOrEqual(STORY.AIM_LOCK_SIGNAL);
    sim.lockAntenna();
    expect(sim.state.story.linkLocked).toBe(true);
    expect(sim.state.story.stepIndex).toBe(3);

    standAt(sim, STORY_CHAPTERS.chapter3.steps[3]!.target!);
    act(sim);
    expect(sim.state.story.stepIndex).toBe(4);
    expect(sim.state.eventBanner?.phase).toBe("warn");

    // Mid-storm-warning checkpoint restores the chapter and countdown
    expect(sim.saveCheckpoint(false)).toBe(true);
    const resumed = new SimulationManager(1);
    expect(resumed.resumeCheckpoint()).toBe(true);
    expect(resumed.state.missionMode).toBe("chapter3");
    expect(resumed.state.stage).toBe("story");
    expect(resumed.state.story.stepIndex).toBe(4);
    expect(resumed.state.story.built).toContain("relay");
    resumed.pauseLoop();

    standAt(sim, HAB_DOOR);
    sim.openAirlock();
    run(sim, STORY.STORM_WARNING_SECONDS + STORY.STORM_SECONDS + 2);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.story.stormDose).toBe(0);
    expect(loadCampaign()).toContain("chapter3");
  });

  it("still completes Chapter 3 if the storm catches you outside, but records the dose", () => {
    const sim = startChapter("chapter3");
    sim.state.story.stepIndex = 3;
    standAt(sim, STORY_CHAPTERS.chapter3.steps[3]!.target!);
    act(sim);
    standAt(sim, { x: 0, z: 0 }, true);
    run(sim, STORY.STORM_WARNING_SECONDS + STORY.STORM_SECONDS + 2);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.story.stormDose).toBeGreaterThan(STORY.STORM_SECONDS - 1);
  });

  it("plays Chapter 4 (Camp Horizon): radar, rover upgrade, dark-crater ice, refine, launch", () => {
    const sim = startChapter("chapter4");
    const def = STORY_CHAPTERS.chapter4;
    expect(sim.state.iceSites).toHaveLength(0);

    standAt(sim, def.steps[0]!.target!);
    act(sim);
    standAt(sim, def.steps[1]!.target!);
    act(sim);
    expect(sim.state.story.iceRevealed).toBe(true);
    expect(sim.state.iceSites.map((i) => i.id)).toEqual([201, 202, 203]);

    // Harvesting before the upgrade is refused
    standAt(sim, CABEUS_ICE[0]!, true);
    sim.fillIce(201);
    expect(sim.state.rover.waterTank).toBe(0);

    standAt(sim, UPGRADE_BAY, true);
    expect(act(sim).id).toBe("build");
    expect(sim.state.story.roverUpgraded).toBe(true);
    expect(sim.state.rover.batteryMax).toBe(CONFIG.ROVER.batteryMax + STORY.ROVER_UPGRADE_BONUS);

    for (const ice of CABEUS_ICE) {
      standAt(sim, ice, true);
      sim.fillIce(ice.id);
    }
    expect(sim.state.rover.waterTank).toBe(60);
    expect(sim.state.story.stepIndex).toBe(4);

    standAt(sim, DOCK, true);
    const water = sim.state.water;
    sim.unloadWater();
    expect(sim.state.water).toBe(water + 60);
    expect(sim.state.story.stepIndex).toBe(5);

    standAt(sim, CARGO_CONSOLE);
    expect(act(sim).id).toBe("launch");
    run(sim, STORY.LAUNCH_SECONDS + 1);
    expect(sim.state.phase).toBe("won");
    expect(sim.state.seenFacts).toContain("ch4_finale");
    expect(loadCampaign()).toContain("chapter4");
  });

  it("starts each story chapter fresh from chapter select and the next-chapter button", () => {
    const sim = new SimulationManager(4);
    sim.openChapterSelect("crew");
    sim.setCrewSize(3);
    sim.castChapterVote(0, "chapter3");
    sim.startVotedChapter("chapter3");
    expect(sim.state.phase).toBe("briefing");
    expect(sim.state.playMode).toBe("crew");
    expect(sim.state.crewSize).toBe(3);
    expect(sim.state.missionMode).toBe("chapter3");

    sim.state.energy = 3;
    sim.startChapterFromResults("chapter4");
    expect(sim.state.missionMode).toBe("chapter4");
    expect(sim.state.energy).toBe(STORY_CHAPTERS.chapter4.start.energy);
    expect(sim.state.story.stepIndex).toBe(0);
    expect(sim.state.playMode).toBe("crew");
  });

  it("keeps oxygen rescue working at story camps", () => {
    const sim = startChapter("chapter2");
    standAt(sim, { x: 150, z: -150 });
    sim.state.player.oxygen = 0.2;
    sim.step(1);
    expect(sim.state.phase).toBe("playing");
    expect(sim.state.player.x).toBe(HAB_DOOR.x);
    expect(sim.state.player.oxygen).toBe(CONFIG.OXYGEN.max);
    expect(RULES.AIRLOCK_SECONDS).toBeGreaterThan(0);
  });

  it("never starves a story camp, however long the player takes", () => {
    for (const id of ["chapter2", "chapter3", "chapter4"] as const) {
      const sim = startChapter(id);
      standAt(sim, sim.state.rover, true);
      const { water, food } = sim.state;
      run(sim, 1800);
      expect(sim.state.phase).toBe("playing");
      expect(sim.state.day).toBeGreaterThan(CONFIG.TOTAL_DAYS);
      expect(sim.state.water).toBe(water);
      expect(sim.state.food).toBe(food);
      expect(sim.state.shortageDays).toBe(0);
      expect(sim.storyTarget()).not.toBeNull();
    }
  });
});
