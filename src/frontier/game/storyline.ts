// Chapters 2–4 story data and step rules (pure TS, no engine code) so every beat is testable.
import type { ChapterId } from "./chapters";
import type { IceSiteDef, LandingSiteDef } from "./config";
import {
  CABEUS_PSR,
  DOCK,
  HAB_DOOR,
  MALAPERT_SUMMIT,
  MOUTON_KNOLL,
  type Point,
  type SiteKey,
} from "./sites";

export type StoryChapterId = "chapter2" | "chapter3" | "chapter4";
export const STORY_CHAPTER_IDS: readonly StoryChapterId[] = ["chapter2", "chapter3", "chapter4"];
export const CAMPAIGN_ORDER: readonly ChapterId[] = [
  "chapter1",
  "chapter2",
  "chapter3",
  "chapter4",
];

export function isStoryChapter(id: string | null | undefined): id is StoryChapterId {
  return id === "chapter2" || id === "chapter3" || id === "chapter4";
}

export const STORY = {
  PACK_SECONDS: 6,
  PACK_TOTAL: 4,
  ROVER_PACK_CAP: 2,
  FLARE_SECONDS: 14,
  STORM_WARNING_SECONDS: 45,
  STORM_SECONDS: 20,
  LAUNCH_SECONDS: 6,
  AIM_LOCK_SIGNAL: 90,
  AIM_LOCK_HOLD: 1.5,
  AIM_FALLOFF_RAD: Math.PI / 3,
  AIM_PITCH_MAX: 1.1,
  ROVER_UPGRADE_BONUS: 30,
};

/** Cargo hopper pad and its launch console, shared by Chapters 2 and 4. */
export const CARGO_PAD: Point = { x: -26, z: 12 };
export const CARGO_CONSOLE: Point = { x: -17, z: 19 };
export const RELAY_STATION: Point = { x: -26, z: 12 };
export const UPGRADE_BAY: Point = { x: 34, z: 24 };

export const MOUTON_MASTS: Point[] = [
  { x: -170, z: -60 },
  { x: 150, z: -150 },
  { x: MOUTON_KNOLL.x, z: MOUTON_KNOLL.z },
];
export const MOUTON_READINGS = [64, 78, 93];
export const HELIOS_TOWER: Point = { x: MOUTON_KNOLL.x, z: MOUTON_KNOLL.z };
export const MALAPERT_ANTENNA: Point = { x: MALAPERT_SUMMIT.x, z: MALAPERT_SUMMIT.z };
export const CABEUS_OVERLOOK: Point = { x: 40, z: 96 };
export const CABEUS_RADAR: Point = { x: -60, z: 84 };

/** Ice the Cabeus ground radar reveals on the shadowed crater floor. */
export const CABEUS_ICE: IceSiteDef[] = [
  {
    id: 201,
    x: CABEUS_PSR.x - 35,
    z: CABEUS_PSR.z - 8,
    deposit: 20,
    maxDeposit: 20,
    difficulty: "hard",
  },
  {
    id: 202,
    x: CABEUS_PSR.x + 30,
    z: CABEUS_PSR.z + 20,
    deposit: 20,
    maxDeposit: 20,
    difficulty: "hard",
  },
  {
    id: 203,
    x: CABEUS_PSR.x + 4,
    z: CABEUS_PSR.z - 38,
    deposit: 20,
    maxDeposit: 20,
    difficulty: "hard",
  },
];

export const STORY_SITES: LandingSiteDef[] = [
  {
    id: 11,
    name: "Mons Mouton",
    sunlight: 0.95,
    iceDistanceLabel: "Far",
    hazardLabel: "Low",
    hazardDesc: "Wide flat plateau with gentle knolls",
    description: "A flat-topped mountain whose high plateau stays sunlit for long stretches.",
    coords: { x: 0.43, y: 0.36 },
    iceDistanceStuds: 400,
    roundTripLabel: "~1m 20s",
  },
  {
    id: 3,
    name: "Malapert Massif",
    sunlight: 0.7,
    iceDistanceLabel: "Close",
    hazardLabel: "Medium",
    hazardDesc: "Long climbing slopes to a high summit",
    description: "A tall massif with a clear line of sight to Earth.",
    coords: { x: 0.276, y: 0.741 },
    iceDistanceStuds: 180,
    roundTripLabel: "~40s",
  },
  {
    id: 12,
    name: "Peak near Cabeus B",
    sunlight: 0.6,
    iceDistanceLabel: "Very Close",
    hazardLabel: "High",
    hazardDesc: "Pitch-dark permanently shadowed crater floor",
    description: "A sunlit rim beside Cabeus, where LCROSS found water ice in 2009.",
    coords: { x: 0.2, y: 0.42 },
    iceDistanceStuds: 270,
    roundTripLabel: "~50s",
  },
];

