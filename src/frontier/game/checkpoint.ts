import { z } from "zod";

export const CHECKPOINT_VERSION = 1 as const;
export const CHECKPOINT_STORAGE_KEY = "frontier_checkpoint_v1";

export const MissionModeSchema = z.enum(["chapter1", "chapter2", "chapter3", "chapter4", "full"]);
export const MissionStageSchema = z.enum([
  "orient",
  "panels",
  "align_panels",
  "board_rover",
  "find_ice",
  "unload",
  "build_A",
  "enter_airlock",
  "build_B",
  "build_C",
  "story",
  "done",
]);

const StorySchema = z.object({
  stepIndex: z.number().int().min(0),
  surveyed: z.array(z.number().int().min(0)),
  stagesBuilt: z.number().int().min(0),
  built: z.array(z.string()),
  packsMade: z.number().int().min(0),
  packsCarried: z.number().int().min(0),
  packsLoaded: z.number().int().min(0),
  packTimer: z.number().min(0),
  aiming: z.boolean(),
  aimYaw: z.number(),
  aimPitch: z.number(),
  linkLocked: z.boolean(),
  stormCountdown: z.number(),
  stormTimer: z.number().min(0),
  stormDose: z.number().min(0),
  roverUpgraded: z.boolean(),
  iceRevealed: z.boolean(),
  launchTimer: z.number(),
  flareTimer: z.number().min(0),
  flareDone: z.boolean(),
});

const ModuleStatusSchema = z.enum([
  "locked",
  "available",
  "building",
  "active",
  "damaged",
  "paused",
]);

const SavedModuleSchema = z.object({
  status: ModuleStatusSchema,
  daysLeft: z.number().int().min(0),
});

const SavedIceSiteSchema = z.object({
  id: z.number().int(),
  x: z.number(),
  z: z.number(),
  deposit: z.number().min(0),
  maxDeposit: z.number().positive(),
  difficulty: z.enum(["easy", "mid", "hard"]),
});

const SavedBaseSchema = z.object({
  id: z.enum(["COMM", "POWER", "FOOD", "EXPLORE"]),
  built: z.number().int().min(0).max(3),
  online: z.boolean(),
  led: z.boolean(),
});

export const CheckpointSchema = z.object({
  version: z.literal(CHECKPOINT_VERSION),
  savedAt: z.string(),
  missionMode: MissionModeSchema,
  stage: MissionStageSchema,
  chapter1Completed: z.boolean(),
  seed: z.number().int(),
  day: z.number().int().min(1),
  dayTimer: z.number().min(0),
  selectedSiteId: z.number().int(),
  energy: z.number().min(0),
  water: z.number().min(0),
  food: z.number().min(0),
  panelsInstalled: z.number().int().min(0),
  panelsInstalledToday: z.number().int().min(0),
  solarAligned: z.boolean(),
  siteOriented: z.boolean(),
  modules: z.object({
    A: SavedModuleSchema,
    B: SavedModuleSchema,
    C: SavedModuleSchema,
  }),
  iceSites: z.array(SavedIceSiteSchema),
  bases: z.array(SavedBaseSchema).length(4),
  networkOpen: z.boolean(),
  networkStreak: z.number().int().min(0),
  commLinkDown: z.number().int().min(0),
  player: z.object({
    x: z.number(),
    z: z.number(),
    rotation: z.number(),
    oxygen: z.number().min(0).max(100),
    inRover: z.boolean(),
  }),
  rover: z.object({
    x: z.number(),
    z: z.number(),
    rotation: z.number(),
    battery: z.number().min(0),
    batteryMax: z.number().positive(),
    waterTank: z.number().min(0),
    damage: z.number().int().min(0),
  }),
  shortageDays: z.number().int().min(0),
  shortageResource: z.string().nullable(),
  activeStorm: z.boolean(),
  stormDaysLeft: z.number().int().min(0),
  seenFacts: z.array(z.string()),
  seenTips: z.array(z.string()),
  stats: z.object({
    daysTaken: z.number().int().min(0),
    waterTrips: z.number().int().min(0),
    oxygenDeaths: z.number().int().min(0),
    panelsBuilt: z.number().int().min(0),
    repairs: z.number().int().min(0),
    waterDelivered: z.number().min(0),
    modulesBuilt: z.number().int().min(0),
    moduleRepairs: z.number().int().min(0),
  }),
  story: StorySchema.optional(),
});

export type CheckpointData = z.infer<typeof CheckpointSchema>;

export function parseCheckpoint(raw: unknown): CheckpointData | null {
  const result = CheckpointSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function saveCheckpointToStorage(data: CheckpointData): boolean {
  const validated = parseCheckpoint(data);
  if (!validated || typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}

export function loadCheckpointFromStorage(): CheckpointData | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return null;
    return parseCheckpoint(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearCheckpointFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
  } catch {
    // Ignore private-mode storage errors
  }
}
