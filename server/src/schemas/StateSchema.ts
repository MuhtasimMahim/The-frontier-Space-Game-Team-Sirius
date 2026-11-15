import { Schema, MapSchema, type, defineTypes } from "@colyseus/schema";

// ---------------------------------------------------------------------------
// Player schema — defineTypes so encoding works under tsx and compiled dist
// ---------------------------------------------------------------------------

export class PlayerSchema extends Schema {
  sessionId: string = "";
  name: string = "";
  x: number = 0;
  z: number = 0;
  rotation: number = 0;
  inRover: boolean = false;
  color: string = "#7EE0B8";
  ready: boolean = false;
  seat: number = 0;
  connected: boolean = true;
  /** Chapter vote id, empty until the player votes */
  vote: string = "";
}
defineTypes(PlayerSchema, {
  sessionId: "string",
  name: "string",
  x: "float32",
  z: "float32",
  rotation: "float32",
  inRover: "boolean",
  color: "string",
  ready: "boolean",
  seat: "uint8",
  connected: "boolean",
  vote: "string",
});

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

export class FrontierRoomState extends Schema {
  players = new MapSchema<PlayerSchema>();

  day: number = 1;
  energy: number = 100;
  water: number = 100;
  food: number = 100;

  /** "lobby" | "playing" | "paused" | "ended" */
  phase: string = "lobby";

  /** "story" | "sandbox" */
  missionMode: string = "story";

  /** Current / voted chapter id */
  stage: string = "";

  /** Winning chapter chosen at launch */
  chapterId: string = "chapter1";

  /** Internal day-tick accumulator (not synced — server only) */
  dayTimer: number = 0;
}
defineTypes(FrontierRoomState, {
  players: { map: PlayerSchema },
  day: "uint16",
  energy: "float32",
  water: "float32",
  food: "float32",
  phase: "string",
  missionMode: "string",
  stage: "string",
  chapterId: "string",
});