export type StepKind =
  "survey" | "build" | "reach" | "packs" | "aim" | "shelter" | "harvest" | "refine" | "launch";

export type CrewRole =
  | "Commander"
  | "Surveyor"
  | "Engineer"
  | "Rover Driver"
  | "Comms Officer"
  | "Scientist"
  | "Flight Controller";

export interface StoryStepDef {
  id: string;
  kind: StepKind;
  title: string;
  /** HUD instruction; {done} {total} {ready} {carried} {loaded} {countdown} {storm} are filled in. */
  text: string;
  target?: Point;
  targets?: Point[];
  radius: number;
  hold: number;
  vehicle: "foot" | "rover" | "any";
  objectName: string;
  actionName: string;
  /** Build steps: one entry per hold, each shown in the world once done. */
  stages?: { name: string; structure: string; energy: number }[];
  effect?: "reveal_ice" | "rover_upgrade";
  role: CrewRole;
  voice: string;
  tip?: string;
  factId?: string;
}

export interface StoryChapterDef {
  id: StoryChapterId;
  number: number;
  siteKey: SiteKey;
  siteId: number;
  campName: string;
  siteName: string;
  latitudeLabel: string;
  accent: string;
  badge: string;
  title: string;
  summary: string;
  narrative: string[];
  steps: StoryStepDef[];
  scienceNote: string;
  winTitle: string;
  winText: string;
  hopperFrom: string;
  launchTarget: string;
  landingFact: string;
  start: { energy: number; water: number; food: number; panels: number };
}

