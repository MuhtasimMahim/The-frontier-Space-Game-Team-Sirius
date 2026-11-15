// Pure game rules from the design docs (GDD §4). No React, no PlayCanvas.
import { CONFIG } from "./config";

export const RULES = {
  EVENT_FIRST_DAY: 12,
  EVENT_LAST_DAY: 84,
  EVENT_GAP_MIN: 10,
  EVENT_GAP_MAX: 16,
  EVENT_WARN_DAYS: 2,
  STORM_DAYS: 3,
  STORM_SOLAR_MULT: 0.5,
  STORM_OXYGEN_MULT: 1.5,
  METEOR_PANELS_MIN: 1,
  METEOR_PANELS_MAX: 3,
  MODULE_REPAIR_ENERGY: 10,
  MODULE_REPAIR_HOLD: 4,
  ROVER_REPAIR_HOLD: 4,
  PANEL_HOLD: CONFIG.PANEL_INSTALL_HOLD,
  ICE_HOLD: 3,
  AIRLOCK_SECONDS: 6,
  DAMAGE_SPEED_LOSS: 0.1,
  OVERFLOW_NOTIFY_EVERY: 5,
  FACT_AUTO_CLOSE: 10,
  FACT_SPACING: 4,
  CRYSTAL_MIN_SCALE: 0.35,
  LOW_WATER_TIP_DAYS: 15,
  HALL_OF_FAME_SIZE: 5,
  STARTER_PANELS_GOAL: 3,
  UNALIGNED_SOLAR_MULT: 0.7,
  SOLAR_ALIGN_HOLD: 1.5,
};

