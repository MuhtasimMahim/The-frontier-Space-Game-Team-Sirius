/**
 * Kid-friendly Mission Coach (ages ~7–12): goal / do-this / why for each beat.
 * Pure helpers — HUD only; keeps adult MISSION_TEXTS for accessibility elsewhere.
 */
import { CONFIG } from "./config";
import { remainingStarterPanels } from "./rules";
import { DOCK, EARTH_DIRECTION } from "./sites";
import {
  STORY,
  STORY_CHAPTERS,
  antennaSignal,
  currentStep,
  describeStep,
  isStoryChapter,
  type StoryChapterDef,
} from "./storyline";
import type { GameState, MissionStage } from "./simulation";

export interface CoachCard {
  goal: string;
  doThis: string;
  why: string;
  accent?: string;
}

const CH1: Record<MissionStage, CoachCard | null> = {
  orient: {
    goal: "Wake up Camp Sirius",
    doThis: "Walk to the glowing ring by the lander. Press E.",
    why: "Your suit radar needs a fix so you can find ice in the dark.",
  },
  panels: {
    goal: "Make electricity",
    doThis: "Walk west (left of the lander) to the shiny solar panels. Hold E three times.",
    why: "No power means no water machine and no warm home.",
  },
  align_panels: {
    goal: "Catch more sunlight",
    doThis: "Hold E at the Sun-Tracker console near the panels.",
    why: "At the South Pole the Sun stays low. Tilting panels gives +30% power.",
  },
  board_rover: {
    goal: "Start your ice trip",
    doThis: "Walk to the Lunar Rover and press E to climb in.",
    why: "The rover is faster and keeps your suit oxygen topped up.",
  },
  find_ice: {
    goal: "Collect moon ice",
    doThis: "Drive to the cyan radar blip. Hold E at the crater.",
    why: "Ice becomes water for drinking, cooling, and rocket fuel ideas.",
  },
  unload: {
    goal: "Turn ice into water",
    doThis: "Drive to the H dock by base. Press E at the tank. Keep about 60 Energy for the house!",
    why: "Refining uses a little power. You need 20 Water and 60 Energy before Habitat A.",
  },
  build_A: {
    goal: "Build Habitat A",
    doThis: "At the Habitat pad (east of camp), press E — costs 60 Energy and 20 Water.",
    why: "A pressurized home lets your crew rest and refill suit oxygen.",
  },
  enter_airlock: {
    goal: "Step inside safely",
    doThis: "Press E at the Habitat door, wait for the cycle, then walk in.",
    why: "The airlock keeps moon dust out and air in — like a space porch.",
  },
  build_B: {
    goal: "Grow food",
    doThis: "Start Farm B at its pad when you have enough Energy and Water.",
    why: "Crews eat every day — farms keep the mission going.",
  },
  build_C: {
    goal: "Open the science lab",
    doThis: "Build Research Lab C when Habitat and Farm are ready.",
    why: "Labs help us learn how to live on the Moon for real.",
  },
  story: null,
  done: {
    goal: "Camp Sirius is alive!",
    doThis: "Celebrate — then keep exploring the lunar network.",
    why: "You proved a polar camp can make power, water, and a safe home.",
  },
};

const STORY_WHY: Record<string, string> = {
  h_survey: "Survey masts show where sunlight is strongest before you build the tower.",
  h_tower: "A tall tower catches polar sun that flat ground panels miss.",
  h_packs: "Energy packs let other camps share power without long cables.",
  h_launch: "The hopper flies packs to friends who need electricity.",
  r_climb: "High ground sees Earth better for radio talk.",
  r_antenna: "Without an antenna, Mission Control can’t warn you about storms.",
  r_aim: "Aiming at Earth locks a clear radio path home.",
  r_relay: "Relays pass storm warnings to every camp faster.",
  r_storm: "Solar storms can fry power and drain suit oxygen outside.",
  z_survey: "Shadowed craters never see the Sun — ice can hide there.",
  z_radar: "Ground radar finds ice your eyes can’t see in the dark.",
  z_upgrade: "Cold shadows freeze wheels — upgrades keep the rover going.",
  z_ice: "New ice keeps water flowing for every camp.",
  z_refine: "Refined water keeps the crew and farms alive.",
  z_launch: "Sharing cargo proves the four camps work as one team.",
};