export const STORY_CHAPTERS: Record<StoryChapterId, StoryChapterDef> = {
  chapter2: {
    id: "chapter2",
    number: 2,
    siteKey: "mouton",
    siteId: 11,
    campName: "Camp Helios",
    siteName: "Mons Mouton",
    latitudeLabel: "84.6° S · Mons Mouton",
    accent: "#FFD166",
    badge: "CHAPTER 2 · POWER",
    title: "Power at Mons Mouton",
    summary:
      "Hop to Mons Mouton's sunlit plateau, find the brightest spot, raise a Solar Tower, and fly energy packs back to Camp Sirius.",
    narrative: [
      "Camp Sirius is breathing, but every heater, rover, and air scrubber runs on electricity, and Nobile Rim's panels can't keep up.",
      "Mons Mouton is a flat-topped lunar mountain whose high plateau sees the Sun for long stretches. That makes it the network's power station.",
      "Survey the plateau, raise the Solar Tower on the brightest knoll, and fly the first four energy packs home by cargo hopper.",
    ],
    steps: [
      {
        id: "h_survey",
        kind: "survey",
        title: "Survey the sunlight",
        text: "Take a light reading at each glowing survey mast (hold E). {done}/{total} measured.",
        targets: MOUTON_MASTS,
        radius: 12,
        hold: 2,
        vehicle: "any",
        objectName: "Sunlight Survey Mast",
        actionName: "Hold E to Take Light Reading",
        role: "Surveyor",
        voice:
          "Welcome to Camp Helios. Drive out and take light readings at the three survey masts.",
        tip: "The rover is faster than walking and refills your suit oxygen. Survey masts can be read from the driver's seat.",
      },
      {
        id: "h_tower",
        kind: "build",
        title: "Raise the Solar Tower",
        text: "Build the tower on Helios Knoll, the brightest spot: {done}/{total} sections (hold E on foot).",
        target: HELIOS_TOWER,
        radius: 9,
        hold: 3,
        vehicle: "foot",
        objectName: "Helios Knoll · Solar Tower",
        actionName: "Hold E to Build",
        stages: [
          { name: "Foundation", structure: "tower_1", energy: 10 },
          { name: "Lattice Mast", structure: "tower_2", energy: 10 },
          { name: "Solar Wings", structure: "tower_3", energy: 10 },
        ],
        role: "Engineer",
        voice:
          "Helios Knoll gets ninety-three percent sunlight. Step out and raise the Solar Tower there.",
        tip: "At the South Pole the Sun skims the horizon, so a tall tower catches light that flat ground panels miss.",
        factId: "ch2_tower",
      },
      {
        id: "h_packs",
        kind: "packs",
        title: "Haul energy packs",
        text: "Load charged packs at the tower and unload them at the Cargo Hopper. Loaded {loaded}/{total} · rover {carried}/2 · ready {ready}.",
        target: HELIOS_TOWER,
        radius: 14,
        hold: 0,
        vehicle: "rover",
        objectName: "Energy Packs",
        actionName: "Press E",
        role: "Rover Driver",
        voice: "The tower is charging energy packs. Haul them to the cargo hopper, two at a time.",
        tip: "The rover carries 2 packs at a time. The tower charges a new pack every few seconds.",
      },
      {
        id: "h_launch",
        kind: "launch",
        title: "Launch to Camp Sirius",
        text: "Walk to the Cargo Hopper console and hold E to fly the energy packs home.",
        target: CARGO_CONSOLE,
        radius: 4,
        hold: 3,
        vehicle: "foot",
        objectName: "Cargo Hopper Console",
        actionName: "Hold E to Launch to Camp Sirius",
        role: "Flight Controller",
        voice: "All four energy packs are aboard. Walk to the hopper console and launch.",
      },
    ],
    scienceNote:
      "Game vs. Real Moon: the tower charges a pack every few seconds for play. NASA is testing tall vertical solar arrays that unfold 10+ meters high to catch the low polar Sun.",
    winTitle: "Camp Helios Online!",
    winText:
      "The Solar Tower charges energy packs around the clock, and the first cargo hopper is on its way to Camp Sirius. The network has power.",
    hopperFrom: "Camp Sirius",
    launchTarget: "Camp Sirius",
    landingFact: "ch2_mouton",
    start: { energy: 120, water: 200, food: 200, panels: 8 },
  },
  chapter3: {
    id: "chapter3",
    number: 3,
    siteKey: "malapert",
    siteId: 3,
    campName: "Camp Relay",
    siteName: "Malapert Massif",
    latitudeLabel: "86.0° S · Malapert Massif",
    accent: "#8FD3FF",
    badge: "CHAPTER 3 · COMMUNICATIONS",
    title: "Comms at Malapert",
    summary:
      "Climb Malapert Massif, build and aim the Main Antenna at Earth, connect the Relay Station, and shelter from a solar storm.",
    narrative: [
      "Camps hidden behind crater rims can't see Earth, so their radios go quiet.",
      "Malapert Massif rises about 5 km above its surroundings and keeps Earth in view. A dish on its summit can relay every camp's signal home.",
      "Climb the massif, aim the Main Antenna, connect the Relay Station, and stay alert: NASA's DONKI space-weather alerts warn of solar storms.",
    ],
    steps: [
      {
        id: "r_climb",
        kind: "reach",
        title: "Climb the massif",
        text: "Drive the rover up to the glowing Summit Pad on top of Malapert Massif.",
        target: MALAPERT_ANTENNA,
        radius: 16,
        hold: 0,
        vehicle: "any",
        objectName: "Summit Pad",
        actionName: "",
        role: "Rover Driver",
        voice: "Welcome to Camp Relay. Drive the rover up the massif to the summit pad.",
        tip: "Climb at a steady speed. The rover keeps your suit topped up with oxygen while you drive.",
      },
      {
        id: "r_antenna",
        kind: "build",
        title: "Build the Main Antenna",
        text: "Assemble the antenna on the summit: {done}/{total} sections (hold E on foot).",
        target: MALAPERT_ANTENNA,
        radius: 9,
        hold: 3,
        vehicle: "foot",
        objectName: "Summit Pad · Main Antenna",
        actionName: "Hold E to Build",
        stages: [
          { name: "Antenna Mount", structure: "antenna_1", energy: 15 },
          { name: "Dish & Feed", structure: "antenna_2", energy: 15 },
        ],
        role: "Engineer",
        voice:
          "Summit reached. Earth is in view from up here. Step out and assemble the main antenna.",
      },
      {
        id: "r_aim",
        kind: "aim",
        title: "Aim at Earth",
        text: "Press E at the antenna, steer with A/D and W/S until the signal reads 90%+, then hold E to lock.",
        target: MALAPERT_ANTENNA,
        radius: 9,
        hold: 0,
        vehicle: "foot",
        objectName: "Main Antenna",
        actionName: "Press E to Aim at Earth",
        role: "Comms Officer",
        voice: "Antenna assembled. Point the dish at Earth and lock the signal.",
        tip: "Look for the blue Earth low in the sky. Line the dish up with it: the closer you aim, the stronger the signal.",
        factId: "ch3_malapert",
      },
      {
        id: "r_relay",
        kind: "build",
        title: "Connect the Relay Station",
        text: "Drive back to camp and build the Relay Station beside the habitat (hold E on foot).",
        target: RELAY_STATION,
        radius: 9,
        hold: 4,
        vehicle: "foot",
        objectName: "Relay Station Pad",
        actionName: "Hold E to Build",
        stages: [{ name: "Relay Station", structure: "relay", energy: 20 }],
        role: "Engineer",
        voice: "Earth link locked! Head back to camp and connect the relay station.",
      },
      {
        id: "r_storm",
        kind: "shelter",
        title: "Shelter from the storm",
        text: "DONKI alert! A solar storm hits in {countdown}s. Open Habitat A's airlock (E) and stay inside until it passes.",
        target: HAB_DOOR,
        radius: 4,
        hold: 0,
        vehicle: "foot",
        objectName: "Habitat Airlock",
        actionName: "",
        role: "Commander",
        voice:
          "Warning! The relay just received a DONKI space weather alert. A solar storm arrives in forty-five seconds. Get inside the habitat airlock!",
        factId: "ch3_storm",
      },
    ],
    scienceNote:
      "Game vs. Real Moon: here the storm warning gives you 45 seconds. Real solar particle storms and CMEs can arrive minutes to days after an eruption, and NASA's forecasters relay alerts to crews.",
    winTitle: "Camp Relay Online!",
    winText:
      "The Earth link is live, every camp can hear Mission Control, and your crew rode out its first solar storm.",
    hopperFrom: "Camp Helios",
    launchTarget: "Earth",
    landingFact: "ch3_relay",
    start: { energy: 120, water: 200, food: 200, panels: 8 },
  },
  chapter4: {
    id: "chapter4",
    number: 4,
    siteKey: "cabeus",
    siteId: 12,
    campName: "Camp Horizon",
    siteName: "Peak near Cabeus B",
    latitudeLabel: "84.9° S · Cabeus Rim",
    accent: "#C7A6FF",
    badge: "CHAPTER 4 · EXPLORATION",
    title: "Explore near Cabeus",
    summary:
      "Scan Cabeus crater for buried ice, fit the rover for the dark, harvest and refine the ice, and fly water to the whole network.",
    narrative: [
      "In 2009 NASA's LCROSS mission crashed a rocket stage into Cabeus crater and saw water in the debris plume.",
      "The crater floor never sees sunlight. It is colder than −200 °C, pitch dark, and hides ice the network needs for drinking water, air, and rocket fuel.",
      "Set up the survey station, find the ice with ground radar, fit the rover with lights and heaters, then harvest, refine, and fly the water home.",
    ],
    steps: [
      {
        id: "z_survey",
        kind: "build",
        title: "Set up the Survey Station",
        text: "Build the Survey Station on the crater-rim overlook (hold E on foot).",
        target: CABEUS_OVERLOOK,
        radius: 9,
        hold: 3,
        vehicle: "foot",
        objectName: "Rim Overlook",
        actionName: "Hold E to Build",
        stages: [{ name: "Survey Station", structure: "survey_station", energy: 15 }],
        role: "Scientist",
        voice:
          "Welcome to Camp Horizon on the rim of Cabeus. Set up the survey station at the overlook.",
        tip: "The dark bowl ahead is a permanently shadowed crater. Sunlight never reaches its floor.",
      },
      {
        id: "z_radar",
        kind: "build",
        title: "Scan with ground radar",
        text: "Deploy the Ground Radar at the marked spot (hold E on foot) to find buried ice.",
        target: CABEUS_RADAR,
        radius: 9,
        hold: 4,
        vehicle: "foot",
        objectName: "Ground Radar Site",
        actionName: "Hold E to Deploy",
        stages: [{ name: "Ground Radar", structure: "radar", energy: 20 }],
        effect: "reveal_ice",
        role: "Scientist",
        voice: "Survey station online. Now deploy the ground radar to look for buried ice.",
        factId: "ch4_psr",
      },
      {
        id: "z_upgrade",
        kind: "build",
        title: "Upgrade the rover",
        text: "Drive the rover onto the Upgrade Bay and hold E to fit headlights and heaters.",
        target: UPGRADE_BAY,
        radius: 7,
        hold: 4,
        vehicle: "rover",
        objectName: "Rover Upgrade Bay",
        actionName: "Hold E to Fit Lights & Heaters",
        stages: [{ name: "Lights & Heaters", structure: "rover_kit", energy: 20 }],
        effect: "rover_upgrade",
        role: "Engineer",
        voice:
          "Radar found three ice deposits in the dark. Drive the rover onto the upgrade bay for lights and heaters.",
        tip: "Without heaters, rover batteries and wheels freeze in shadowed craters. The upgrade also adds battery capacity.",
      },
      {
        id: "z_ice",
        kind: "harvest",
        title: "Harvest crater ice",
        text: "Drive into the dark crater and harvest the ice from the rover (hold E). {done}/{total} deposits collected.",
        radius: 22,
        hold: 0,
        vehicle: "rover",
        objectName: "Crater Ice",
        actionName: "",
        role: "Rover Driver",
        voice: "Rover upgraded. Headlights on. Drive into the crater and harvest the ice.",
      },
      {
        id: "z_refine",
        kind: "refine",
        title: "Refine the water",
        text: "Drive back to the camp dock and press E to refine the ice into water.",
        target: DOCK,
        radius: 16,
        hold: 0,
        vehicle: "rover",
        objectName: "Ice Refinery",
        actionName: "",
        role: "Engineer",
        voice: "Ice collected. Bring it back to the refinery at the camp dock.",
      },
      {
        id: "z_launch",
        kind: "launch",
        title: "Launch to the network",
        text: "Walk to the Cargo Hopper console and hold E to fly the water to the other camps.",
        target: CARGO_CONSOLE,
        radius: 4,
        hold: 3,
        vehicle: "foot",
        objectName: "Cargo Hopper Console",
        actionName: "Hold E to Launch Water to the Network",
        role: "Flight Controller",
        voice: "Water refined and loaded. Walk to the hopper console and launch it to the network.",
      },
    ],
    scienceNote:
      "Game vs. Real Moon: here ice shows up as bright crystals. Real crater ice is mixed into frozen soil, and rovers like VIPER were designed to drill and measure it.",
    winTitle: "Four-Camp Network Complete!",
    winText:
      "Camp Horizon's water is flying to Sirius, Helios, and Relay. Power, comms, water, and shelter now flow between all four camps.",
    hopperFrom: "Camp Relay",
    launchTarget: "the four-camp network",
    landingFact: "ch4_cabeus",
    start: { energy: 150, water: 200, food: 200, panels: 8 },
  },
};

