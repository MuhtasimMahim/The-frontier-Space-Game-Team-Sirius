// Four-base lunar network (Team Sirius design doc). Pure rules, no engine code.
export type BaseId = "COMM" | "POWER" | "FOOD" | "EXPLORE";
export interface FacilityDef {
  name: string;
  energy: number;
  water: number;
}
export interface BaseDef {
  id: BaseId;
  label: string;
  site: string;
  role: string;
  x: number;
  z: number;
  facilities: FacilityDef[];
  upkeep: number;
}
export interface BaseState {
  id: BaseId;
  built: number;
  online: boolean;
  led: boolean;
}

export const NETWORK = {
  UPKEEP_PER_BASE: 2,
  WIN_STREAK_DAYS: 5,
  POWER_TOWER_OUTPUT: 8,
  RECYCLER_WATER: 2,
  FARM_FOOD: 2,
  LED_FOOD: 1,
  LED_ENERGY: 3,
  COMM_EXTRA_WARN_DAYS: 2,
  ROVER_BATTERY_BONUS: 20,
};

export const BASES: BaseDef[] = [
  {
    id: "COMM",
    label: "Base A · Communication",
    site: "Malapert Massif",
    role: "Links the bases with Earth and gives early storm warnings.",
    x: -260,
    z: 220,
    upkeep: 2,
    facilities: [
      { name: "Main Antenna", energy: 40, water: 5 },
      { name: "Antenna Alignment", energy: 10, water: 0 },
      { name: "Relay Station", energy: 30, water: 5 },
    ],
  },
  {
    id: "POWER",
    label: "Base B · Power",
    site: "Mons Mouton",
    role: "Generates electricity and flies charged energy packs to the other bases by hopper.",
    x: 260,
    z: -220,
    upkeep: 2,
    facilities: [
      { name: "Airlock", energy: 30, water: 10 },
      { name: "Solar Tower", energy: 60, water: 10 },
      { name: "Energy-Pack Hopper", energy: 30, water: 0 },
    ],
  },
  {
    id: "FOOD",
    label: "Base C · Food & Water",
    site: "Nobile Rim 1",
    role: "Recycles water and grows food for every base.",
    x: 280,
    z: 240,
    upkeep: 2,
    facilities: [
      { name: "Airlock", energy: 30, water: 10 },
      { name: "Water Recycler", energy: 50, water: 10 },
      { name: "Hydroponic Farm", energy: 60, water: 15 },
    ],
  },
  {
    id: "EXPLORE",
    label: "Base D · Exploration",
    site: "Peak near Cabeus B",
    role: "Surveys terrain, finds hidden ice and upgrades the rover.",
    x: -280,
    z: -240,
    upkeep: 2,
    facilities: [
      { name: "Survey Station", energy: 40, water: 5 },
      { name: "Ground Radar", energy: 50, water: 10 },
      { name: "Rover Upgrade Bay", energy: 40, water: 0 },
    ],
  },
];

export const baseDef = (id: BaseId) => BASES.find((b) => b.id === id)!;
export const initialBases = (): BaseState[] =>
  BASES.map((b) => ({ id: b.id, built: 0, online: false, led: false }));

/** Outposts unlock once the landing base has a working habitat (airlock) and solar power. */
export const networkUnlocked = (habitatActive: boolean, panels: number) =>
  habitatActive && panels >= 3;

/** A base is fully built when all three facilities stand. */
export const isComplete = (b: BaseState) => b.built >= 3;

export function nextFacility(b: BaseState): FacilityDef | null {
  return baseDef(b.id).facilities[b.built] ?? null;
}

export function canBuild(b: BaseState, energy: number, water: number): boolean {
  const f = nextFacility(b);
  return !!f && energy >= f.energy && water >= f.water;
}

/**
 * Daily network flow. Bases with at least one facility need upkeep; if the
 * colony can't pay it, they go offline for the day and give nothing.
 */
export function dailyFlow(bases: BaseState[], energyAvailable: number) {
  const online: Record<string, boolean> = {};
  let pool = energyAvailable,
    upkeep = 0,
    gain = 0,
    water = 0,
    food = 0;
  const power = bases.find((b) => b.id === "POWER");
  const tower = power && power.built >= 2 ? NETWORK.POWER_TOWER_OUTPUT : 0;
  const hopper = !!power && power.built >= 3;
  // Base B first: its tower feeds itself; only the energy-pack hopper exports the rest.
  const order = [...bases].sort((x, y) => (x.id === "POWER" ? -1 : y.id === "POWER" ? 1 : 0));
  for (const b of order) {
    if (b.built === 0) {
      online[b.id] = false;
      continue;
    }
    const cost =
      NETWORK.UPKEEP_PER_BASE + (b.id === "FOOD" && b.led && b.built >= 3 ? NETWORK.LED_ENERGY : 0);
    if (b.id === "POWER") {
      const usable = hopper ? tower : Math.min(tower, cost);
      if (pool + usable < cost) {
        online[b.id] = false;
        continue;
      }
      gain += usable;
      pool += usable;
    } else if (pool < cost) {
      online[b.id] = false;
      continue;
    }
    online[b.id] = true;
    upkeep += cost;
    pool -= cost;
    if (b.id === "FOOD") {
      if (b.built >= 2) water += NETWORK.RECYCLER_WATER;
      if (b.built >= 3) food += NETWORK.FARM_FOOD + (b.led ? NETWORK.LED_FOOD : 0);
    }
  }
  return { online, upkeep, energyDelta: gain - upkeep, water, food };
}

export const warnLeadDays = (bases: BaseState[], baseLead: number) => {
  const c = bases.find((b) => b.id === "COMM");
  return c && c.built >= 2 && c.online ? baseLead + NETWORK.COMM_EXTRA_WARN_DAYS : baseLead;
};
export const commBackup = (bases: BaseState[]) =>
  (bases.find((b) => b.id === "COMM")?.built ?? 0) >= 3;
export const radarActive = (bases: BaseState[]) =>
  (bases.find((b) => b.id === "EXPLORE")?.built ?? 0) >= 2;
export const roverUpgraded = (bases: BaseState[]) =>
  (bases.find((b) => b.id === "EXPLORE")?.built ?? 0) >= 3;

/** Network is "running" when every base is complete and online today. */
export const allRunning = (bases: BaseState[], online: Record<string, boolean>) =>
  bases.every((b) => isComplete(b) && online[b.id]);
export const nextStreak = (streak: number, running: boolean) => (running ? streak + 1 : 0);
export const networkWon = (streak: number) => streak >= NETWORK.WIN_STREAK_DAYS;