function packsDoThis(state: GameState): string {
  const s = state.story;
  if (s.flareTimer > 0) {
    return "Solar flare! Wait a few seconds — tower charging is slower, then keep hauling.";
  }
  if (s.packsCarried > 0) {
    return "Drive the rover to the Cargo Hopper pad (follow the beacon) and press E to unload.";
  }
  if (s.packsLoaded >= STORY.PACK_TOTAL) {
    return "All packs are on the hopper — walk to the launch console next.";
  }
  const ready = Math.max(0, s.packsMade - s.packsCarried - s.packsLoaded);
  if (ready > 0) {
    return state.player.inRover
      ? "At the Solar Tower, press E to load packs (2 at a time)."
      : "Board the rover (E), drive to the Solar Tower, then press E to load packs.";
  }
  return "Wait by the Solar Tower — a new energy pack charges every few seconds.";
}

function aimDoThis(state: GameState): string {
  if (state.player.inRover) {
    return "Press Space to step out at the Summit Pad, then press E on the Main Antenna to aim.";
  }
  if (!state.story.aiming) {
    return "Press E at the Main Antenna to start aiming at Earth.";
  }
  const e = EARTH_DIRECTION.malapert;
  const sig = antennaSignal(state.story.aimYaw, state.story.aimPitch, e.yaw, e.pitch);
  if (sig >= STORY.AIM_LOCK_SIGNAL) {
    return `Signal ${sig}% — Hold E now to lock the Earth link!`;
  }
  return `Signal ${sig}%. Steer with A/D (turn) and W/S (tilt) toward blue Earth until 90%+.`;
}

function shelterDoThis(state: GameState): string {
  const s = state.story;
  const countdown = Math.max(0, Math.ceil(s.stormCountdown));
  if (state.player.inRover) {
    return countdown > 0
      ? `Storm in ${countdown}s! Press Space, run to Habitat A's golden door, press E.`
      : "Storm active! Press Space, get to Habitat A's door, press E, and stand inside.";
  }
  if (state.player.insideAirlock) {
    return s.stormTimer > 0
      ? `Safe inside! Stay put — storm ends in ~${Math.ceil(s.stormTimer)}s.`
      : "Stay in the open doorway — the storm is almost here. Do not leave.";
  }
  if (state.airlock.opening > 0) {
    return "Airlock cycling — wait a few seconds, then stand in the open doorway.";
  }
  if (state.airlock.open) {
    return "Door is open — walk into the Habitat doorway and stay there until the storm ends.";
  }
  return countdown > 0
    ? `Storm in ${countdown}s! At Habitat A's golden door, press E to open the airlock.`
    : "Storm active! Press E at Habitat A's golden door, wait for the cycle, stand inside.";
}

function harvestDoThis(state: GameState): string {
  if (!state.story.roverUpgraded) {
    return "Fit lights & heaters at the Upgrade Bay first — the crater is too dark and cold.";
  }
  if (!state.player.inRover) {
    return "Board the rover (E) and stay inside — suit oxygen will not last in the dark crater.";
  }
  const left = state.iceSites.filter((i) => i.deposit > 0).length;
  if (left <= 0) {
    return "All ice collected — drive back to the H dock to refine.";
  }
  if (state.rover.waterTank >= CONFIG.ROVER.tankMax - 0.01) {
    return "Rover tank is full — drive to the H dock and press E to refine, then come back for more ice.";
  }
  return `Follow the beacon into the dark crater. Hold E at each cyan ice site (${left} left). Stay in the rover!`;
}

