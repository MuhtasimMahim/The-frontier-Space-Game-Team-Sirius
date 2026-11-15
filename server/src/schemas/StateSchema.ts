import { Schema, MapSchema, type, defineTypes } from "@colyseus/schema";

// ---------------------------------------------------------------------------
// Player schema
// ---------------------------------------------------------------------------

export class PlayerSchema extends Schema {
  @type("string") sessionId: string = "";
  @type("string") name: string = "";
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotation: number = 0;
  @type("boolean") inRover: boolean = false;
  @type("string") color: string = "#7EE0B8";
  @type("boolean") ready: boolean = false;
  @type("uint8") seat: number = 0;
  @type("boolean") connected: boolean = true;
}

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

export class FrontierRoomState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();

  @type("uint16") day: number = 1;
  @type("float32") energy: number = 100;
  @type("float32") water: number = 100;
  @type("float32") food: number = 100;

  /** "lobby" | "playing" | "paused" | "ended" */
  @type("string") phase: string = "lobby";

  /** "story" | "sandbox" */
  @type("string") missionMode: string = "story";

  /** Current chapter / stage id */
  @type("string") stage: string = "";

  /** Internal day-tick accumulator (not synced — server only) */
  dayTimer: number = 0;
}
