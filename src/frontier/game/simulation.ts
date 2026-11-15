import {
  CHECKPOINT_VERSION,
  clearCheckpointFromStorage,
  loadCheckpointFromStorage,
  saveCheckpointToStorage,
  type CheckpointData,
} from "./checkpoint";
import {
  clampCrewSize,
  emptyCrewVotes,
  getChapter,
  type ChapterId,
  type PlayMode,
} from "./chapters";
import {
  CONFIG,
  type FactDef,
  type IceSiteDef,
  type LandingSiteDef,
  type ModuleDef,
  type ModuleId,
} from "./config";
import {
  BASES,
  NETWORK,
  allRunning,
  baseDef,
  canBuild,
  commBackup,
  dailyFlow,
  initialBases,
  networkUnlocked,
  networkWon,
  nextFacility,
  nextStreak,
  radarActive,
  warnLeadDays,
  type BaseId,
  type BaseState,
} from "./network";
import {
  RULES,
  addHallEntry,
  applyOxygenRescuePenalty,
  buildEventSchedule,
  canRefillOxygen,
  chargeStep,
  dailySolarOutput,
  isChapter1Complete,
  missionExpired,
  remainingStarterPanels,
  roundTripBattery,
  shouldNotifyOverflow,
  type HallEntry,
  type ScheduledEvent,
} from "./rules";
import { sound } from "./soundEngine";
import {
  DOCK,
  EARTH_DIRECTION,
  HAB_DOOR,
  LANDER_POS,
  ORIENT_CONSOLE,
  RECOVERY_CONSOLE,
  SOLAR_FIELD,
  SOLAR_TRACKER,
  type Point,
} from "./sites";
import {
  CABEUS_ICE,
  MOUTON_READINGS,
  STORY,
  STORY_CHAPTERS,
  STORY_SITES,
  antennaSignal,
  currentStep,
  freshStory,
  isStoryChapter,
  loadCampaign,
  markChapterComplete,
  packsReady,
  storyActionAt,
  storyTarget,
  type StoryAction,
  type StoryChapterDef,
  type StoryChapterId,
  type StoryCtx,
  type StoryState,
} from "./storyline";

export { DOCK, HAB_DOOR, LANDER_POS, ORIENT_CONSOLE, RECOVERY_CONSOLE, SOLAR_FIELD, SOLAR_TRACKER };

/** Landing sites for the sandbox picker plus the story-only chapter sites. */
export function findSite(id: number): LandingSiteDef | undefined {
  return CONFIG.SITES.find((s) => s.id === id) ?? STORY_SITES.find((s) => s.id === id);
}

export const HIDDEN_ICE: IceSiteDef[] = [
  { id: 101, x: -340, z: -120, deposit: 80, maxDeposit: 80, difficulty: "mid" },
  { id: 102, x: 120, z: 345, deposit: 80, maxDeposit: 80, difficulty: "mid" },
];

const HALL_KEY = "frontier_hall_of_fame_v1";
function loadHall(): HallEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HALL_KEY) || "[]") as HallEntry[];
  } catch {
    return [];
  }
}

export type DockState = "empty" | "docked" | "charging" | "full";
export type OxygenSource = "none" | "lander" | "airlock" | "rover";
export type MissionMode = "chapter1" | "chapter2" | "chapter3" | "chapter4" | "full";

export type GamePhase =
  "title" | "chapters" | "selecting" | "briefing" | "landing" | "playing" | "won" | "lost";
export type MissionStage =
  | "orient"
  | "panels"
  | "align_panels"
  | "board_rover"
  | "find_ice"
  | "unload"
  | "build_A"
  | "enter_airlock"
  | "build_B"
  | "build_C"
  | "story"
  | "done";

export interface ModuleState {
  id: ModuleId;
  def: ModuleDef;
  status: "locked" | "available" | "building" | "active" | "damaged" | "paused";
  daysLeft: number;
}

export interface PlayerState {
  x: number;
  z: number;
  rotation: number;
  oxygen: number;
  inRover: boolean;
  insideAirlock: boolean;
  oxygenSource: OxygenSource;
}

export interface RoverState {
  x: number;
  z: number;
  rotation: number;
  speed: number;
  battery: number;
  batteryMax: number;
  waterTank: number;
  damage: number;
  isBoosting: boolean;
  boostTime: number;
  boostCooldown: number;
}

export interface GameState {
  phase: GamePhase;
  missionMode: MissionMode;
  playMode: PlayMode;
  selectedChapterId: ChapterId | null;
  crewSize: number;
  crewVotes: (ChapterId | null)[];
  chapter1Completed: boolean;
  /** Campaign chapters finished on this device. */
  campaignDone: ChapterId[];
  /** Chapters 2–4 objective progress (unused in Chapter 1 / sandbox). */
  story: StoryState;
  seed: number;
  stage: MissionStage;
  day: number;
  dayTimer: number;
  dayProgress: number;

  // Colony resources
  energy: number;
  water: number;
  food: number;
  dailyEnergyDelta: number;
  dailyWaterDelta: number;
  dailyFoodDelta: number;

  // Panels & orientation
  panelsInstalled: number;
  panelsInstalledToday: number;
  solarAligned: boolean;
  siteOriented: boolean;

  // Checkpoints
  hasCheckpoint: boolean;
  checkpointInfo: { day: number; siteName: string; savedAt: string } | null;

  // Modules
  modules: Record<ModuleId, ModuleState>;

  // Selection
  selectedSite: LandingSiteDef;
  selectionTimeout: number;

  // Ice sites & network
  iceSites: IceSiteDef[];
  bases: BaseState[];
  baseOnline: Record<string, boolean>;
  networkOpen: boolean;
  networkStreak: number;
  networkFlow: { energy: number; water: number; food: number };
  commLinkDown: number;

  // Entities
  player: PlayerState;
  rover: RoverState;

  // Shortage & events
  shortageDays: number;
  shortageResource: string | null;
  activeStorm: boolean;
  stormDaysLeft: number;
  stormWarningDays: number;
  events: ScheduledEvent[];
  eventBanner: {
    kind: "storm" | "meteor";
    phase: "warn" | "active";
    title: string;
    edu: string;
  } | null;
  lastOverflowDay: number;
  lowBatteryWarned: boolean;
  dockState: DockState;
  airlock: { open: boolean; opening: number };
  roverTeleport: number;
  playerTeleport: number;
  iceCheck: { distance: number; needed: number; ok: boolean } | null;
  seenFacts: string[];
  seenTips: string[];
  hall: HallEntry[];
  hallRank: number;

  // Stats for end game
  stats: {
    daysTaken: number;
    waterTrips: number;
    oxygenDeaths: number;
    panelsBuilt: number;
    repairs: number;
    waterDelivered: number;
    modulesBuilt: number;
    moduleRepairs: number;
  };

  // UI helpers
  menuOpen: boolean;
  toasts: { id: string; text: string; kind: "info" | "warn" | "good" }[];
  activeTip: string | null;
  activeFact: FactDef | null;
  showTips: boolean;
  showFacts: boolean;
  prompt: {
    visible: boolean;
    objectText: string;
    actionText: string;
    keyText: string;
    holdProgress: number;
  } | null;
}

export class SimulationManager {
  public state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();
  private lastUpdate: number = performance.now();
  private tickInterval: number | null = null;
  private pendingTimeouts: Set<number> = new Set();
  private breathTimer: number = 0;
  private doorCloseTimer: number = 0;
  private factTimer = 0;
  private factGap = 99;
  private factQueue: FactDef[] = [];
  private stormWarnTimer = 0;

  constructor(seed?: number) {
    this.state = this.getInitialState(seed);
  }