export type EventKind = "storm" | "meteor";
export interface ScheduledEvent {
  day: number;
  kind: EventKind;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same seed -> same schedule. Alternates storm / meteor, starting with a storm. */
export function buildEventSchedule(seed: number): ScheduledEvent[] {
  const rnd = mulberry32(seed);
  const out: ScheduledEvent[] = [];
  let day = RULES.EVENT_FIRST_DAY;
  let kind: EventKind = "storm";
  while (day <= RULES.EVENT_LAST_DAY) {
    out.push({ day, kind });
    kind = kind === "storm" ? "meteor" : "storm";
    day +=
      RULES.EVENT_GAP_MIN + Math.floor(rnd() * (RULES.EVENT_GAP_MAX - RULES.EVENT_GAP_MIN + 1));
  }
  return out;
}

/** Battery gained this step; costs the same amount of base energy (1:1). */
export function chargeStep(
  rate: number,
  dt: number,
  battery: number,
  batteryMax: number,
  energy: number,
) {
  return Math.max(0, Math.min(rate * dt, batteryMax - battery, energy));
}

/** Each damage hit removes 10% of top speed. */
export function damagedMaxSpeed(maxSpeed: number, damage: number) {
  return maxSpeed * Math.max(0, 1 - RULES.DAMAGE_SPEED_LOSS * damage);
}

export function canStartBoost(
  battery: number,
  batteryMax: number,
  cooldown: number,
  minRatio: number,
) {
  return cooldown <= 0 && battery >= batteryMax * minRatio;
}

export function shouldNotifyOverflow(day: number, lastNotifiedDay: number) {
  return lastNotifiedDay < 0 || day - lastNotifiedDay >= RULES.OVERFLOW_NOTIFY_EVERY;
}

/** The mission window closes when Day 90 is reached. */
export function missionExpired(day: number, totalDays: number) {
  return day >= totalDays;
}

/** Hold-to-act progress (0..1). Releasing resets it. */
export function holdStep(progress: number, dt: number, holdSeconds: number, holding: boolean) {
  if (!holding) return 0;
  return Math.min(1, progress + dt / holdSeconds);
}

export function crystalScale(deposit: number, maxDeposit: number) {
  if (deposit <= 0) return 0;
  return (
    RULES.CRYSTAL_MIN_SCALE + (1 - RULES.CRYSTAL_MIN_SCALE) * Math.min(1, deposit / maxDeposit)
  );
}

/** Battery needed to drive to a point and back at ~70% of top speed. */
export function roundTripBattery(distance: number, maxSpeed: number, drainPerSecond: number) {
  return ((2 * distance) / (maxSpeed * 0.7)) * drainPerSecond;
}

export interface HallEntry {
  days: number;
  site: string;
  date: string;
}
/** Inserts a win, sorted by fewest days, keeps the top N. Returns list and the new run's rank (1-based, 0 if off the board). */
export function addHallEntry(list: HallEntry[], entry: HallEntry) {
  const all = [...list, entry].sort((a, b) => a.days - b.days);
  const rank = all.indexOf(entry) + 1;
  const top = all.slice(0, RULES.HALL_OF_FAME_SIZE);
  return { list: top, rank: rank <= RULES.HALL_OF_FAME_SIZE ? rank : 0 };
}

/** Remaining starter panels required to unlock the rover expedition stage across days. */
export function remainingStarterPanels(installed: number, goal = RULES.STARTER_PANELS_GOAL) {
  return Math.max(0, goal - installed);
}

/** Whether another solar panel can be installed today under daily and total array caps. */
export function canDeployPanelToday(
  installed: number,
  installedToday: number,
  totalMax = CONFIG.PANELS_TOTAL,
  dailyMax = CONFIG.PANELS_PER_DAY,
) {
  return installed < totalMax && installedToday < dailyMax;
}

/** Habitat A airlock only operates when Habitat A is active (sealed while damaged or unbuilt). */
export function canUseHabitatAirlock(habitatStatus: string, airlockOpen: boolean) {
  return habitatStatus === "active" && airlockOpen;
}

/**
 * Determines whether the astronaut's spacesuit oxygen should refill this step.
 * - Before Habitat A is built, the Lander cabin provides temporary shelter.
 * - Once Habitat A exists (active or damaged), open-vacuum Lander shelter is retired;
 *   oxygen at base only refills inside an open, undamaged Habitat A airlock.
 * - On an expedition, the rover's life-support umbilical refills oxygen only while
 *   the rover has battery power and is not wrecked.
 */
export function canRefillOxygen(params: {
  habitatStatus: string;
  airlockOpen: boolean;
  atHabitatDoor: boolean;
  nearLander: boolean;
  inRover: boolean;
  roverPowered: boolean;
}) {
  if (params.inRover) return params.roverPowered;
  const habitatBuilt = params.habitatStatus === "active" || params.habitatStatus === "damaged";
  if (habitatBuilt) {
    return canUseHabitatAirlock(params.habitatStatus, params.airlockOpen) && params.atHabitatDoor;
  }
  return params.nearLander;
}

/**
 * Projects a world (x, z) target into camera-aligned radar coordinates (x right, y down, -y FWD).
 * Walking camera looks along -Z (heading = Math.PI); rover camera looks along rover.rotation.
 */
export function projectRadarBlip(
  originX: number,
  originZ: number,
  targetX: number,
  targetZ: number,
  cameraHeading: number,
  maxRadius = 75,
  worldRange = 220,
) {
  const dx = targetX - originX;
  const dz = targetZ - originZ;
  const dist = Math.hypot(dx, dz);
  const fx = Math.sin(cameraHeading);
  const fz = Math.cos(cameraHeading);
  // Right-handed screen axes: forward = (fx, fz) -> -y, right = (-fz, fx) -> +x
  const fwd = dx * fx + dz * fz;
  const right = -dx * fz + dz * fx;
  const scale = 80 / worldRange;
  let x = right * scale;
  let y = -fwd * scale;
  const r = Math.hypot(x, y);
  const clamped = r > maxRadius;
  if (clamped && r > 1e-6) {
    x = (x / r) * maxRadius;
    y = (y / r) * maxRadius;
  }
  return { x, y, dist, clamped };
}

/** Polar solar arrays capture 100% of site irradiance once sun-tracked, or 70% while unaligned. */
export function solarAlignmentMultiplier(aligned: boolean) {
  return aligned ? 1.0 : RULES.UNALIGNED_SOLAR_MULT;
}

/** Daily solar energy generated by installed arrays given site sunlight, alignment, and storm haze. */
export function dailySolarOutput(params: {
  panelsInstalled: number;
  panelOutput: number;
  siteSunlight: number;
  solarAligned: boolean;
  activeStorm: boolean;
}) {
  const stormMult = params.activeStorm ? RULES.STORM_SOLAR_MULT : 1.0;
  const alignMult = solarAlignmentMultiplier(params.solarAligned);
  return params.panelsInstalled * params.panelOutput * params.siteSunlight * alignMult * stormMult;
}

/** Applies the emergency Camp Sirius O2 rescue supply penalty without dropping below zero. */
export function applyOxygenRescuePenalty(
  food: number,
  water: number,
  penalty: { food: number; water: number } = CONFIG.OXYGEN.deathPenalty,
) {
  return {
    food: Math.max(0, food - penalty.food),
    water: Math.max(0, water - penalty.water),
  };
}

/** Chapter 1 (Camp Sirius) succeeds once Habitat A is active and the astronaut steps inside its open airlock. */
export function isChapter1Complete(params: {
  habitatStatus: string;
  airlockOpen: boolean;
  oxygenSource: string;
}) {
  return (
    params.habitatStatus === "active" && params.airlockOpen && params.oxygenSource === "airlock"
  );
}
