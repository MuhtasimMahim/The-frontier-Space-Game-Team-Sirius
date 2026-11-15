import { Room, Client } from "colyseus";
import { FrontierRoomState, PlayerSchema } from "../schemas/StateSchema";

// ── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COLORS = ["#7EE0B8", "#FFD166", "#FF9D9D", "#8FD3FF"] as const;
const RECONNECT_TIMEOUT_S = 30;
const DAY_TICK_MS = 100;
const SECONDS_PER_DAY = 300; // 5 real-time minutes = 1 in-game day

const PLAYABLE_CHAPTERS = new Set([
  "chapter1",
  "chapter2",
  "chapter3",
  "chapter4",
  "full",
]);

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
  return 0;
}

function tallyWinner(state: FrontierRoomState, fallback: string): string {
  const counts = new Map<string, number>();
  state.players.forEach((p) => {
    if (p.vote && PLAYABLE_CHAPTERS.has(p.vote)) {
      counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
    }
  });
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
      tied = false;
    } else if (n === bestCount && n > 0) {
      tied = true;
    }
  }
  if (!best || tied) return PLAYABLE_CHAPTERS.has(fallback) ? fallback : "chapter1";
  return best;
}

// ── Room ─────────────────────────────────────────────────────────────────────

export class FrontierRoom extends Room<FrontierRoomState> {
  public roomCode: string = "";

  onCreate(options: RoomOptions) {
    const state = new FrontierRoomState();
    const initialChapter =
      options.chapterId && PLAYABLE_CHAPTERS.has(options.chapterId)
        ? options.chapterId
        : "chapter1";
    state.stage = initialChapter;
    state.chapterId = initialChapter;
    this.setState(state);

    this.maxClients = Math.min(options.maxPlayers ?? 4, 4);

    // filterBy(["roomCode"]) matches this option on create/join
    const code = (options.roomCode ?? generateRoomCode()).toUpperCase().slice(0, 4);
    this.roomCode = code;
    try {
      this.setMetadata({ roomCode: code });
    } catch {
      // Unit tests construct the room without a full matchmaker listing
      (this as { metadata?: { roomCode: string } }).metadata = { roomCode: code };
    }

    this.onMessage(
      "move",
      (client, data: { x: number; z: number; rotation: number; inRover?: boolean }) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        if (
          typeof data.x !== "number" ||
          typeof data.z !== "number" ||
          typeof data.rotation !== "number"
        )
          return;
        player.x = data.x;
        player.z = data.z;
        player.rotation = data.rotation;
        if (typeof data.inRover === "boolean") player.inRover = data.inRover;
      },
    );

    this.onMessage("action", (client, data: { type: string; [key: string]: unknown }) => {
      if (!data || typeof data.type !== "string") return;
      if (this.state.phase !== "playing") return;
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
      if (!PLAYABLE_CHAPTERS.has(data.chapterId)) return;
      if (this.state.phase !== "lobby") return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.vote = data.chapterId;
      this.broadcast("vote", { sender: client.sessionId, chapterId: data.chapterId });
    });

    this.onMessage("ready", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "lobby") return;
      player.ready = !player.ready;
    });

    // Host launches once everyone is ready
    this.onMessage("start", (client, data: { chapterId?: string }) => {
      if (this.state.phase !== "lobby") return;
      const host = this.state.players.get(client.sessionId);
      if (!host || host.seat !== 0) return;

      let allReady = this.state.players.size >= 1;
      this.state.players.forEach((p) => {
        if (!p.ready) allReady = false;
      });
      if (!allReady) return;

      const chapterId = tallyWinner(
        this.state,
        typeof data?.chapterId === "string" ? data.chapterId : this.state.chapterId,
      );
      this.state.chapterId = chapterId;
      this.state.stage = chapterId;
      this.state.phase = "playing";
      this.broadcast("gameStart", { chapterId });
      console.log(`[FrontierRoom] launch  code=${this.roomCode}  chapter=${chapterId}`);
    });

    this.setSimulationInterval((deltaTime) => {
      if (this.state.phase !== "playing") return;
      this.state.dayTimer += deltaTime;
      if (this.state.dayTimer >= SECONDS_PER_DAY * 1000) {
        this.state.dayTimer -= SECONDS_PER_DAY * 1000;
        this.state.day += 1;
        this.broadcast("newDay", { day: this.state.day });
      }
    }, DAY_TICK_MS);

    console.log(
      `[FrontierRoom] created  code=${code}  chapter=${state.stage}  max=${this.maxClients}`,
    );
  }

  onJoin(client: Client, options: { name?: string }) {
    if (this.state.phase !== "lobby") {
      throw new Error("Mission already underway — join a new room.");
    }
    const seat = nextFreeSeat(this.state);
    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.name = (options.name ?? `Player ${seat + 1}`).slice(0, 24);
    player.seat = seat;
    player.color = PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
    player.connected = true;
    player.vote = "";

    this.state.players.set(client.sessionId, player);

    this.broadcast("playerJoin", {
      sessionId: client.sessionId,
      name: player.name,
      seat: player.seat,
      color: player.color,
      ready: false,
      vote: "",
      connected: true,
      x: 0,
      z: 0,
      rotation: 0,
      inRover: false,
    });

    console.log(
      `[FrontierRoom] join  session=${client.sessionId}  name=${player.name}  seat=${seat}`,
    );
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    console.log(
      `[FrontierRoom] leave  session=${client.sessionId}  consented=${consented}`,
    );

    try {
      if (!consented) {
        await this.allowReconnection(client, RECONNECT_TIMEOUT_S);
        if (player) player.connected = true;
        this.broadcast("playerReconnect", { sessionId: client.sessionId });
        console.log(`[FrontierRoom] reconnected  session=${client.sessionId}`);
      } else {
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeave", { sessionId: client.sessionId });
      }
    } catch {
      this.state.players.delete(client.sessionId);
      this.broadcast("playerLeave", { sessionId: client.sessionId });
      console.log(`[FrontierRoom] removed  session=${client.sessionId}`);
    }
  }

  onDispose() {
    console.log("[FrontierRoom] disposed");
  }
}