  private scheduleTimeout(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.pendingTimeouts.delete(id);
      fn();
    }, ms);
    this.pendingTimeouts.add(id);
  }

  private clearAllTimeouts() {
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts.clear();
  }

  private getInitialState(seed?: number): GameState {
    const modules = {
      A: {
        id: "A",
        def: CONFIG.MODULES.A,
        status: "available",
        daysLeft: CONFIG.MODULES.A.buildDays,
      },
      B: {
        id: "B",
        def: CONFIG.MODULES.B,
        status: "locked",
        daysLeft: CONFIG.MODULES.B.buildDays,
      },
      C: {
        id: "C",
        def: CONFIG.MODULES.C,
        status: "locked",
        daysLeft: CONFIG.MODULES.C.buildDays,
      },
    } satisfies Record<ModuleId, ModuleState>;

    const defaultSite = CONFIG.SITES[CONFIG.DEFAULT_SITE_ID - 1] ?? CONFIG.SITES[0]!;
    const scheduleSeed = seed ?? Math.floor(Math.random() * 1e9);
    const savedCp = loadCheckpointFromStorage();
    const cpSite = savedCp ? (findSite(savedCp.selectedSiteId)?.name ?? "Camp Sirius") : "";

    return {
      phase: "title",
      missionMode: "full",
      playMode: "solo",
      selectedChapterId: null,
      crewSize: 2,
      crewVotes: emptyCrewVotes(2),
      chapter1Completed: false,
      campaignDone: loadCampaign(),
      story: freshStory(),
      seed: scheduleSeed,
      stage: "panels",
      day: 1,
      dayTimer: 0,
      dayProgress: 0,

      energy: CONFIG.START.energy,
      water: CONFIG.START.water,
      food: CONFIG.START.food,
      dailyEnergyDelta: 0,
      dailyWaterDelta: -CONFIG.CREW.water,
      dailyFoodDelta: -CONFIG.CREW.food,

      panelsInstalled: 0,
      panelsInstalledToday: 0,
      solarAligned: true,
      siteOriented: true,

      hasCheckpoint: Boolean(savedCp),
      checkpointInfo: savedCp
        ? { day: savedCp.day, siteName: cpSite, savedAt: savedCp.savedAt }
        : null,

      modules,
      selectedSite: defaultSite,
      selectionTimeout: CONFIG.SITE_SELECT_TIMEOUT,

      iceSites: CONFIG.ICE_SITES.map((s) => ({ ...s })),
      bases: initialBases(),
      baseOnline: {},
      networkOpen: false,
      networkStreak: 0,
      networkFlow: { energy: 0, water: 0, food: 0 },
      commLinkDown: 0,

      player: {
        x: 0,
        z: 6,
        rotation: 0,
        oxygen: CONFIG.OXYGEN.max,
        inRover: false,
        insideAirlock: false,
        oxygenSource: "none",
      },

      rover: {
        x: DOCK.x,
        z: DOCK.z,
        rotation: 0,
        speed: 0,
        battery: CONFIG.ROVER.batteryMax,
        batteryMax: CONFIG.ROVER.batteryMax,
        waterTank: 0,
        damage: 0,
        isBoosting: false,
        boostTime: 0,
        boostCooldown: 0,
      },

      shortageDays: 0,
      shortageResource: null,
      activeStorm: false,
      stormDaysLeft: 0,
      stormWarningDays: 0,
      events: buildEventSchedule(scheduleSeed),
      eventBanner: null,
      lastOverflowDay: -1,
      lowBatteryWarned: false,
      dockState: "docked",
      airlock: { open: false, opening: 0 },
      roverTeleport: 0,
      playerTeleport: 0,
      iceCheck: null,
      seenFacts: [],
      seenTips: [],
      hall: [],
      hallRank: 0,

      stats: {
        daysTaken: 0,
        waterTrips: 0,
        oxygenDeaths: 0,
        panelsBuilt: 0,
        repairs: 0,
        waterDelivered: 0,
        modulesBuilt: 0,
        moduleRepairs: 0,
      },

      menuOpen: false,
      toasts: [],
      activeTip:
        "Deploy 3 solar panels first. Energy is required to process water and build structures.",
      activeFact: null,
      showTips: true,
      showFacts: true,
      prompt: null,
    };
  }

  public subscribe(listener: (state: GameState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.state));
  }

  public startGame() {
    sound.playClick();
    sound.speak(
      "Welcome to the Frontier. Select your landing coordinates at the Lunar South Pole.",
    );
    this.state.missionMode = "full";
    this.state.playMode = this.state.playMode || "solo";
    this.state.selectedChapterId = this.state.selectedChapterId ?? "full";
    this.state.phase = "selecting";
    this.state.selectionTimeout = CONFIG.SITE_SELECT_TIMEOUT;
    this.notify();
  }

  /** Opens the chapter list for solo play or shared-device crew voting. */
  public openChapterSelect(mode: PlayMode) {
    sound.playClick();
    this.state.playMode = mode;
    this.state.selectedChapterId = null;
    if (mode === "crew") {
      this.state.crewVotes = emptyCrewVotes(this.state.crewSize);
      sound.speak("Crew vote open. Pick a chapter together.");
    } else {
      sound.speak("Choose your chapter and begin when ready.");
    }
    this.state.phase = "chapters";
    this.notify();
  }

  public setCrewSize(size: number) {
    if (this.state.phase !== "chapters" || this.state.playMode !== "crew") return;
    this.state.crewSize = clampCrewSize(size);
    this.state.crewVotes = emptyCrewVotes(this.state.crewSize);
    this.notify();
  }

  public castChapterVote(seat: number, chapterId: ChapterId) {
    if (this.state.phase !== "chapters" || this.state.playMode !== "crew") return;
    if (seat < 0 || seat >= this.state.crewVotes.length) return;
    const chapter = getChapter(chapterId);
    if (chapter.status !== "playable") return;
    sound.playClick();
    this.state.crewVotes[seat] = chapterId;
    this.notify();
  }

  /** Solo: enter a playable chapter (briefing, site select, or direct play). */
  public enterChapter(chapterId: ChapterId) {
    const chapter = getChapter(chapterId);
    if (chapter.status !== "playable") return;
    this.state.playMode = "solo";
    this.state.selectedChapterId = chapterId;
    this.launchChapter(chapterId);
  }

  /** Crew: begin the chapter that won the vote. */
  public startVotedChapter(chapterId: ChapterId) {
    if (this.state.phase !== "chapters" || this.state.playMode !== "crew") return;
    const chapter = getChapter(chapterId);
    if (chapter.status !== "playable") return;
    this.state.selectedChapterId = chapterId;
    this.launchChapter(chapterId);
  }

  private launchChapter(chapterId: ChapterId) {
    const chapter = getChapter(chapterId);
    this.resetRun();
    this.state.selectedChapterId = chapter.id;
    if (chapter.id === "full") {
      this.startGame();
      return;
    }
    if (chapter.id === "chapter1") {
      this.openChapter1Briefing();
      return;
    }
    if (isStoryChapter(chapter.id)) this.openStoryBriefing(chapter.id);
  }

  /** Fresh mission state for a new chapter run; keeps crew setup and UI preferences. */
  private resetRun() {
    const prev = this.state;
    this.pauseLoop();
    this.clearAllTimeouts();
    this.factQueue = [];
    this.factTimer = 0;
    this.factGap = 99;
    this.breathTimer = 0;
    this.doorCloseTimer = 0;
    this.stormWarnTimer = 0;
    this.state = this.getInitialState();
    this.state.playMode = prev.playMode;
    this.state.crewSize = prev.crewSize;
    this.state.crewVotes = prev.crewVotes;
    this.state.showTips = prev.showTips;
    this.state.showFacts = prev.showFacts;
    this.state.roverTeleport = prev.roverTeleport + 1;
    this.state.playerTeleport = prev.playerTeleport + 1;
  }

  public storyDef(): StoryChapterDef | null {
    const mode = this.state.missionMode;
    return isStoryChapter(mode) ? STORY_CHAPTERS[mode] : null;
  }

  /** Opens a Chapter 2–4 briefing with that camp's starting core already set up. */
  public openStoryBriefing(id: StoryChapterId) {
    const def = STORY_CHAPTERS[id];
    const st = this.state;
    sound.playClick();
    st.missionMode = id;
    st.selectedChapterId = id;
    st.selectedSite = findSite(def.siteId) ?? STORY_SITES[0]!;
    st.stage = "story";
    st.story = freshStory();
    st.energy = def.start.energy;
    st.water = def.start.water;
    st.food = def.start.food;
    st.panelsInstalled = def.start.panels;
    st.dailyEnergyDelta = 0;
    st.dailyWaterDelta = 0;
    st.dailyFoodDelta = 0;
    st.solarAligned = true;
    st.siteOriented = true;
    st.modules.A.status = "active";
    st.modules.A.daysLeft = 0;
    st.modules.B.status = "locked";
    st.modules.C.status = "locked";
    st.iceSites = [];
    st.events = [];
    st.networkOpen = false;
    st.eventBanner = null;
    st.activeStorm = false;
    st.activeTip = def.steps[0]?.tip ?? null;
    st.phase = "briefing";
    sound.speak(
      `Chapter ${def.number} briefing: ${def.campName} at ${def.siteName}. Review the plan and board the hopper when ready.`,
    );
    this.notify();
  }

  /** Replays the current chapter from its briefing. */
  public replayChapter() {
    const id = this.state.selectedChapterId;
    if (!id || id === "full") {
      this.restartGame();
      return;
    }
    this.enterChapterKeepingMode(id);
  }

  /** Starts the next campaign chapter straight from the results screen. */
  public startChapterFromResults(id: ChapterId) {
    this.enterChapterKeepingMode(id);
  }

  private enterChapterKeepingMode(id: ChapterId) {
    const chapter = getChapter(id);
    if (chapter.status !== "playable") return;
    this.state.selectedChapterId = id;
    this.launchChapter(id);
  }

  /** Opens the Chapter 1 vertical slice briefing for Nobile Rim 1 (Camp Sirius). */
  public openChapter1Briefing() {
    sound.playClick();
    const nobile = CONFIG.SITES.find((s) => s.id === CONFIG.CHAPTER_1.siteId) ?? CONFIG.SITES[0]!;
    this.state.selectedSite = nobile;
    this.state.missionMode = "chapter1";
    this.state.selectedChapterId = "chapter1";
    this.state.chapter1Completed = false;
    this.state.siteOriented = false;
    this.state.solarAligned = false;
    this.state.stage = "orient";
    this.state.phase = "briefing";
    this.state.activeTip =
      "Walk forward to the Lander Orientation Console (glowing ring) and press E to calibrate your Camp Sirius radar.";
    sound.speak(
      "Chapter 1 Mission Briefing: Camp Sirius at Nobile Rim 1. Review your mission plan and launch when ready.",
    );
    this.notify();
  }

  /** Launches descent from the Chapter 1 briefing into Nobile Rim 1. */
  public launchBriefingMission() {
    this.selectSite(this.state.selectedSite, this.state.missionMode);
  }

  public selectSite(site: LandingSiteDef, mode: MissionMode = this.state.missionMode) {
    sound.playClick();
    const story = isStoryChapter(mode) ? STORY_CHAPTERS[mode] : null;
    this.state.selectedSite = site;
    this.state.missionMode = mode;
    if (mode === "chapter1") {
      this.state.siteOriented = false;
      this.state.solarAligned = false;
      this.state.stage = "orient";
    } else if (!story) {
      this.state.siteOriented = true;
      this.state.solarAligned = true;
      this.state.stage = "panels";
    }
    this.state.phase = "landing";
    sound.speak(
      story
        ? `Hopper lifting off from ${story.hopperFrom}. Next stop: ${story.campName}.`
        : `Coordinates confirmed for ${site.name}. Descent engine firing. Hang on.`,
    );
    this.notify();

    this.scheduleTimeout(() => {
      if (this.state.phase !== "landing") return;
      this.state.phase = "playing";
      this.state.menuOpen = false;
      sound.playMilestone();
      sound.speak(
        story
          ? (story.steps[0]?.voice ?? `Touchdown at ${story.campName}.`)
          : mode === "chapter1"
            ? `Touchdown confirmed at ${site.name}. Welcome to Camp Sirius! Check the Lander Orientation Console first.`
            : `Touchdown confirmed at ${site.name}. Mission Day 1 active. Deploy solar arrays first.`,
      );
      this.triggerFact(story ? story.landingFact : "landing_site");
      this.saveCheckpoint(true);
      this.startLoop();
      this.notify();
    }, CONFIG.LANDING_SECONDS * 1000);
  }

  public startLoop() {
    if (this.tickInterval) return;
    this.lastUpdate = performance.now();
    this.tickInterval = window.setInterval(() => this.update(), 100);
  }

  public pauseLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public update() {
    if (this.state.phase !== "playing" || this.state.menuOpen) return;
    const now = performance.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;
    this.step(dt);
  }

  /** Advances the simulation deterministically by `dt` real seconds. */
  public step(dt: number) {
    if (this.state.phase !== "playing" || this.state.menuOpen || dt <= 0) return;

    // Advance day timer
    this.state.dayTimer += dt;
    while (this.state.dayTimer >= CONFIG.DAY_SECONDS && this.state.phase === "playing") {
      this.state.dayTimer -= CONFIG.DAY_SECONDS;
      this.onDayTick();
    }
    if (this.state.phase !== "playing") return;
    this.state.dayProgress = Math.min(1, this.state.dayTimer / CONFIG.DAY_SECONDS);

    // Airlock cycling & automatic sealing when Habitat A is damaged or player leaves
    const al = this.state.airlock;
    if (this.state.modules.A.status !== "active") {
      al.open = false;
      al.opening = 0;
      this.doorCloseTimer = 0;
    } else if (al.opening > 0) {
      al.opening += dt;
      if (al.opening >= RULES.AIRLOCK_SECONDS) {
        al.opening = 0;
        al.open = true;
        this.addToast("Airlock open. Step inside to refill oxygen.", "good");
      }
    } else if (al.open) {
      const far =
        Math.hypot(this.state.player.x - HAB_DOOR.x, this.state.player.z - HAB_DOOR.z) > 6;
      this.doorCloseTimer = far ? this.doorCloseTimer + dt : 0;
      if (this.doorCloseTimer > 10) {
        al.open = false;
        this.doorCloseTimer = 0;
      }
    }

    // Oxygen consumption & astronaut breathing audio
    this.breathTimer += dt;
    const isLowOxygen = this.state.player.oxygen <= 25;
    const breathInterval = isLowOxygen ? 1.8 : 4.0;

    if (this.breathTimer >= breathInterval) {
      this.breathTimer = 0;
      sound.playBreathing(isLowOxygen);
    }

    const atHabitatDoor =
      Math.hypot(this.state.player.x - HAB_DOOR.x, this.state.player.z - HAB_DOOR.z) < 3.5;
    const nearLander =
      Math.hypot(this.state.player.x - LANDER_POS.x, this.state.player.z - LANDER_POS.z) < 8;
    const roverPowered =
      this.state.rover.battery > 0 && this.state.rover.damage < CONFIG.ROVER.maxDamage;

    const refilling = canRefillOxygen({
      habitatStatus: this.state.modules.A.status,
      airlockOpen: al.open,
      atHabitatDoor,
      nearLander,
      inRover: this.state.player.inRover,
      roverPowered,
    });

    this.state.player.insideAirlock = !this.state.player.inRover && refilling;
    this.state.player.oxygenSource = !refilling
      ? "none"
      : this.state.player.inRover
        ? "rover"
        : this.state.modules.A.status === "active"
          ? "airlock"
          : "lander";

    if (refilling) {
      this.state.player.oxygen = Math.min(
        CONFIG.OXYGEN.max,
        this.state.player.oxygen + CONFIG.OXYGEN.refillPerSecond * dt,
      );
      if (
        this.state.missionMode === "chapter1" &&
        !this.state.chapter1Completed &&
        isChapter1Complete({
          habitatStatus: this.state.modules.A.status,
          airlockOpen: al.open,
          oxygenSource: this.state.player.oxygenSource,
        })
      ) {
        this.onChapter1Victory();
        return;
      }
    } else {
      let drain = CONFIG.OXYGEN.drainPerSecond;
      if (this.state.activeStorm) drain *= RULES.STORM_OXYGEN_MULT;
      if (this.state.player.oxygen <= 30) this.triggerFact("oxygen");
      const prevFloor = Math.floor(this.state.player.oxygen);
      this.state.player.oxygen = Math.max(0, this.state.player.oxygen - drain * dt);
      const nextFloor = Math.floor(this.state.player.oxygen);

      if (this.state.player.oxygen <= 20 && nextFloor < prevFloor && nextFloor % 5 === 0) {
        sound.playWarning();
      }

      if (this.state.player.oxygen <= 0) {
        this.onOxygenFailure();
        return;
      }
    }

    // Rover charging in base dock: battery is bought with base energy 1:1 while parked
    const R = CONFIG.ROVER;
    const rv = this.state.rover;
    const distToDock = Math.hypot(rv.x - DOCK.x, rv.z - DOCK.z);
    let dock: DockState = "empty";
    if (distToDock < R.chargeRadius) {
      dock = "docked";
      if (rv.battery >= rv.batteryMax - 0.01) {
        dock = "full";
      } else if (!this.state.player.inRover || Math.abs(rv.speed) < 0.5) {
        const got = chargeStep(
          R.chargeRatePerSecond,
          dt,
          rv.battery,
          rv.batteryMax,
          this.state.energy,
        );
        if (got > 0) {
          rv.battery += got;
          this.state.energy -= got;
          dock = "charging";
        }
      }
    }
    if (dock !== this.state.dockState) {
      const msg = {
        empty: "",
        docked: "Rover docked at charging pad.",
        charging: "Charging rover from base power...",
        full: "Rover battery full.",
      }[dock];
      if (dock === "full" && this.state.dockState === "charging") sound.playChargeFull();
      if (dock === "charging") sound.playChargeStart();
      if (msg && !(dock === "docked" && this.state.dockState === "charging")) {
        this.addToast(msg, dock === "full" ? "good" : "info");
      }
      if (dock === "docked" && this.state.dockState === "charging" && this.state.energy <= 0) {
        this.addToast("Charging stopped: base energy empty.", "warn");
      }
      this.state.dockState = dock;
    }
    if (rv.battery > rv.batteryMax * R.lowBatteryRatio + 1) {
      this.state.lowBatteryWarned = false;
    } else if (!this.state.lowBatteryWarned && rv.battery <= rv.batteryMax * R.lowBatteryRatio) {
      this.state.lowBatteryWarned = true;
      sound.playWarning();
      this.addToast(CONFIG.MISSION_TEXTS.batteryLow, "warn");
    }

    if (isStoryChapter(this.state.missionMode)) {
      this.stepStory(dt);
      if (this.state.phase !== "playing") return;
    }

    // Radar: can the battery cover a round trip to the nearest ice?
    let best: { distance: number } | null = null;
    for (const ice of this.state.iceSites) {
      if (ice.deposit <= 0) continue;
      const d = Math.hypot(ice.x - DOCK.x, ice.z - DOCK.z);
      if (!best || d < best.distance) best = { distance: d };
    }
    if (best) {
      const needed = roundTripBattery(best.distance, R.maxSpeed, R.batteryDrainPerSecond);
      this.state.iceCheck = {
        distance: Math.round(best.distance),
        needed: Math.ceil(needed),
        ok: rv.battery >= needed,
      };
    } else {
      this.state.iceCheck = null;
    }

    // Fact card auto-close / queue
    if (this.state.activeFact) {
      this.factTimer += dt;
      if (this.factTimer >= RULES.FACT_AUTO_CLOSE) this.closeFact(true);
    } else {
      this.factGap += dt;
      const nextFact = this.factQueue.shift();
      if (nextFact && this.factGap >= RULES.FACT_SPACING) {
        this.showFact(nextFact);
      } else if (nextFact) {
        this.factQueue.unshift(nextFact);
      }
    }

    // Rover booster cooldown
    if (this.state.rover.boostCooldown > 0) {
      this.state.rover.boostCooldown = Math.max(0, this.state.rover.boostCooldown - dt);
    }

    this.notify();
  }

  public onDayTick() {
    this.state.day += 1;
    this.state.panelsInstalledToday = 0;

    // Calculate solar energy (incorporating sun-tracker alignment and storms)
    this.processEvents();
    const solarEnergy = dailySolarOutput({
      panelsInstalled: this.state.panelsInstalled,
      panelOutput: CONFIG.PANEL_OUTPUT,
      siteSunlight: this.state.selectedSite.sunlight,
      solarAligned: this.state.solarAligned,
      activeStorm: this.state.activeStorm,
    });

    // Upkeeps
    let upkeepEnergy = 0;
    let upkeepWater = CONFIG.CREW.water;
    let upkeepFood = CONFIG.CREW.food;

    // Module effects
    for (const mod of Object.values(this.state.modules)) {
      // damaged modules still cost upkeep but produce nothing; paused ones cost nothing
      if (mod.status === "active" || mod.status === "damaged") {
        upkeepEnergy += mod.def.upkeep.energy;
        upkeepWater += mod.def.upkeep.water;
      }
    }
    // Story camps get crew water and food by supply hopper, so slow play can never starve them
    if (isStoryChapter(this.state.missionMode)) {
      upkeepWater = 0;
      upkeepFood = 0;
    }

    // Food production from Farm B
    let foodProduced = 0;
    if (
      this.state.modules.B.status === "active" &&
      this.state.water >= upkeepWater &&
      this.state.energy + solarEnergy >= upkeepEnergy
    ) {
      foodProduced = CONFIG.MODULES.B.foodPerDay;
    }

    // Apply local colony resources
    this.state.energy = Math.max(0, this.state.energy + solarEnergy - upkeepEnergy);
    if (this.state.modules.B.status === "active" && foodProduced === 0) {
      this.addToast("Farm B idle: not enough power or water.", "warn");
    }

    this.state.water = Math.max(0, this.state.water - upkeepWater);
    this.state.food = Math.max(0, this.state.food + foodProduced - upkeepFood);

    // Advance building modules
    for (const mod of Object.values(this.state.modules)) {
      if (mod.status === "building") {
        mod.daysLeft -= 1;
        if (mod.daysLeft <= 0) {
          mod.status = "active";
          this.state.stats.modulesBuilt += 1;
          sound.playMilestone();
          this.addToast(
            `${mod.def.displayName} online! Daily cost: ${mod.def.upkeep.energy}E, ${mod.def.upkeep.water}W.`,
            "good",
          );
          if (mod.id === "B") {
            this.addToast(
              "Use the Farm control panel (E) to pause it when power or water runs low.",
              "info",
            );
            this.showTip(
              "farm_pause",
              "Farm B costs 6E and 2W a day. Press E at its control panel to pause it when supplies run low.",
            );
          }
          sound.speak(`${mod.def.displayName} construction complete and online.`);
          this.triggerFact(`module_${mod.id}`);

          // Unlock next module
          if (mod.id === "A") {
            this.state.modules.B.status = "available";
            if (this.state.missionMode === "chapter1" && !this.state.chapter1Completed) {
              this.state.stage = "enter_airlock";
              this.showTip(
                "enter_airlock",
                "Habitat A is pressurized! Walk to its golden airlock door, press E to cycle it (6s), and step inside to complete Chapter 1.",
              );
            } else {
              this.state.stage = "build_B";
            }
            this.saveCheckpoint(true);
          } else if (mod.id === "B") {
            this.state.modules.C.status = "available";
            this.state.stage = "build_C";
            this.saveCheckpoint(true);
          } else if (mod.id === "C") {
            this.addToast(
              "Research Lab C online. Now get all four network bases running together.",
              "good",
            );
            this.saveCheckpoint(true);
          }
        }
      }
    }

    // Four-base network daily flow
    this.processNetwork();

    // Energy cap (after solar + network generation)
    const activeModCount = Object.values(this.state.modules).filter(
      (m) => m.status === "active",
    ).length;
    const energyCap = CONFIG.ENERGY_CAP_BASE + activeModCount * CONFIG.ENERGY_CAP_PER_MODULE;
    if (this.state.energy > energyCap) {
      this.state.energy = energyCap;
      if (shouldNotifyOverflow(this.state.day, this.state.lastOverflowDay)) {
        this.state.lastOverflowDay = this.state.day;
        this.addToast("Battery array at maximum capacity. Overflow power wasted.", "info");
      }
    }

    // Daily delta tracking (includes active network flow)
    const net = this.state.networkOpen ? this.state.networkFlow : { energy: 0, water: 0, food: 0 };
    this.state.dailyEnergyDelta = Math.round((solarEnergy - upkeepEnergy + net.energy) * 10) / 10;
    this.state.dailyWaterDelta = Math.round((-upkeepWater + net.water) * 10) / 10;
    this.state.dailyFoodDelta = Math.round((foodProduced - upkeepFood + net.food) * 10) / 10;

    if (this.state.water <= RULES.LOW_WATER_TIP_DAYS * CONFIG.CREW.water && this.state.water > 0) {
      this.showTip(
        "low_water",
        "Water is under 15 days of supply. Take the rover out for an ice expedition now.",
      );
    }

    // Audio announcement on landmark days
    if (this.state.day % 10 === 0) {
      sound.speak(`Mission Day ${this.state.day}. Base systems operational.`);
    }

    // Shortage check
    if (this.state.water <= 0 || this.state.food <= 0) {
      this.state.shortageDays += 1;
      this.state.shortageResource =
        this.state.water <= 0 && this.state.food <= 0
          ? "Water & Food"
          : this.state.water <= 0
            ? "Water"
            : "Food";
      sound.playWarning();
      sound.speak(`Warning: ${this.state.shortageResource} critical shortage!`, true);
      this.addToast(
        `CRITICAL: ${this.state.shortageResource} exhausted (${this.state.shortageDays}/${CONFIG.SHORTAGE_DAYS_TO_LOSE} days)`,
        "warn",
      );
      if (this.state.shortageDays >= CONFIG.SHORTAGE_DAYS_TO_LOSE) {
        this.onDefeat(`Colony life support failed: ${this.state.shortageResource} shortage.`);
        return;
      }
    } else {
      this.state.shortageDays = 0;
      this.state.shortageResource = null;
    }

    // Four-base network win check
    if (this.state.networkOpen && networkWon(this.state.networkStreak)) {
      this.onVictory();
      return;
    }

    // Day 90 timeout
    if (
      !isStoryChapter(this.state.missionMode) &&
      missionExpired(this.state.day, CONFIG.TOTAL_DAYS)
    ) {
      this.onDefeat("90-day Artemis mission window expired.");
      return;
    }
  }

  private onOxygenFailure() {
    this.state.stats.oxygenDeaths += 1;
    sound.playWarning();
    // Child-friendly emergency rescue beacon: teleport astronaut to shelter with O2 refilled and apply supply cost
    const penalty = applyOxygenRescuePenalty(this.state.food, this.state.water);
    this.state.food = penalty.food;
    this.state.water = penalty.water;
    this.state.player.inRover = false;
    this.state.story.aiming = false;
    sound.stopRoverEngine();
    if (this.state.modules.A.status === "active") {
      this.state.airlock.open = true;
      this.state.airlock.opening = 0;
      this.state.player.x = HAB_DOOR.x;
      this.state.player.z = HAB_DOOR.z;
      this.state.player.oxygenSource = "airlock";
    } else {
      this.state.player.x = LANDER_POS.x;
      this.state.player.z = LANDER_POS.z + 4;
      this.state.player.oxygenSource =
        this.state.modules.A.status === "damaged" ? "none" : "lander";
    }
    this.state.player.oxygen = CONFIG.OXYGEN.max;
    this.state.player.insideAirlock = this.state.player.oxygenSource !== "none";
    this.state.playerTeleport += 1;
    sound.speak(
      `Suit oxygen hit zero! Emergency rescue drone returned you to ${this.campName()} using backup water and rations.`,
      true,
    );
    this.addToast(
      `Emergency O2 rescue to base (-${CONFIG.OXYGEN.deathPenalty.water}W, -${CONFIG.OXYGEN.deathPenalty.food}F). Watch your walk-back timer!`,
      "warn",
    );
    this.showTip(
      "o2_rescue",
      "Real astronauts turn back before hitting 25% suit oxygen. Emergency rescues use extra cooling water and rations.",
    );
    this.notify();
  }

  private onChapter1Victory() {
    this.pauseLoop();
    this.state.chapter1Completed = true;
    this.state.campaignDone = markChapterComplete("chapter1");
    this.state.phase = "won";
    this.state.stage = "done";
    this.state.stats.daysTaken = this.state.day;
    const res = addHallEntry(loadHall(), {
      days: this.state.day,
      site: `${this.state.selectedSite.name} (Ch.1)`,
      date: new Date().toISOString().slice(0, 10),
    });
    this.state.hall = res.list;
    this.state.hallRank = res.rank;
    try {
      localStorage.setItem(HALL_KEY, JSON.stringify(res.list));
    } catch {
      // Ignore storage quota / private-mode errors
    }
    clearCheckpointFromStorage();
    this.state.hasCheckpoint = false;
    this.state.checkpointInfo = null;
    sound.playVictory();
    sound.speak(
      "Camp Sirius is pressurized and operational at Nobile Rim 1! Chapter 1 complete!",
      true,
    );
    this.triggerFact("result_win");
    this.notify();
  }

  /** Continues from Chapter 1 victory into the full 4-base lunar network sandbox. */
  public continueAfterChapter1() {
    if (!this.state.chapter1Completed) return;
    sound.playMilestone();
    this.state.missionMode = "full";
    this.state.phase = "playing";
    this.state.menuOpen = false;
    this.state.stage = this.state.modules.B.status === "active" ? "build_C" : "build_B";
    this.syncNetworkUnlock();
    this.saveCheckpoint(true);
    this.addToast(
      "Continuing expedition! Build Farm B, Lab C, and the four-base lunar network.",
      "good",
    );
    this.startLoop();
    this.notify();
  }

  private onVictory() {
    this.pauseLoop();
    this.state.phase = "won";
    this.state.stage = "done";
    this.state.stats.daysTaken = this.state.day;
    const res = addHallEntry(loadHall(), {
      days: this.state.day,
      site: this.state.selectedSite.name,
      date: new Date().toISOString().slice(0, 10),
    });
    this.state.hall = res.list;
    this.state.hallRank = res.rank;
    try {
      localStorage.setItem(HALL_KEY, JSON.stringify(res.list));
    } catch {
      // Ignore storage quota / private-mode errors
    }
    sound.playVictory();
    sound.speak(
      "Houston, we did it. All four bases are running together. Permanent lunar network successfully established!",
      true,
    );
    this.triggerFact("result_win");
    this.notify();
  }

  private onDefeat(reason: string) {
    this.pauseLoop();
    this.state.phase = "lost";
    this.state.stats.daysTaken = this.state.day;
    this.state.hall = loadHall();
    this.state.hallRank = 0;
    sound.playDefeat();
    this.addToast(`Mission Failed: ${reason}`, "warn");
    this.notify();
  }

  // User Actions with Audio Feedback
  public completeOrientation() {
    if (this.state.siteOriented) return;
    sound.playMilestone();
    this.state.siteOriented = true;
    if (this.state.stage === "orient") {
      this.state.stage =
        remainingStarterPanels(this.state.panelsInstalled) > 0
          ? "panels"
          : this.state.solarAligned
            ? "board_rover"
            : "align_panels";
    }
    sound.speak(
      "Camp Sirius radar calibrated. Nobile Rim 1 catches low polar sunlight while nearby dark craters hold candidate ice. Deploy three solar arrays next.",
    );
    this.addToast(
      "Site orientation complete! Solar Field is west (-X); Rover & Refinery Dock are east (+X).",
      "good",
    );
    this.showTip(
      "orient_done",
      "Walk west to the Solar Field Array and hold E for 2 seconds to deploy 3 solar panels.",
    );
    this.saveCheckpoint(true);
    this.notify();
  }

  public alignSolarArrays() {
    if (this.state.solarAligned) {
      this.addToast("Solar sun-tracker is already locked to the polar horizon.", "info");
      return;
    }
    if (this.state.panelsInstalled <= 0) {
      sound.playWarning();
      this.addToast("Deploy at least 1 solar panel before aligning the sun-tracker.", "warn");
      return;
    }
    sound.playMilestone();
    this.state.solarAligned = true;
    this.triggerFact("solar_alignment");
    sound.speak(
      "Solar arrays tilted to track the grazing polar sun! Electricity output increased from 70% to 100%.",
    );
    this.addToast("Solar arrays aligned with polar horizon (+30% solar output)!", "good");
    if (this.state.stage === "align_panels") {
      this.state.stage = "board_rover";
    }
    this.saveCheckpoint(true);
    this.notify();
  }

  public installPanel() {
    if (this.state.panelsInstalledToday >= CONFIG.PANELS_PER_DAY) {
      sound.playWarning();
      this.addToast(
        `Daily panel deployment limit (${CONFIG.PANELS_PER_DAY}) reached. Resume tomorrow.`,
        "warn",
      );
      return;
    }
    if (this.state.panelsInstalled >= CONFIG.PANELS_TOTAL) {
      this.addToast("All solar panels have been installed.", "info");
      return;
    }

    sound.playServo();
    this.state.panelsInstalled += 1;
    this.state.panelsInstalledToday += 1;
    this.state.stats.panelsBuilt += 1;
    this.addToast(
      `Solar panel array deployed (${this.state.panelsInstalled}/${CONFIG.PANELS_TOTAL})`,
      "good",
    );

    if (this.state.panelsInstalled === 1) {
      sound.speak("First solar array deployed and generating power.");
      this.triggerFact("first_panel");
    }

    if (
      remainingStarterPanels(this.state.panelsInstalled) === 0 &&
      (this.state.stage === "panels" || this.state.stage === "orient")
    ) {
      this.state.siteOriented = true;
      if (!this.state.solarAligned) {
        this.state.stage = "align_panels";
        sound.speak(
          "Three panels deployed, but flat panels miss the low polar sun. Align the Sun-Tracker Console next.",
        );
        this.showTip(
          "align_tip",
          "At the South Pole the Sun skims the horizon. Hold E at the Sun-Tracker Console to boost solar power from 70% to 100%!",
        );
      } else {
        this.state.stage = "board_rover";
        sound.speak("Solar array online. Board the lunar rover to begin harvesting water ice.");
      }
      this.saveCheckpoint(true);
    }
    this.syncNetworkUnlock();
    this.notify();
  }

  public startBuilding(id: ModuleId) {
    const mod = this.state.modules[id];
    if (!mod || mod.status !== "available") return;

    if (this.state.energy < mod.def.cost.energy || this.state.water < mod.def.cost.water) {
      sound.playWarning();
      this.addToast(
        `Insufficient resources: ${mod.def.cost.energy} Energy, ${mod.def.cost.water} Water required`,
        "warn",
      );
      return;
    }

    sound.playClick();
    this.state.energy -= mod.def.cost.energy;
    this.state.water -= mod.def.cost.water;
    mod.status = "building";
    sound.playConstruction();
    mod.daysLeft = mod.def.buildDays;
    sound.speak(`Foundation laid for ${mod.def.displayName}. Construction underway.`);
    this.addToast(
      `${mod.def.displayName} construction initiated (${mod.def.buildDays} days required)`,
      "good",
    );
    this.notify();
  }

  public fillIce(siteId: number) {
    if (this.state.missionMode === "chapter4" && !this.state.story.roverUpgraded) {
      sound.playWarning();
      this.addToast("Too dark and cold: fit lights & heaters at the Upgrade Bay first.", "warn");
      return;
    }
    if (this.state.activeStorm) {
      sound.playWarning();
      this.addToast("Radiation storm: ice mining suspended until it passes.", "warn");
      return;
    }
    const site = this.state.iceSites.find((s) => s.id === siteId);
    if (!site || site.deposit <= 0) {
      sound.playWarning();
      this.addToast("This crater ice deposit is completely depleted.", "warn");
      return;
    }

    const space = CONFIG.ROVER.tankMax - this.state.rover.waterTank;
    if (space <= 0) {
      sound.playWarning();
      this.addToast(`Rover water tank is full (${CONFIG.ROVER.tankMax}W). Return to base.`, "info");
      return;
    }

    sound.playIceDrill();
    const harvest = Math.min(space, site.deposit);
    site.deposit -= harvest;
    this.state.rover.waterTank += harvest;
    this.addToast(
      `Harvested ${harvest}W of water ice! (Rover: ${this.state.rover.waterTank}/${CONFIG.ROVER.tankMax}W)`,
      "good",
    );

    if (this.state.stage === "find_ice") {
      this.state.stage = "unload";
      sound.speak("Ice harvested. Return to base to refine water.");
    }
    if (
      currentStep(STORY_CHAPTERS.chapter4, this.state.story)?.kind === "harvest" &&
      this.state.missionMode === "chapter4" &&
      CABEUS_ICE.every(
        (ice) => (this.state.iceSites.find((s) => s.id === ice.id)?.deposit ?? 0) <= 0,
      )
    ) {
      this.advanceStory();
    }
    this.notify();
  }

  public unloadWater() {
    if (this.state.rover.waterTank <= 0) {
      this.addToast("No water in rover tank to unload.", "warn");
      return;
    }

    const water = this.state.rover.waterTank;
    const energyRequired = water * CONFIG.WATER_PROCESS_ENERGY_PER_W;

    if (this.state.energy < energyRequired) {
      const canProcess = Math.floor(this.state.energy / CONFIG.WATER_PROCESS_ENERGY_PER_W);
      if (canProcess <= 0) {
        sound.playWarning();
        this.addToast(
          `Insufficient base energy for water refinement (Req: ${Math.ceil(energyRequired)}E).`,
          "warn",
        );
        return;
      }
      sound.playServo();
      this.state.energy -= canProcess * CONFIG.WATER_PROCESS_ENERGY_PER_W;
      this.state.water += canProcess;
      this.state.stats.waterDelivered += canProcess;
      this.triggerFact("first_water");
      this.state.rover.waterTank -= canProcess;
      this.state.stats.waterTrips += 1;
      this.addToast(
        `Refined ${canProcess}W water due to energy limit. Remainder stored in rover.`,
        "warn",
      );
      this.onStoryRefined();
    } else {
      sound.playMilestone();
      this.state.energy -= energyRequired;
      this.state.water += water;
      this.state.stats.waterDelivered += water;
      this.triggerFact("first_water");
      this.state.rover.waterTank = 0;
      this.state.stats.waterTrips += 1;
      sound.speak(`Refined ${water} units of water into base supply.`);
      this.addToast(`Refined and unloaded ${water}W water!`, "good");

      if (this.state.stage === "unload") {
        this.state.stage = "build_A";
        sound.speak("Sufficient water stored. Proceed with Habitat A construction.");
        this.showTip(
          "power_decision",
          "Habitat A needs 60E and 20W. Refining more water right now spends 0.35E per W—save 60E for Habitat A first!",
        );
      }
      this.onStoryRefined();
      this.saveCheckpoint(true);
    }
    this.notify();
  }

  private onStoryRefined() {
    const def = this.storyDef();
    if (def && currentStep(def, this.state.story)?.kind === "refine") this.advanceStory();
  }

  public repairRover() {
    if (this.state.rover.damage <= 0) {
      this.addToast("Rover is in optimal condition.", "info");
      return;
    }
    if (this.state.energy < CONFIG.ROVER.repairEnergy) {
      sound.playWarning();
      this.addToast(`Repair requires ${CONFIG.ROVER.repairEnergy} Energy.`, "warn");
      return;
    }

    sound.playRepair();
    this.state.energy -= CONFIG.ROVER.repairEnergy;
    this.state.rover.damage = 0;
    this.state.stats.repairs += 1;
    sound.speak("Rover repairs complete. Systems green.");
    this.addToast("Rover repaired successfully!", "good");
    this.notify();
  }

  /** Board if on foot and near the rover; exit if already driving (rover stays parked). */
  public toggleRoverBoard() {
    if (this.state.player.inRover) this.exitRover();
    else this.boardRover();
  }

  /** Climb into the rover only when standing next to it. */
  public boardRover() {
    if (this.state.player.inRover) return;
    const dist = Math.hypot(
      this.state.player.x - this.state.rover.x,
      this.state.player.z - this.state.rover.z,
    );
    if (dist > 8) {
      this.addToast("Walk up to the Lunar Rover to board.", "info");
      return;
    }
    sound.playClick();
    this.state.player.inRover = true;
    this.state.player.insideAirlock = false;
    this.state.player.x = this.state.rover.x;
    this.state.player.z = this.state.rover.z;
    this.state.player.rotation = this.state.rover.rotation;
    sound.speak("Rover systems active. Use WASD to steer, Space to exit, Shift for booster.");
    this.addToast("Boarded Rover. WASD to drive, Space to exit, Shift for booster", "info");
    if (this.state.stage === "board_rover") {
      this.state.stage = "find_ice";
    }
    this.showTip(
      "first_trip",
      "Follow the radar to the nearest ice. Check the battery line: you need enough charge to get back.",
    );
    this.scheduleTimeout(() => this.triggerFact("gravity"), 8000);
    this.notify();
  }

  /**
   * Leave the rover where it is. Player steps out beside it; the vehicle does not
   * snap back to base — walk back and press E to board again.
   */
  public exitRover() {
    if (!this.state.player.inRover) return;
    sound.playClick();
    sound.stopRoverEngine();
    const rx = this.state.rover.x;
    const rz = this.state.rover.z;
    this.state.rover.speed = 0;
    this.state.rover.isBoosting = false;
    this.state.rover.boostTime = 0;
    // Keep rover parked at the exact exit coordinates
    this.state.rover.x = rx;
    this.state.rover.z = rz;
    this.state.player.inRover = false;
    this.state.player.x = rx + 2.5;
    this.state.player.z = rz;
    this.state.playerTeleport += 1;
    this.addToast("Exited rover. It stays here — walk back and press E to board.", "info");
    this.notify();
  }

  public triggerFact(id: string) {
    if (this.state.seenFacts.includes(id)) return;
    const fact = CONFIG.FACTS.find((f) => f.id === id);
    if (!fact) return;
    this.state.seenFacts.push(id);
    if (!this.state.showFacts) return;
    if (this.state.activeFact || this.factGap < RULES.FACT_SPACING) this.factQueue.push(fact);
    else this.showFact(fact);
  }

  private showFact(fact: FactDef) {
    sound.playClick();
    this.state.activeFact = fact;
    this.factTimer = 0;
    this.notify();
  }

  public closeFact(auto = false) {
    if (!auto) sound.playClick();
    this.state.activeFact = null;
    this.factGap = 0;
    this.notify();
  }

  public showTip(id: string, text: string) {
    if (this.state.seenTips.includes(id)) return;
    this.state.seenTips.push(id);
    if (this.state.showTips) {
      this.state.activeTip = text;
      this.notify();
    }
  }

  // ---------- Story chapters 2–4 ----------
  public campName(): string {
    return this.storyDef()?.campName ?? CONFIG.CHAPTER_1.campName;
  }

  /** Story prompt available where the player stands (findAction wraps it into a key prompt). */
  public storyAction(): StoryAction | null {
    const def = this.storyDef();
    if (!def || this.state.phase !== "playing") return null;
    return storyActionAt(def, this.state.story, this.storyCtx());
  }

  /** Beacon / radar target for the current story step (null when aiming, launching, or done). */
  public storyTarget(): Point | null {
    const def = this.storyDef();
    const s = this.state.story;
    if (!def || s.aiming || s.launchTimer >= 0) return null;
    return storyTarget(def, s, this.storyCtx());
  }

  private storyCtx(): StoryCtx {
    const st = this.state;
    return {
      px: st.player.x,
      pz: st.player.z,
      rx: st.rover.x,
      rz: st.rover.z,
      inRover: st.player.inRover,
      energy: st.energy,
      iceSites: st.iceSites,
    };
  }

  public performStoryAction(a: StoryAction) {
    const def = this.storyDef();
    const st = this.state;
    const step = def ? currentStep(def, st.story) : null;
    if (!def || !step || st.phase !== "playing") return;
    const s = st.story;
    switch (a.id) {
      case "survey": {
        if (step.kind !== "survey" || s.surveyed.includes(a.index)) return;
        s.surveyed.push(a.index);
        sound.playServo();
        const reading = MOUTON_READINGS[a.index] ?? 0;
        const total = step.targets?.length ?? 0;
        this.addToast(
          `Survey mast ${a.index + 1}: ${reading}% sunlight (${s.surveyed.length}/${total})`,
          "good",
        );
        if (s.surveyed.length >= total) {
          const best = MOUTON_READINGS.indexOf(Math.max(...MOUTON_READINGS));
          this.addToast(
            `Brightest spot: mast ${best + 1} on Helios Knoll (${MOUTON_READINGS[best]}%).`,
            "good",
          );
          this.advanceStory();
        }
        break;
      }
      case "build": {
        const stage = step.stages?.[s.stagesBuilt];
        if (step.kind !== "build" || !stage || a.index !== s.stagesBuilt) return;
        if (st.energy < stage.energy) {
          sound.playWarning();
          this.addToast(`${stage.name} needs ${stage.energy}E.`, "warn");
          return;
        }
        st.energy -= stage.energy;
        s.stagesBuilt += 1;
        if (!s.built.includes(stage.structure)) s.built.push(stage.structure);
        st.stats.modulesBuilt += 1;
        sound.playConstruction();
        this.addToast(`${stage.name} complete (${s.stagesBuilt}/${step.stages!.length}).`, "good");
        if (s.stagesBuilt >= step.stages!.length) {
          if (step.effect === "reveal_ice") this.revealStoryIce();
          if (step.effect === "rover_upgrade") this.upgradeRover();
          this.advanceStory();
        } else {
          this.saveCheckpoint(true);
        }
        break;
      }
      case "load_packs": {
        if (step.kind !== "packs") return;
        const n = Math.min(packsReady(s), STORY.ROVER_PACK_CAP - s.packsCarried);
        if (n <= 0) return;
        s.packsCarried += n;
        sound.playServo();
        this.addToast(
          `Loaded ${n} energy pack${n > 1 ? "s" : ""} (rover ${s.packsCarried}/${STORY.ROVER_PACK_CAP}).`,
          "good",
        );
        break;
      }
      case "unload_packs": {
        if (step.kind !== "packs" || s.packsCarried <= 0) return;
        s.packsLoaded += s.packsCarried;
        s.packsCarried = 0;
        sound.playMilestone();
        this.addToast(
          `Cargo Hopper: ${s.packsLoaded}/${STORY.PACK_TOTAL} energy packs loaded.`,
          "good",
        );
        if (!s.flareDone && s.packsLoaded < STORY.PACK_TOTAL) this.startFlare();
        if (s.packsLoaded >= STORY.PACK_TOTAL) this.advanceStory();
        else this.saveCheckpoint(true);
        break;
      }
      case "start_aim": {
        if (step.kind !== "aim") return;
        s.aiming = true;
        sound.playClick();
        this.showTip(
          "aim_controls",
          "A/D turns the dish, W/S tilts it. Hold E when the signal reads 90% or more.",
        );
        break;
      }
      case "launch": {
        if (step.kind !== "launch" || s.launchTimer >= 0) return;
        s.launchTimer = 0;
        sound.playLaunch();
        sound.speak(`Cargo hopper launch! Next stop: ${def.launchTarget}.`, true);
        this.addToast(`Cargo hopper launched to ${def.launchTarget}!`, "good");
        break;
      }
      default:
        return;
    }
    this.notify();
  }

  private advanceStory() {
    const def = this.storyDef();
    if (!def) return;
    const s = this.state.story;
    s.stepIndex += 1;
    s.stagesBuilt = 0;
    const next = currentStep(def, s);
    if (!next) {
      this.onStoryVictory(def);
      return;
    }
    sound.playMilestone();
    sound.speak(next.voice);
    if (next.tip) this.showTip(`story_${next.id}`, next.tip);
    if (next.factId) this.triggerFact(next.factId);
    if (next.kind === "shelter") {
      s.stormCountdown = STORY.STORM_WARNING_SECONDS;
      this.state.eventBanner = {
        kind: "storm",
        phase: "warn",
        title: `DONKI ALERT: solar storm arrives in ${STORY.STORM_WARNING_SECONDS}s`,
        edu: "Get inside Habitat A's airlock. Its walls shield you from solar particles.",
      };
      sound.playWarning();
    }
    this.saveCheckpoint(true);
    this.notify();
  }

  private revealStoryIce() {
    const st = this.state;
    st.story.iceRevealed = true;
    for (const ice of CABEUS_ICE) {
      if (!st.iceSites.some((s) => s.id === ice.id)) st.iceSites.push({ ...ice });
    }
    this.addToast("Ground radar found 3 ice deposits on the dark crater floor!", "good");
  }

  private upgradeRover() {
    const st = this.state;
    if (st.story.roverUpgraded) return;
    st.story.roverUpgraded = true;
    st.rover.batteryMax += STORY.ROVER_UPGRADE_BONUS;
    st.rover.battery = st.rover.batteryMax;
    this.addToast(`Rover upgraded: headlights, heaters, battery ${st.rover.batteryMax}E.`, "good");
  }

  private startFlare() {
    const s = this.state.story;
    s.flareDone = true;
    s.flareTimer = STORY.FLARE_SECONDS;
    this.state.activeStorm = true;
    this.state.eventBanner = {
      kind: "storm",
      phase: "active",
      title: "DONKI: solar flare! Tower charging slowed for a few seconds",
      edu: "Flare X-rays reach the Moon in about 8 minutes, so the tower throttles charging to protect its electronics.",
    };
    sound.playWarning();
    this.triggerFact("ch2_flare");
  }

  private stepStory(dt: number) {
    const def = this.storyDef();
    const st = this.state;
    const s = st.story;
    const step = def ? currentStep(def, s) : null;
    if (!def || !step) return;

    if (s.launchTimer >= 0) {
      s.launchTimer += dt;
      if (s.launchTimer >= STORY.LAUNCH_SECONDS) this.onStoryVictory(def);
      return;
    }

    if (s.flareTimer > 0) {
      s.flareTimer = Math.max(0, s.flareTimer - dt);
      if (s.flareTimer === 0) {
        st.activeStorm = false;
        st.eventBanner = null;
        this.addToast("Solar flare over. Tower charging back to full speed.", "good");
      }
    }

    if (step.kind === "reach" && step.target) {
      const x = st.player.inRover ? st.rover.x : st.player.x;
      const z = st.player.inRover ? st.rover.z : st.player.z;
      if (Math.hypot(x - step.target.x, z - step.target.z) < step.radius) this.advanceStory();
      return;
    }

    if (step.kind === "packs" && s.packsMade < STORY.PACK_TOTAL) {
      s.packTimer += dt * (s.flareTimer > 0 ? 0.5 : 1);
      if (s.packTimer >= STORY.PACK_SECONDS) {
        s.packTimer = 0;
        s.packsMade += 1;
        sound.playChargeFull();
      }
      return;
    }

    if (step.kind === "shelter") {
      if (s.stormCountdown > 0) {
        const before = Math.ceil(s.stormCountdown);
        s.stormCountdown -= dt;
        if (st.eventBanner && Math.ceil(s.stormCountdown) !== before) {
          st.eventBanner.title = `DONKI ALERT: solar storm arrives in ${Math.max(0, Math.ceil(s.stormCountdown))}s`;
        }
        if (s.stormCountdown <= 0) {
          s.stormCountdown = 0;
          s.stormTimer = STORY.STORM_SECONDS;
          st.activeStorm = true;
          st.eventBanner = {
            kind: "storm",
            phase: "active",
            title: "SOLAR STORM: stay inside the airlock until it passes",
            edu: "No thick air or global magnetic field protects the lunar surface from solar particles.",
          };
          sound.playWarning();
          sound.speak(
            st.player.insideAirlock
              ? "Storm arriving. You are sheltered. Stay put."
              : "Storm arriving! Get inside the airlock now!",
            true,
          );
        }
        return;
      }
      if (s.stormTimer > 0) {
        s.stormTimer = Math.max(0, s.stormTimer - dt);
        if (!st.player.insideAirlock) {
          s.stormDose += dt;
          this.stormWarnTimer -= dt;
          if (this.stormWarnTimer <= 0) {
            this.stormWarnTimer = 5;
            sound.playWarning();
            this.addToast("Radiation exposure! Get inside the Habitat A airlock.", "warn");
          }
        }
        if (s.stormTimer === 0) {
          st.activeStorm = false;
          st.eventBanner = null;
          const dose = Math.round(s.stormDose);
          this.addToast(
            dose > 0
              ? `Storm passed. You spent ${dose}s outside: next time shelter sooner!`
              : "Storm passed. Your crew stayed safely sheltered!",
            dose > 0 ? "warn" : "good",
          );
          this.advanceStory();
        }
      }
    }
  }

  public aimSignal(): number {
    const e = EARTH_DIRECTION.malapert;
    return antennaSignal(this.state.story.aimYaw, this.state.story.aimPitch, e.yaw, e.pitch);
  }

  /** Steers the summit dish while aiming (radians). */
  public adjustAim(dYaw: number, dPitch: number) {
    const s = this.state.story;
    if (!s.aiming) return;
    s.aimYaw = Math.atan2(Math.sin(s.aimYaw + dYaw), Math.cos(s.aimYaw + dYaw));
    s.aimPitch = Math.max(0, Math.min(STORY.AIM_PITCH_MAX, s.aimPitch + dPitch));
  }

  public stopAiming() {
    if (!this.state.story.aiming) return;
    this.state.story.aiming = false;
    sound.playClick();
    this.notify();
  }

  public lockAntenna() {
    const s = this.state.story;
    const def = this.storyDef();
    if (!def || !s.aiming || currentStep(def, s)?.kind !== "aim") return;
    if (this.aimSignal() < STORY.AIM_LOCK_SIGNAL) {
      sound.playWarning();
      this.addToast(`Signal too weak (${this.aimSignal()}%). Aim closer to Earth.`, "warn");
      return;
    }
    s.aiming = false;
    s.linkLocked = true;
    if (!s.built.includes("earth_link")) s.built.push("earth_link");
    this.addToast(`Earth link locked at ${this.aimSignal()}% signal!`, "good");
    this.advanceStory();
  }

  private onStoryVictory(def: StoryChapterDef) {
    const st = this.state;
    this.pauseLoop();
    st.phase = "won";
    st.stage = "done";
    st.activeStorm = false;
    st.eventBanner = null;
    st.story.aiming = false;
    st.stats.daysTaken = st.day;
    st.campaignDone = markChapterComplete(def.id);
    const res = addHallEntry(loadHall(), {
      days: st.day,
      site: `${def.campName} (Ch.${def.number})`,
      date: new Date().toISOString().slice(0, 10),
    });
    st.hall = res.list;
    st.hallRank = res.rank;
    try {
      localStorage.setItem(HALL_KEY, JSON.stringify(res.list));
    } catch {
      // Ignore storage quota / private-mode errors
    }
    clearCheckpointFromStorage();
    st.hasCheckpoint = false;
    st.checkpointInfo = null;
    sound.playVictory();
    sound.speak(`${def.winTitle} ${def.winText}`, true);
    this.triggerFact(def.id === "chapter4" ? "ch4_finale" : "result_win");
    this.notify();
  }

  // ---------- Four-base network ----------
  private syncNetworkUnlock() {
    const st = this.state;
    if (st.missionMode !== "full") {
      st.networkOpen = false;
      return;
    }
    const wasOpen = st.networkOpen;
    st.networkOpen = networkUnlocked(
      ["active", "damaged"].includes(st.modules.A.status),
      st.panelsInstalled,
    );
    if (st.networkOpen && !wasOpen) {
      sound.playMilestone();
      this.addToast(
        "Network unlocked: four outpost sites are marked on the radar. Drive out and press E at each beacon.",
        "good",
      );
      this.showTip(
        "network",
        "Each outpost has a job: A talks to Earth, B makes power, C makes food and water, D explores. Get all four running together for 5 days to win.",
      );
    }
  }

  private processNetwork() {
    const st = this.state;
    this.syncNetworkUnlock();
    if (!st.networkOpen) {
      st.networkFlow = { energy: 0, water: 0, food: 0 };
      return;
    }
    // geomagnetic storm: every 20 days the Earth link drops unless the relay backup exists
    if (st.day % 20 === 15 && st.bases.some((b) => b.built > 0)) {
      if (commBackup(st.bases)) {
        this.addToast("Geomagnetic storm hit Earth link. Relay backup kept comms up.", "good");
      } else {
        st.commLinkDown = 2;
        this.addToast(
          "Geomagnetic storm: Earth link down for 2 days. Build the Relay Station as a backup.",
          "warn",
        );
      }
    }
    const flow = dailyFlow(st.bases, st.energy);
    if (st.commLinkDown > 0) {
      flow.online["COMM"] = false;
      st.commLinkDown -= 1;
    }
    st.baseOnline = flow.online;
    for (const b of st.bases) {
      b.online = !!flow.online[b.id];
    }
    st.networkFlow = { energy: flow.energyDelta, water: flow.water, food: flow.food };
    st.energy = Math.max(0, st.energy + flow.energyDelta);
    st.water += flow.water;
    st.food += flow.food;
    for (const b of BASES) {
      const bs = st.bases.find((x) => x.id === b.id);
      if (bs && bs.built > 0 && !flow.online[b.id]) {
        this.addToast(`${baseDef(b.id).label} offline today.`, "warn");
      }
    }
    st.networkStreak = nextStreak(st.networkStreak, allRunning(st.bases, flow.online));
    if (st.networkStreak > 0) {
      this.addToast(`Network running: day ${st.networkStreak}/${NETWORK.WIN_STREAK_DAYS}`, "good");
    }
  }

  public buildFacility(id: BaseId) {
    const st = this.state;
    this.syncNetworkUnlock();
    const b = st.bases.find((x) => x.id === id);
    if (!b || !st.networkOpen) return;
    const f = nextFacility(b);
    if (!f) return;
    if (!canBuild(b, st.energy, st.water)) {
      sound.playWarning();
      this.addToast(`${f.name} needs ${f.energy}E and ${f.water}W.`, "warn");
      return;
    }
    st.energy -= f.energy;
    st.water -= f.water;
    b.built += 1;
    st.stats.modulesBuilt += 1;
    sound.playMilestone();
    this.addToast(`${baseDef(id).label}: ${f.name} built (${b.built}/3).`, "good");
    if (id === "EXPLORE" && radarActive(st.bases) && !st.iceSites.some((i) => i.id > 100)) {
      st.iceSites.push(...HIDDEN_ICE.map((i) => ({ ...i })));
      this.addToast("Ground radar found 2 hidden ice deposits. Check the radar.", "good");
    }
    if (id === "EXPLORE" && b.built === 3) {
      st.rover.batteryMax = CONFIG.ROVER.batteryMax + NETWORK.ROVER_BATTERY_BONUS;
      this.addToast(`Rover upgraded: battery ${st.rover.batteryMax}E for longer range.`, "good");
    }
    if (id === "COMM" && b.built === 2) {
      this.addToast("Antenna aligned: storm warnings now come 2 days earlier.", "good");
    }
    if (id === "FOOD" && b.built === 3) {
      this.addToast(
        "Farm built. Press E at the beacon to toggle LED lights (+1 food, +3E per day).",
        "info",
      );
    }
    this.notify();
  }

  public toggleLed() {
    const b = this.state.bases.find((x) => x.id === "FOOD");
    if (!b || b.built < 3) return;
    b.led = !b.led;
    this.addToast(`LED grow lights ${b.led ? "ON (+1 food, +3E/day)" : "OFF"}`, "info");
    this.notify();
  }

  public closeTip() {
    this.state.activeTip = null;
    this.notify();
  }

  public setShowTips(v: boolean) {
    this.state.showTips = v;
    if (!v) this.state.activeTip = null;
    this.notify();
  }

  public setShowFacts(v: boolean) {
    this.state.showFacts = v;
    if (!v) {
      this.state.activeFact = null;
      this.factQueue = [];
    }
    this.notify();
  }

  // ---------- Random events (GDD §4) ----------
  private processEvents() {
    const st = this.state;
    // Story chapters script their own DONKI events in stepStory
    if (isStoryChapter(st.missionMode)) return;
    // Protect tutorial / Chapter 1 early stages from disruptive solar storms & meteor strikes
    if (
      st.missionMode === "chapter1" &&
      !st.chapter1Completed &&
      st.modules.A.status !== "active"
    ) {
      return;
    }
    const day = st.day;
    if (st.activeStorm) {
      st.stormDaysLeft -= 1;
      if (st.stormDaysLeft <= 0) {
        st.activeStorm = false;
        st.eventBanner = null;
        this.addToast("Solar storm has passed. Power output back to normal.", "good");
      }
    }
    if (st.eventBanner?.kind === "meteor" && st.eventBanner.phase === "active") {
      st.eventBanner = null;
    }
    for (const ev of st.events) {
      const lead = warnLeadDays(st.bases, RULES.EVENT_WARN_DAYS);
      if (day === ev.day - lead) {
        const title =
          ev.kind === "storm"
            ? `Solar storm forecast in ${lead} days`
            : `Micrometeor shower expected in ${lead} days`;
        st.eventBanner = {
          kind: ev.kind,
          phase: "warn",
          title,
          edu:
            ev.kind === "storm"
              ? "Solar particles disturb power systems. Stock up energy and stay near shelter."
              : "With no atmosphere, tiny rocks hit the surface at up to 20 km/s.",
        };
        this.addToast(title, "info");
        sound.playWarning();
        this.showTip(
          "first_event",
          "Events show under the Day panel. Grey means coming soon, red means happening now.",
        );
      }
      if (day === ev.day) {
        if (ev.kind === "storm") {
          st.activeStorm = true;
          st.stormDaysLeft = RULES.STORM_DAYS;
          st.eventBanner = {
            kind: "storm",
            phase: "active",
            title: `SOLAR STORM: ${RULES.STORM_DAYS} days. Solar power halved, suit oxygen drains faster.`,
            edu: "There is no air or magnetic field on the Moon to block solar radiation.",
          };
          this.addToast("Solar storm has started!", "warn");
        } else {
          this.meteorStrike();
        }
        sound.playWarning();
      }
    }
  }

  private meteorStrike() {
    const st = this.state;
    const targets = Object.values(st.modules).filter(
      (m) => m.status === "active" || m.status === "paused",
    );
    let what = "";
    if (targets.length && Math.random() < 0.6) {
      const m = targets[Math.floor(Math.random() * targets.length)]!;
      this.damageModule(m.id);
      what = `${m.def.displayName} damaged! Hold R at it to repair (${RULES.MODULE_REPAIR_ENERGY}E).`;
    } else if (st.panelsInstalled > 0) {
      const n = Math.min(
        st.panelsInstalled,
        RULES.METEOR_PANELS_MIN +
          Math.floor(Math.random() * (RULES.METEOR_PANELS_MAX - RULES.METEOR_PANELS_MIN + 1)),
      );
      st.panelsInstalled -= n;
      what = `${n} solar panel${n > 1 ? "s" : ""} destroyed. Reinstall them at the solar field.`;
    } else {
      what = "Impacts nearby, no damage to the base.";
    }
    st.eventBanner = {
      kind: "meteor",
      phase: "active",
      title: `MICROMETEOR IMPACT: ${what}`,
      edu: "Moon bases need regolith shielding because nothing slows meteors down.",
    };
    this.addToast(what, "warn");
    sound.playThud(1);
  }

  public damageModule(id: ModuleId) {
    const m = this.state.modules[id];
    m.status = "damaged";
    if (id === "A") {
      this.state.airlock.open = false;
      this.state.airlock.opening = 0;
      this.doorCloseTimer = 0;
    }
  }

  public repairModule(id: ModuleId) {
    const m = this.state.modules[id];
    if (!m || m.status !== "damaged") return;
    if (this.state.energy < RULES.MODULE_REPAIR_ENERGY) {
      sound.playWarning();
      this.addToast(`Repair needs ${RULES.MODULE_REPAIR_ENERGY} Energy.`, "warn");
      return;
    }
    this.state.energy -= RULES.MODULE_REPAIR_ENERGY;
    m.status = "active";
    this.state.stats.moduleRepairs += 1;
    sound.playRepair();
    this.addToast(`${m.def.displayName} repaired and back online.`, "good");
    this.notify();
  }

  public toggleFarmPause() {
    const m = this.state.modules.B;
    if (m.status === "active") {
      m.status = "paused";
      this.addToast("Farm B on standby. No food, no upkeep.", "info");
    } else if (m.status === "paused") {
      m.status = "active";
      this.addToast("Farm B running again.", "good");
    }
    sound.playClick();
    this.notify();
  }

  public recoverRover() {
    const rv = this.state.rover;
    rv.x = DOCK.x;
    rv.z = DOCK.z;
    rv.rotation = 0;
    rv.speed = 0;
    rv.battery = Math.max(rv.battery, rv.batteryMax * CONFIG.ROVER.recoverBatteryRatio);
    rv.damage = 0;
    rv.isBoosting = false;
    rv.boostTime = 0;
    if (this.state.player.inRover) {
      this.state.player.x = DOCK.x + 2;
      this.state.player.z = DOCK.z;
      this.state.player.inRover = false;
      sound.stopRoverEngine();
    }
    if (this.state.stage === "unload" && rv.waterTank <= 0) {
      this.state.stage = "find_ice";
    }
    this.state.roverTeleport += 1;
    sound.playServo();
    const cargoNote = rv.waterTank > 0 ? ` ${rv.waterTank}W cargo preserved.` : "";
    const pct = Math.round((rv.battery / rv.batteryMax) * 100);
    this.addToast(`Rover recovered to base.${cargoNote} Battery at ${pct}%.`, "info");
    this.notify();
  }

  public openAirlock() {
    if (this.state.modules.A.status !== "active") {
      sound.playWarning();
      this.addToast("Airlock sealed: repair Habitat A before cycling.", "warn");
      return;
    }
    if (this.state.airlock.open || this.state.airlock.opening > 0) return;
    this.state.airlock.opening = 0.001;
    sound.playAirlock();
    this.addToast("Airlock cycling...", "info");
    this.notify();
  }

  public addToast(text: string, kind: "info" | "warn" | "good" = "info") {
    const id = Math.random().toString(36).substring(2, 9);
    this.state.toasts.push({ id, text, kind });
    if (this.state.toasts.length > 3) {
      this.state.toasts.shift();
    }
    this.notify();
    this.scheduleTimeout(() => {
      this.state.toasts = this.state.toasts.filter((t) => t.id !== id);
      this.notify();
    }, 3500);
  }

  public buildCheckpointData(): CheckpointData {
    const st = this.state;
    return {
      version: CHECKPOINT_VERSION,
      savedAt: new Date().toISOString(),
      missionMode: st.missionMode,
      stage: st.stage,
      chapter1Completed: st.chapter1Completed,
      seed: st.seed,
      day: st.day,
      dayTimer: st.dayTimer,
      selectedSiteId: st.selectedSite.id,
      energy: st.energy,
      water: st.water,
      food: st.food,
      panelsInstalled: st.panelsInstalled,
      panelsInstalledToday: st.panelsInstalledToday,
      solarAligned: st.solarAligned,
      siteOriented: st.siteOriented,
      modules: {
        A: { status: st.modules.A.status, daysLeft: st.modules.A.daysLeft },
        B: { status: st.modules.B.status, daysLeft: st.modules.B.daysLeft },
        C: { status: st.modules.C.status, daysLeft: st.modules.C.daysLeft },
      },
      iceSites: st.iceSites.map((s) => ({ ...s })),
      bases: st.bases.map((b) => ({ ...b })),
      networkOpen: st.networkOpen,
      networkStreak: st.networkStreak,
      commLinkDown: st.commLinkDown,
      player: {
        x: st.player.x,
        z: st.player.z,
        rotation: st.player.rotation,
        oxygen: st.player.oxygen,
        inRover: st.player.inRover,
      },
      rover: {
        x: st.rover.x,
        z: st.rover.z,
        rotation: st.rover.rotation,
        battery: st.rover.battery,
        batteryMax: st.rover.batteryMax,
        waterTank: st.rover.waterTank,
        damage: st.rover.damage,
      },
      shortageDays: st.shortageDays,
      shortageResource: st.shortageResource,
      activeStorm: st.activeStorm,
      stormDaysLeft: st.stormDaysLeft,
      seenFacts: [...st.seenFacts],
      seenTips: [...st.seenTips],
      stats: { ...st.stats },
      story: isStoryChapter(st.missionMode)
        ? {
            ...st.story,
            surveyed: [...st.story.surveyed],
            built: [...st.story.built],
            aiming: false,
          }
        : undefined,
    };
  }

  public saveCheckpoint(silent = false): boolean {
    if (this.state.phase !== "playing" && !silent) return false;
    const data = this.buildCheckpointData();
    const ok = saveCheckpointToStorage(data);
    if (ok) {
      this.state.hasCheckpoint = true;
      this.state.checkpointInfo = {
        day: data.day,
        siteName: this.state.selectedSite.name,
        savedAt: data.savedAt,
      };
      if (!silent) {
        sound.playClick();
        this.addToast(
          `Checkpoint saved (Day ${data.day} · ${this.state.selectedSite.name}).`,
          "good",
        );
      }
      this.notify();
    }
    return ok;
  }

  public resumeCheckpoint(): boolean {
    const cp = loadCheckpointFromStorage();
    if (!cp) {
      this.state.hasCheckpoint = false;
      this.state.checkpointInfo = null;
      this.notify();
      return false;
    }
    this.pauseLoop();
    this.clearAllTimeouts();
    const fresh = this.getInitialState(cp.seed);
    const site = findSite(cp.selectedSiteId) ?? fresh.selectedSite;

    fresh.phase = "playing";
    fresh.missionMode = cp.missionMode;
    fresh.chapter1Completed = cp.chapter1Completed;
    fresh.stage = cp.stage;
    fresh.day = cp.day;
    fresh.dayTimer = cp.dayTimer;
    fresh.dayProgress = Math.min(1, cp.dayTimer / CONFIG.DAY_SECONDS);
    fresh.selectedSite = site;
    fresh.energy = cp.energy;
    fresh.water = cp.water;
    fresh.food = cp.food;
    fresh.panelsInstalled = cp.panelsInstalled;
    fresh.panelsInstalledToday = cp.panelsInstalledToday;
    fresh.solarAligned = cp.solarAligned;
    fresh.siteOriented = cp.siteOriented;

    fresh.modules.A.status = cp.modules.A.status;
    fresh.modules.A.daysLeft = cp.modules.A.daysLeft;
    fresh.modules.B.status = cp.modules.B.status;
    fresh.modules.B.daysLeft = cp.modules.B.daysLeft;
    fresh.modules.C.status = cp.modules.C.status;
    fresh.modules.C.daysLeft = cp.modules.C.daysLeft;

    // Positions come from the current map so saves made before a site moved stay reachable
    const iceDefs = [...CONFIG.ICE_SITES, ...HIDDEN_ICE, ...CABEUS_ICE];
    fresh.iceSites = cp.iceSites.map((s) => {
      const def = iceDefs.find((d) => d.id === s.id);
      return def ? { ...s, x: def.x, z: def.z } : { ...s };
    });
    fresh.bases = cp.bases.map((b) => ({ ...b }));
    fresh.baseOnline = Object.fromEntries(cp.bases.map((b) => [b.id, b.online]));
    fresh.networkOpen = cp.networkOpen;
    fresh.networkStreak = cp.networkStreak;
    fresh.commLinkDown = cp.commLinkDown;

    fresh.player.x = cp.player.x;
    fresh.player.z = cp.player.z;
    fresh.player.rotation = cp.player.rotation;
    fresh.player.oxygen = Math.max(25, cp.player.oxygen);
    fresh.player.inRover = cp.player.inRover;

    fresh.rover.x = cp.rover.x;
    fresh.rover.z = cp.rover.z;
    fresh.rover.rotation = cp.rover.rotation;
    fresh.rover.battery = cp.rover.battery;
    fresh.rover.batteryMax = cp.rover.batteryMax;
    fresh.rover.waterTank = cp.rover.waterTank;
    fresh.rover.damage = cp.rover.damage;

    fresh.shortageDays = cp.shortageDays;
    fresh.shortageResource = cp.shortageResource;
    fresh.activeStorm = cp.activeStorm;
    fresh.stormDaysLeft = cp.stormDaysLeft;
    fresh.seenFacts = [...cp.seenFacts];
    fresh.seenTips = [...cp.seenTips];
    fresh.stats = { ...cp.stats };
    if (isStoryChapter(cp.missionMode)) {
      fresh.stage = "story";
      fresh.events = [];
      fresh.selectedChapterId = cp.missionMode;
      fresh.story = cp.story
        ? {
            ...cp.story,
            surveyed: [...cp.story.surveyed],
            built: [...cp.story.built],
            aiming: false,
          }
        : freshStory();
      const s = fresh.story;
      if (s.stormTimer > 0 || s.flareTimer > 0) fresh.activeStorm = true;
      if (s.stormCountdown > 0)
        fresh.eventBanner = {
          kind: "storm",
          phase: "warn",
          title: `DONKI ALERT: solar storm arrives in ${Math.ceil(s.stormCountdown)}s`,
          edu: "Get inside Habitat A's airlock. Its walls shield you from solar particles.",
        };
    } else if (cp.missionMode === "chapter1") {
      fresh.selectedChapterId = "chapter1";
    }
    fresh.hasCheckpoint = true;
    fresh.checkpointInfo = { day: cp.day, siteName: site.name, savedAt: cp.savedAt };
    fresh.roverTeleport = (this.state.roverTeleport || 0) + 1;
    fresh.playerTeleport = (this.state.playerTeleport || 0) + 1;
    fresh.activeTip = null;

    this.state = fresh;
    sound.playMilestone();
    this.addToast(`Checkpoint restored: Day ${cp.day} at ${site.name}.`, "good");
    this.startLoop();
    this.notify();
    return true;
  }

  public restartGame(seed?: number) {
    sound.playClick();
    this.pauseLoop();
    this.clearAllTimeouts();
    this.factQueue = [];
    this.factTimer = 0;
    this.factGap = 99;
    this.breathTimer = 0;
    this.doorCloseTimer = 0;
    this.state = this.getInitialState(seed);
    this.startGame();
  }

  /** Opens the in-mission pause / exit menu (Esc). Freezes the day timer. */
  public openPauseMenu() {
    if (this.state.phase !== "playing" || this.state.menuOpen) return;
    this.state.menuOpen = true;
    this.pauseLoop();
    sound.playClick();
    this.notify();
  }

  /** Closes the pause menu and resumes the mission clock. */
  public closePauseMenu() {
    if (!this.state.menuOpen) return;
    this.state.menuOpen = false;
    if (this.state.phase === "playing") {
      this.lastUpdate = performance.now();
      this.startLoop();
    }
    this.notify();
  }

  public togglePauseMenu() {
    if (this.state.phase !== "playing") return;
    if (this.state.menuOpen) this.closePauseMenu();
    else this.openPauseMenu();
  }

  /** Leaves the current run for the title screen without wiping the last checkpoint. */
  public exitToTitle() {
    sound.playClick();
    this.pauseLoop();
    this.clearAllTimeouts();
    this.factQueue = [];
    this.factTimer = 0;
    this.factGap = 99;
    this.breathTimer = 0;
    this.doorCloseTimer = 0;
    this.state = this.getInitialState(this.state.seed);
    this.notify();
  }
}

export const gameSim = new SimulationManager();
