/**
 * Shared multiplayer types — used by both the Colyseus server and the browser client.
 *
 * Keep this file free of Node-only or browser-only imports so it can be
 * consumed from either side.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MultiplayerConfig {
  serverUrl: string;
  roomCode: string;
  playerName: string;
}

// ---------------------------------------------------------------------------
// Remote player (client-side mirror of PlayerSchema)
// ---------------------------------------------------------------------------

export interface RemotePlayer {
  sessionId: string;
  name: string;
  x: number;
  z: number;
  rotation: number;
  inRover: boolean;
  color: string;
  seat: number;
  ready?: boolean;
  connected?: boolean;
  vote?: string;
}

// ---------------------------------------------------------------------------
// Chat presets (child-safe, no free text)
// ---------------------------------------------------------------------------

export enum ChatPreset {
  FollowMe = "Follow me",
  NeedHelp = "Need help",
  WatchOut = "Watch out",
  GoodJob = "Good job",
  GoHere = "Go here",
  ReadyUp = "Ready up",
  WaitForMe = "Wait for me",
  Thanks = "Thanks",
}

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

export interface PingData {
  x: number;
  z: number;
  color: string;
  sender: string;
}

// ---------------------------------------------------------------------------
// Game actions (union type — extend as actions are added)
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: "install_panel" }
  | { type: "mine_ice"; siteId: string }
  | { type: "build_module"; moduleId: string }
  | { type: "charge_battery"; stationId: string }
  | { type: "repair"; targetId: string }
  | { type: "deploy_relay"; x: number; z: number }
  | { type: "activate_antenna" }
  | { type: "harvest_water" }
  | { type: "open_airlock" }
  | { type: "align_solar" }
  | { type: "orient_site" }
  | { type: "story_action"; actionId: string; index?: number };

// ---------------------------------------------------------------------------
// Room creation / join options (sent over the wire)
// ---------------------------------------------------------------------------

export interface RoomCreateOptions {
  roomCode: string;
  maxPlayers: number;
  chapterId: string;
}

// ---------------------------------------------------------------------------
// Constants shared between client and server
// ---------------------------------------------------------------------------

export const PLAYER_COLORS = ["#7EE0B8", "#FFD166", "#FF9D9D", "#8FD3FF"] as const;

export const ROOM_CODE_LENGTH = 4;

export const MAX_PLAYERS = 4;