function refineDoThis(state: GameState): string {
  if (state.rover.waterTank <= 0) {
    return "Tank is empty — if the hopper is ready, walk to the Cargo Hopper console next.";
  }
  if (!state.player.inRover) {
    return "Board the rover (E) with the ice cargo, drive onto the H dock, then press E to refine.";
  }
  const atDock = Math.hypot(state.rover.x - DOCK.x, state.rover.z - DOCK.z) < 16;
  if (!atDock) {
    return "Drive the rover back to the glowing H dock at camp, then press E to refine ice into water.";
  }
  return "Parked at the dock — press E to refine your ice into water for the network.";
}

function storyCoach(def: StoryChapterDef, state: GameState): CoachCard {
  const step = currentStep(def, state.story);
  const line = describeStep(def, state.story, state);
  const tip = step?.tip;
  const why =
    (step && STORY_WHY[step.id]) ||
    tip ||
    def.scienceNote.slice(0, 120) ||
    "Each step helps the lunar network survive together.";

  let doThis = tip && tip.length < 110 ? tip : line.text;
  if (step?.kind === "packs") doThis = packsDoThis(state);
  if (step?.id === "h_survey" && !state.player.inRover) {
    doThis =
      "Press E at the docked rover to board, then drive to each glowing survey mast and Hold E.";
  }
  if (step?.id === "h_survey" && state.player.inRover) {
    doThis = "Follow the beacon to each glowing survey mast and Hold E to take a light reading.";
  }
  if (step?.id === "h_launch") {
    doThis = "Press Space to leave the rover if needed, walk to the Cargo Hopper console, Hold E.";
  }
  if (step?.id === "h_tower" && state.player.inRover) {
    doThis = "Press Space to step out on Helios Knoll, then Hold E to build each tower section.";
  }
  if (step?.id === "h_tower" && !state.player.inRover) {
    doThis =
      "On Helios Knoll, Hold E three times to build Foundation, Lattice, then Solar Wings (10E each).";
  }
  // Chapter 3 — Camp Relay
  if (step?.id === "r_climb") {
    doThis = state.player.inRover
      ? "Follow the beacon up Malapert Massif to the glowing Summit Pad (steady climb)."
      : "Press E to board the rover — walking the massif will empty your suit oxygen.";
  }
  if (step?.id === "r_antenna") {
    doThis = state.player.inRover
      ? "Press Space to step out on the Summit Pad, then Hold E to build each antenna section (15E)."
      : "On the Summit Pad, Hold E twice: Antenna Mount, then Dish & Feed (15E each).";
  }
  if (step?.id === "r_aim") doThis = aimDoThis(state);
  if (step?.id === "r_relay") {
    doThis = state.player.inRover
      ? "Drive the beacon downhill to the glowing Relay pad by camp, then Press Space and Hold E."
      : "At the Relay Station pad beside Habitat A, Hold E to connect the relay (20E).";
  }
  if (step?.id === "r_storm") doThis = shelterDoThis(state);

  // Chapter 4 — Camp Horizon
  if (step?.id === "z_survey") {
    doThis = state.player.inRover
      ? "Follow the beacon to the Rim Overlook, Press Space, then Hold E to build (15E)."
      : "Board the rover (E) or walk the beacon to the Rim Overlook, then Hold E on foot (15E).";
  }
  if (step?.id === "z_radar") {
    doThis = state.player.inRover
      ? "Follow the beacon to the Ground Radar pad, Press Space, then Hold E to deploy (20E)."
      : "At the Ground Radar pad, Hold E to scan for buried ice (20E).";
  }
  if (step?.id === "z_upgrade") {
    doThis = state.player.inRover
      ? "Drive onto the glowing Upgrade Bay near camp and Hold E for lights & heaters (20E)."
      : "Board the rover (E), drive onto the Upgrade Bay, then Hold E — you must upgrade from the driver's seat.";
  }
  if (step?.id === "z_ice") doThis = harvestDoThis(state);
  if (step?.id === "z_refine") doThis = refineDoThis(state);
  if (step?.id === "z_launch") {
    doThis =
      "Press Space to leave the rover if needed, walk to the Cargo Hopper console, Hold E to launch water.";
  }

  if (state.story.launchTimer >= 0) {
    return {
      goal: "Hopper away!",
      doThis: `Watch the cargo hopper climb toward ${def.launchTarget}.`,
      why: STORY_WHY[step?.id ?? ""] || why,
      accent: def.accent,
    };
  }

  return {
    goal: line.title,
    doThis,
    why,
    accent: def.accent,
  };
}