export interface StoryState {
  stepIndex: number;
  surveyed: number[];
  stagesBuilt: number;
  built: string[];
  packsMade: number;
  packsCarried: number;
  packsLoaded: number;
  packTimer: number;
  aiming: boolean;
  aimYaw: number;
  aimPitch: number;
  linkLocked: boolean;
  stormCountdown: number;
  stormTimer: number;
  stormDose: number;
  roverUpgraded: boolean;
  iceRevealed: boolean;
  launchTimer: number;
  flareTimer: number;
  flareDone: boolean;
}

export function freshStory(): StoryState {
  return {
    stepIndex: 0,
    surveyed: [],
    stagesBuilt: 0,
    built: [],
    packsMade: 0,
    packsCarried: 0,
    packsLoaded: 0,
    packTimer: 0,
    aiming: false,
    aimYaw: 0,
    aimPitch: 0.1,
    linkLocked: false,
    stormCountdown: -1,
    stormTimer: 0,
    stormDose: 0,
    roverUpgraded: false,
    iceRevealed: false,
    launchTimer: -1,
    flareTimer: 0,
    flareDone: false,
  };
}

export function currentStep(def: StoryChapterDef, story: StoryState): StoryStepDef | null {
  return def.steps[story.stepIndex] ?? null;
}

