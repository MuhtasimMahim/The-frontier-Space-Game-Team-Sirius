import { Room, Client } from "colyseus";
import { FrontierRoomState, PlayerSchema } from "../schemas/StateSchema";

// ── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COLORS = ["#7EE0B8", "#FFD166", "#FF9D9D", "#8FD3FF"] as const;
const RECONNECT_TIMEOUT_S = 30;
const DAY_TICK_MS = 100;
const SECONDS_PER_DAY = 300; // 5 real-time minutes = 1 in-game day
const DAY_INCREMENT = DAY_TICK_MS / (SECONDS_PER_DAY * 1000);

// Quick-chat presets (validated server-side)
const CHAT_PRESETS = new Set([
  "Follow me",
  "Need help",
  "Watch out",
  "Good job",
  "Go here",
  "Ready up",
  "Wait for me",
  "Thanks",
]);

// ── Room Options ─────────────────────────────────────────────────────────────

interface RoomOptions {
  roomCode?: string;
  maxPlayers?: number;
  chapterId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function nextFreeSeat(state: FrontierRoomState): number {
  const taken = new Set<number>();
  state.players.forEach((p) => taken.add(p.seat));
  for (let s = 0; s < 4; s++) {
    if (!taken.has(s)) return s;
  }
  return 0; // fallback — shouldn't happen with maxClients = 4
}

// ── Room ─────────────────────────────────────────────────────────────────────

export class FrontierRoom extends Room<FrontierRoomState> {
  public roomCode: string = "";

  // ── Lifecycle ────────────────────────────────────────────────────────────

  onCreate(options: RoomOptions) {
    const state = new FrontierRoomState();
    state.stage = options.chapterId ?? "";
    this.setState(state);

    this.maxClients = Math.min(options.maxPlayers ?? 4, 4);

    // Expose room code as metadata for matchmaking
    const code = options.roomCode ?? generateRoomCode();
    this.roomCode = code;
    if (!this.listing) {
      (this as any).listing = { metadata: {} };
    }
    this.setMetadata({ roomCode: code });

    // ── Message handlers ───────────────────────────────────────────────

    this.onMessage("move", (client, data: { x: number; z: number; rotation: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof data.x !== "number" || typeof data.z !== "number" || typeof data.rotation !== "number") return;
      player.x = data.x;
      player.z = data.z;
      player.rotation = data.rotation;
    });

    this.onMessage("action", (client, data: { type: string; [key: string]: unknown }) => {
      if (!data || typeof data.type !== "string") return;
      // For now broadcast to all clients — game-logic validation comes later
      this.broadcast("action", { sender: client.sessionId, ...data }, { except: client });
    });

    this.onMessage("chat", (client, data: { message: string }) => {
      if (!data || !CHAT_PRESETS.has(data.message)) return;
      const player = this.state.players.get(client.sessionId);
      this.broadcast("chat", {
        sender: client.sessionId,
        name: player?.name ?? "???",
        message: data.message,
        color: player?.color ?? "#fff",
      });
    });

    this.onMessage("ping", (client, data: { x: number; z: number }) => {
      if (!data || typeof data.x !== "number" || typeof data.z !== "number") return;
      const player = this.state.players.get(client.sessionId);
      this.broadcast("ping", {
        x: data.x,
        z: data.z,
        color: player?.color ?? "#fff",
        sender: client.sessionId,
      });
    });

    this.onMessage("vote", (client, data: { chapterId: string }) => {
      if (!data || typeof data.chapterId !== "string") return;
      this.broadcast("vote", { sender: client.sessionId, chapterId: data.chapterId });
    });

    this.onMessage("ready", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = !player.ready;

      // Check if all players are ready → start game
      let allReady = true;
      this.state.players.forEach((p) => {
        if (!p.ready) allReady = false;
      });
      if (allReady && this.state.players.size >= 1 && this.state.phase === "lobby") {
        this.state.phase = "playing";
        this.broadcast("gameStart", {});
      }
    });

    // ── Day tick ───────────────────────────────────────────────────────

    this.setSimulationInterval((deltaTime) => {
      if (this.state.phase !== "playing") return;
      this.state.dayTimer += deltaTime;
      if (this.state.dayTimer >= SECONDS_PER_DAY * 1000) {
        this.state.dayTimer -= SECONDS_PER_DAY * 1000;
        this.state.day += 1;
        this.broadcast("newDay", { day: this.state.day });
      }
    }, DAY_TICK_MS);

    console.log(`[FrontierRoom] created  code=${code}  chapter=${state.stage}  max=${this.maxClients}`);
  }

  // ── Join ──────────────────────────────────────────────────────────────

  onJoin(client: Client, options: { name?: string }) {
    const seat = nextFreeSeat(this.state);
    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.name = (options.name ?? `Player ${seat + 1}`).slice(0, 24);
    player.seat = seat;
    player.color = PLAYER_COLORS[seat % PLAYER_COLORS.length];
    player.connected = true;

    this.state.players.set(client.sessionId, player);

    this.broadcast("playerJoin", {
      sessionId: client.sessionId,
      name: player.name,
      seat: player.seat,
      color: player.color,
    });

    console.log(`[FrontierRoom] join  session=${client.sessionId}  name=${player.name}  seat=${seat}`);
  }

  // ── Leave / Reconnect ─────────────────────────────────────────────────

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    console.log(`[FrontierRoom] leave  session=${client.sessionId}  consented=${consented}`);

    try {
      if (!consented) {
        // Allow reconnection within 30 s
        await this.allowReconnection(client, RECONNECT_TIMEOUT_S);
        // Player reconnected
        if (player) player.connected = true;
        this.broadcast("playerReconnect", { sessionId: client.sessionId });
        console.log(`[FrontierRoom] reconnected  session=${client.sessionId}`);
      }
    } catch {
      // Reconnection timed out — remove permanently
      this.state.players.delete(client.sessionId);
      this.broadcast("playerLeave", { sessionId: client.sessionId });
      console.log(`[FrontierRoom] removed  session=${client.sessionId}`);
    }
  }

  onDispose() {
    console.log("[FrontierRoom] disposed");
  }
}