function criticalOverride(state: GameState): CoachCard | null {
  if (state.rover.damage >= CONFIG.ROVER.maxDamage) {
    return {
      goal: "Fix the rover",
      doThis: "Walk beside it and Hold R (needs 10 Energy).",
      why: "A broken rover can’t bring ice home.",
    };
  }
  if (state.rover.battery <= 0 && state.dockState === "empty" && !state.player.inRover) {
    return {
      goal: "Recall the rover",
      doThis: "Press E at the Recovery Console near base.",
      why: "Empty batteries leave the rover stuck on the Moon.",
    };
  }
  // Don't steal Chapter 2–4 story coaching just because the rover is parked on the dock
  const storyBusy = isStoryChapter(state.missionMode) && state.stage === "story";
  const batteryCritical = state.rover.battery < state.rover.batteryMax * 0.2;
  if (
    !storyBusy &&
    state.player.inRover &&
    state.dockState === "docked" &&
    state.rover.battery < state.rover.batteryMax - 0.5
  ) {
    return {
      goal: "Charge the rover",
      doThis: "Press Space to exit, or stop moving on the dock so it can charge.",
      why: "The dock fills the battery from camp power while you are parked.",
    };
  }
  if (storyBusy && batteryCritical && state.dockState !== "empty") {
    return {
      goal: "Battery almost empty",
      doThis: "Drive back to the H dock and stop (or Space to exit) to recharge.",
      why: "Far survey masts and pack runs use a lot of rover power.",
    };
  }
  if (state.shortageDays > 0 && state.shortageResource) {
    return {
      goal: `Save the ${state.shortageResource}!`,
      doThis: "Gather ice, grow food, or pause Farm B to stop the drain.",
      why: "Empty supplies for too many days ends the mission.",
    };
  }
  return null;
}

/** Returns the Mission Coach card for the current beat, or null if none. */
export function coachForState(state: GameState): CoachCard | null {
  if (state.phase === "won" && state.stage === "done") {
    if (isStoryChapter(state.missionMode)) {
      const def = STORY_CHAPTERS[state.missionMode];
      return {
        goal: def.winTitle,
        doThis: "You did it! Continue to the next chapter when ready.",
        why: def.winText,
        accent: def.accent,
      };
    }
    return CH1.done;
  }
  if (state.phase !== "playing") return null;

  const critical = criticalOverride(state);
  if (critical) return critical;

  if (isStoryChapter(state.missionMode)) {
    return storyCoach(STORY_CHAPTERS[state.missionMode], state);
  }

  if (state.missionMode === "chapter1" && !state.chapter1Completed) {
    let card = CH1[state.stage] ?? null;
    if (state.stage === "panels") {
      const needed = remainingStarterPanels(state.panelsInstalled);
      card = {
        goal: "Make electricity",
        doThis:
          needed > 0
            ? `Walk west to the solar field. Hold E — deploy ${needed} more panel${needed === 1 ? "" : "s"}.`
            : "Panels ready! Find the Sun-Tracker next.",
        why: "No power means no water machine and no warm home.",
      };
    }
    return card;
  }

  // Full sandbox — light guidance from stage
  return CH1[state.stage] ?? {
    goal: "Explore the lunar network",
    doThis: "Watch the top objective. Press E near glowing pads and beacons.",
    why: "Four camps need power, water, food, and Earth talk to win together.",
  };
}