export function packsReady(story: StoryState) {
  return Math.max(0, story.packsMade - story.packsCarried - story.packsLoaded);
}

/** 0–100 signal for a dish pointed at (yaw, pitch) when Earth sits at (targetYaw, targetPitch). */
export function antennaSignal(yaw: number, pitch: number, targetYaw: number, targetPitch: number) {
  const dir = (y: number, p: number) => [
    Math.sin(y) * Math.cos(p),
    Math.sin(p),
    Math.cos(y) * Math.cos(p),
  ];
  const a = dir(yaw, pitch),
    b = dir(targetYaw, targetPitch);
  const dot = Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
  const angle = Math.acos(dot);
  return Math.round(Math.max(0, 1 - angle / STORY.AIM_FALLOFF_RAD) * 100);
}

export interface StoryCtx {
  px: number;
  pz: number;
  rx: number;
  rz: number;
  inRover: boolean;
  energy: number;
  iceSites: { x: number; z: number; deposit: number; id: number }[];
}

export type StoryActionId =
  "survey" | "build" | "load_packs" | "unload_packs" | "start_aim" | "launch" | "info";

export interface StoryAction {
  id: StoryActionId;
  index: number;
  hold: number;
  objectText: string;
  actionText: string;
  distance: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** The single story prompt available where the player stands (null when none). */
export function storyActionAt(
  def: StoryChapterDef,
  story: StoryState,
  ctx: StoryCtx,
): StoryAction | null {
  const step = currentStep(def, story);
  if (!step || story.launchTimer >= 0) return null;
  const me: Point = ctx.inRover ? { x: ctx.rx, z: ctx.rz } : { x: ctx.px, z: ctx.pz };
  const act = (
    id: StoryActionId,
    hold: number,
    objectText: string,
    actionText: string,
    distance: number,
    index = 0,
  ): StoryAction => ({ id, index, hold, objectText, actionText, distance });
  const info = (objectText: string, actionText: string, d: number) =>
    act("info", -1, objectText, actionText, d);

  switch (step.kind) {
    case "survey": {
      const targets = step.targets ?? [];
      const reach = ctx.inRover ? step.radius + 4 : step.radius;
      let i = -1,
        d = Infinity;
      for (let k = 0; k < targets.length; k++) {
        const dk = dist(me, targets[k]!);
        if (dk < reach && dk < d) {
          i = k;
          d = dk;
        }
      }
      if (i < 0) return null;
      if (story.surveyed.includes(i))
        return info(step.objectName, `Reading logged: ${MOUTON_READINGS[i] ?? 0}% sunlight`, d);
      return act("survey", step.hold, `${step.objectName} ${i + 1}`, step.actionName, d, i);
    }
    case "build": {
      if (!step.target || !step.stages) return null;
      const d = dist(me, step.target);
      const stage = step.stages[story.stagesBuilt];
      if (!stage) return null;
      if (step.vehicle === "rover") {
        if (!ctx.inRover) {
          if (d < step.radius + 4) return info(step.objectName, "Drive the rover onto the bay", d);
          return null;
        }
        if (d >= step.radius) return null;
      } else {
        if (ctx.inRover) {
          if (d < step.radius + 8)
            return info(step.objectName, "Press Space to step out, then hold E", d);
          return null;
        }
        if (d >= step.radius) return null;
      }
      if (ctx.energy < stage.energy)
        return info(step.objectName, `Needs ${stage.energy}E — wait for solar power`, d);
      const count =
        step.stages.length > 1 ? ` (${story.stagesBuilt + 1}/${step.stages.length})` : "";
      return act(
        "build",
        step.hold,
        `${step.objectName}${count}`,
        `${step.actionName} ${stage.name} · ${stage.energy}E`,
        d,
        story.stagesBuilt,
      );
    }
    case "packs": {
      const atTower = dist(me, HELIOS_TOWER);
      const atPad = dist(me, CARGO_PAD);
      const ready = packsReady(story);
      if (ctx.inRover) {
        if (atPad < step.radius && story.packsCarried > 0)
          return act(
            "unload_packs",
            0,
            `Cargo Hopper (${story.packsLoaded}/${STORY.PACK_TOTAL} loaded)`,
            `Unload ${story.packsCarried} Energy Pack${story.packsCarried > 1 ? "s" : ""}`,
            atPad,
          );
        if (atTower < step.radius) {
          if (story.packsCarried >= STORY.ROVER_PACK_CAP)
            return info(
              "Solar Tower Charger",
              "Rover full (2/2) — drive to the Cargo Hopper",
              atTower,
            );
          if (ready > 0) {
            const n = Math.min(ready, STORY.ROVER_PACK_CAP - story.packsCarried);
            return act(
              "load_packs",
              0,
              `Solar Tower Charger (${ready} ready)`,
              `Load ${n} Energy Pack${n > 1 ? "s" : ""}`,
              atTower,
            );
          }
          if (story.packsLoaded + story.packsCarried >= STORY.PACK_TOTAL)
            return info(
              "Solar Tower Charger",
              "All packs collected — drive to the Cargo Hopper",
              atTower,
            );
          const left = Math.ceil(STORY.PACK_SECONDS - story.packTimer);
          return info("Solar Tower Charger", `Charging next pack… ${Math.max(1, left)}s`, atTower);
        }
        return null;
      }
      if (atTower < 10)
        return info(
          "Solar Tower Charger",
          `${ready} pack${ready === 1 ? "" : "s"} ready — bring the rover to haul them`,
          atTower,
        );
      if (atPad < 10)
        return info(
          "Cargo Hopper",
          `${story.packsLoaded}/${STORY.PACK_TOTAL} energy packs loaded`,
          atPad,
        );
      return null;
    }
    case "aim": {
      if (!step.target || ctx.inRover || story.aiming) return null;
      const d = dist(me, step.target);
      if (d >= step.radius) return null;
      return act("start_aim", 0, step.objectName, step.actionName, d);
    }
    case "launch": {
      if (!step.target) return null;
      const d = dist(me, step.target);
      if (ctx.inRover) {
        if (d < step.radius + 10)
          return info(step.objectName, "Press Space to step out, then hold E", d);
        return null;
      }
      if (d >= step.radius) return null;
      return act("launch", step.hold, step.objectName, step.actionName, d);
    }
    default:
      return null;
  }
}

/** Where the guidance beacon and radar blip should point right now. */
export function storyTarget(def: StoryChapterDef, story: StoryState, ctx: StoryCtx): Point | null {
  const step = currentStep(def, story);
  if (!step) return null;
  const me: Point = ctx.inRover ? { x: ctx.rx, z: ctx.rz } : { x: ctx.px, z: ctx.pz };
  const nearest = (pts: Point[]) => {
    let best: Point | null = null,
      bestD = Infinity;
    for (const p of pts) {
      const d = dist(me, p);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  };
  switch (step.kind) {
    case "survey":
      return nearest((step.targets ?? []).filter((_, i) => !story.surveyed.includes(i)));
    case "packs": {
      const goPad =
        story.packsCarried > 0 &&
        (story.packsCarried >= STORY.ROVER_PACK_CAP || packsReady(story) === 0);
      return goPad ? CARGO_PAD : HELIOS_TOWER;
    }
    case "harvest":
      return nearest(ctx.iceSites.filter((s) => s.deposit > 0).map((s) => ({ x: s.x, z: s.z })));
    default:
      return step.target ?? null;
  }
}

export function stepTotal(step: StoryStepDef) {
  if (step.kind === "survey") return step.targets?.length ?? 0;
  if (step.kind === "build") return step.stages?.length ?? 0;
  if (step.kind === "packs") return STORY.PACK_TOTAL;
  if (step.kind === "harvest") return CABEUS_ICE.length;
  return 1;
}

/** HUD objective line with live counters filled in. */
export function describeStep(
  def: StoryChapterDef,
  story: StoryState,
  ctx: { iceSites: { id: number; deposit: number }[] },
): { title: string; text: string } {
  const step = currentStep(def, story);
  if (!step) return { title: def.winTitle, text: def.winText };
  if (story.launchTimer >= 0)
    return { title: "Hopper away!", text: `Cargo hopper climbing toward ${def.launchTarget}…` };
  let done = 0;
  if (step.kind === "survey") done = story.surveyed.length;
  else if (step.kind === "build") done = story.stagesBuilt;
  else if (step.kind === "packs") done = story.packsLoaded;
  else if (step.kind === "harvest")
    done = CABEUS_ICE.filter(
      (ice) => (ctx.iceSites.find((s) => s.id === ice.id)?.deposit ?? 1) <= 0,
    ).length;
  let text = step.text;
  if (step.kind === "shelter" && story.stormCountdown <= 0 && story.stormTimer > 0)
    text = "Solar storm active: {storm}s left. Stay inside the airlock until it passes!";
  if (step.kind === "aim" && story.aiming)
    text =
      "Steer the dish with A/D and W/S. Hold E to lock when the signal reads 90%+. Space to step away.";
  text = text
    .replace("{done}", `${done}`)
    .replace("{total}", `${stepTotal(step)}`)
    .replace("{ready}", `${packsReady(story)}`)
    .replace("{carried}", `${story.packsCarried}`)
    .replace("{loaded}", `${story.packsLoaded}`)
    .replace("{countdown}", `${Math.max(0, Math.ceil(story.stormCountdown))}`)
    .replace("{storm}", `${Math.max(0, Math.ceil(story.stormTimer))}`);
  return { title: step.title, text };
}

/** Soft crew roles: unique roles in chapter order, dealt round-robin to seats. */
export function chapterRoles(def: StoryChapterDef): CrewRole[] {
  const out: CrewRole[] = [];
  for (const s of def.steps) if (!out.includes(s.role)) out.push(s.role);
  return out;
}

export function roleSeat(def: StoryChapterDef, role: CrewRole, crewSize: number) {
  const roles = chapterRoles(def);
  const i = Math.max(0, roles.indexOf(role));
  return i % Math.max(1, crewSize);
}

export function nextChapterId(id: ChapterId | null): ChapterId | null {
  if (!id) return null;
  const i = CAMPAIGN_ORDER.indexOf(id);
  return i >= 0 ? (CAMPAIGN_ORDER[i + 1] ?? null) : null;
}

/** Route points for a chapter, in play order, starting and ending at camp. */
export function chapterRoute(def: StoryChapterDef): Point[] {
  const camp: Point = { x: 0, z: 0 };
  const pts: Point[] = [camp];
  for (const s of def.steps) {
    if (s.kind === "survey") pts.push(...(s.targets ?? []));
    else if (s.kind === "packs") pts.push(HELIOS_TOWER, CARGO_PAD, HELIOS_TOWER, CARGO_PAD);
    else if (s.kind === "harvest") pts.push(...CABEUS_ICE.map((i) => ({ x: i.x, z: i.z })));
    else if (s.target) pts.push(s.target);
  }
  pts.push(camp);
  return pts;
}

const CAMPAIGN_KEY = "frontier_campaign_v1";

export function loadCampaign(): ChapterId[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((id): id is ChapterId => CAMPAIGN_ORDER.includes(id))
      : [];
  } catch {
    return [];
  }
}

export function markChapterComplete(id: ChapterId): ChapterId[] {
  const done = loadCampaign();
  if (!done.includes(id)) done.push(id);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(done));
    } catch {
      // Ignore storage quota / private-mode errors
    }
  }
  return done;
}

/** First campaign chapter not yet completed (null once all four are done). */
export function recommendedChapter(done: readonly ChapterId[]): ChapterId | null {
  return CAMPAIGN_ORDER.find((id) => !done.includes(id)) ?? null;
}
