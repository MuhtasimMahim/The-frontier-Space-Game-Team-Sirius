import { Client, Room } from "colyseus.js";
import { ChatPreset, GameAction, PingData, RemotePlayer, RoomCreateOptions } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FrontierClientCallbacks {
  onPlayerJoin?: (player: RemotePlayer) => void;
  onPlayerLeave?: (sessionId: string) => void;
  onPlayerMove?: (player: RemotePlayer) => void;
  onStateChange?: (state: unknown) => void;
  onChat?: (chat: { sender: string; name: string; message: string; color: string }) => void;
  onPing?: (ping: PingData) => void;
  onError?: (err: Error) => void;
  onReconnect?: () => void;
  onGameStart?: (chapterId: string) => void;
  onNewDay?: (day: number) => void;
  onAction?: (action: GameAction & { sender: string }) => void;
  onVote?: (data: { sender: string; chapterId: string }) => void;
}

interface MovePayload {
  x: number;
  z: number;
  rotation: number;
  inRover?: boolean;
}

// ── FrontierClient ───────────────────────────────────────────────────────────

export class FrontierClient {
  private client: Client | null = null;
  private room: Room | null = null;
  private serverUrl: string = "";
  private lastRoomId: string | null = null;
  private lastSessionId: string | null = null;
  private lastReconnectionToken: string | null = null;
  private intentionalDisconnect = false;

  // Reconnection backoff
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Throttled movement (15 Hz = ~66.6ms)
  private readonly MOVE_THROTTLE_MS = 66;
  private lastMoveSentTime = 0;
  private pendingMove: MovePayload | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;

  // Event callbacks
  public callbacks: FrontierClientCallbacks = {};

  constructor(callbacks?: FrontierClientCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  // ── Connection ───────────────────────────────────────────────────────────

  public async connect(url: string): Promise<void> {
    const targetUrl = url.trim().replace(/^was:\/\//i, "wss://").replace(/\/+$/, "");
    this.serverUrl = targetUrl;
    this.client = new Client(targetUrl);
    this.intentionalDisconnect = false;
  }

  // ── Room management ──────────────────────────────────────────────────────

  public async createRoom(options: RoomCreateOptions & { name?: string }): Promise<Room> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect(url) first.");
    }

    this.intentionalDisconnect = false;
    const room = await this.client.create("frontier", options);
    this.attachRoomHandlers(room);
    return room;
  }

  public async joinRoom(code: string, options?: { name?: string }): Promise<Room> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect(url) first.");
    }

    this.intentionalDisconnect = false;
    // Join by roomCode matching metadata or reservation
    // Colyseus 0.15 allows joinOrCreate or join with options
    const room = await this.client.join("frontier", {
      roomCode: code,
      ...options,
    });
    this.attachRoomHandlers(room);
    return room;
  }

  public get currentRoom(): Room | null {
    return this.room;
  }

  public get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  // ── Senders ──────────────────────────────────────────────────────────────

  /**
   * Throttled position updates at 15 Hz (~66ms interval).
   */
  public sendMove(x: number, z: number, rotation: number, inRover = false): void {
    if (!this.room) return;

    const now = Date.now();
    const elapsed = now - this.lastMoveSentTime;

    this.pendingMove = { x, z, rotation, inRover };

    if (elapsed >= this.MOVE_THROTTLE_MS) {
      this.flushPendingMove();
    } else if (!this.moveTimer) {
      this.moveTimer = setTimeout(() => {
        this.moveTimer = null;
        this.flushPendingMove();
      }, this.MOVE_THROTTLE_MS - elapsed);
    }
  }

  private flushPendingMove(): void {
    if (!this.room || !this.pendingMove) return;
    this.room.send("move", this.pendingMove);
    this.lastMoveSentTime = Date.now();
    this.pendingMove = null;
  }

  public sendAction(action: GameAction): void {
    if (!this.room) return;
    this.room.send("action", action);
  }

  public sendChat(preset: ChatPreset): void {
    if (!this.room) return;
    this.room.send("chat", { message: preset });
  }

  public sendPing(x: number, z: number): void {
    if (!this.room) return;
    this.room.send("ping", { x, z });
  }

  public sendReady(): void {
    if (!this.room) return;
    this.room.send("ready");
  }

  public sendVote(chapterId: string): void {
    if (!this.room) return;
    this.room.send("vote", { chapterId });
  }

  /** Host launches the mission once the crew is ready. */
  public sendStart(chapterId?: string): void {
    if (!this.room) return;
    this.room.send("start", { chapterId });
  }

  // ── Disconnect & Reconnect ───────────────────────────────────────────────

  public disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.moveTimer) {
      clearTimeout(this.moveTimer);
      this.moveTimer = null;
    }
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.client = null;
    this.reconnectAttempts = 0;
  }

  private async attemptAutoReconnect(): Promise<void> {
    if (this.intentionalDisconnect || !this.client) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onError?.(
        new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts.`),
      );
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (!this.client || this.intentionalDisconnect) return;

        let reconnectedRoom: Room | null = null;
        if (this.lastReconnectionToken) {
          reconnectedRoom = await this.client.reconnect(this.lastReconnectionToken);
        }

        if (reconnectedRoom) {
          this.reconnectAttempts = 0;
          this.attachRoomHandlers(reconnectedRoom);
          this.callbacks.onReconnect?.();
        }
      } catch (err) {
        // Try again with next backoff
        this.attemptAutoReconnect();
      }
    }, backoffMs);
  }

  // ── Internal room wiring ─────────────────────────────────────────────────

  private schemaPlayerToRemote(sessionId: string, raw: Record<string, unknown>): RemotePlayer {
    const vote = raw["vote"] ? String(raw["vote"]) : "";
    const player: RemotePlayer = {
      sessionId,
      name: String(raw["name"] ?? "Astronaut"),
      x: Number(raw["x"] ?? 0),
      z: Number(raw["z"] ?? 0),
      rotation: Number(raw["rotation"] ?? 0),
      inRover: Boolean(raw["inRover"]),
      color: String(raw["color"] ?? "#7EE0B8"),
      seat: Number(raw["seat"] ?? 0),
      ready: Boolean(raw["ready"]),
      connected: raw["connected"] !== false,
    };
    if (vote) player.vote = vote;
    return player;
  }

  private bindPlayerSchema(sessionId: string, playerSchema: unknown): void {
    const src = playerSchema as {
      sessionId?: string;
      name?: string;
      x?: number;
      z?: number;
      rotation?: number;
      inRover?: boolean;
      color?: string;
      seat?: number;
      ready?: boolean;
      connected?: boolean;
      vote?: string;
      onChange?: (cb: (changes?: unknown) => void) => void;
      listen?: (prop: string, cb: () => void) => void;
    };
    const read = (): RemotePlayer =>
      this.schemaPlayerToRemote(sessionId, {
        name: src.name,
        x: src.x,
        z: src.z,
        rotation: src.rotation,
        inRover: src.inRover,
        color: src.color,
        seat: src.seat,
        ready: src.ready,
        connected: src.connected,
        vote: src.vote,
      });

    const emitMove = () => this.callbacks.onPlayerMove?.(read());
    this.callbacks.onPlayerJoin?.(read());

    // Prefer fine-grained listens so position patches always fire
    if (typeof src.listen === "function") {
      for (const prop of ["x", "z", "rotation", "inRover", "name", "ready", "vote", "connected"]) {
        src.listen(prop, emitMove);
      }
    } else if (typeof src.onChange === "function") {
      src.onChange(emitMove);
    }
  }

  private attachRoomHandlers(room: Room): void {
    this.room = room;
    this.lastRoomId = room.id;
    this.lastSessionId = room.sessionId;
    this.lastReconnectionToken =
      (room as unknown as { reconnectionToken?: string }).reconnectionToken ?? null;
    this.reconnectAttempts = 0;
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as unknown as { __frontierRoom?: Room }).__frontierRoom = room;
    }

    // MapSchema listeners ONCE per room (not inside every onStateChange)
    const players = (room.state as unknown as { players?: unknown })?.players as
      | {
          onAdd?: (cb: (player: unknown, key: string) => void) => void;
          onRemove?: (cb: (player: unknown, key: string) => void) => void;
          forEach?: (cb: (player: unknown, key: string) => void) => void;
        }
      | undefined;

    if (players && typeof players.onAdd === "function") {
      players.onAdd((player, key) => {
        this.bindPlayerSchema(key, player);
      });
      players.onRemove?.((_player, key) => {
        this.callbacks.onPlayerLeave?.(key);
      });
      // Seed existing seats (join mid-lobby / reconnect)
      players.forEach?.((player, key) => {
        this.bindPlayerSchema(key, player);
      });
    }

    room.onStateChange((state) => {
      this.callbacks.onStateChange?.(state);
    });

    // Custom broadcast messages (backup join/leave if schema add is missed)
    room.onMessage("playerJoin", (data: RemotePlayer) => {
      this.callbacks.onPlayerJoin?.(data);
    });

    room.onMessage("playerLeave", (data: { sessionId: string }) => {
      this.callbacks.onPlayerLeave?.(data.sessionId);
    });

    room.onMessage(
      "chat",
      (data: { sender: string; name: string; message: string; color: string }) => {
        this.callbacks.onChat?.(data);
      },
    );

    room.onMessage("ping", (data: PingData) => {
      this.callbacks.onPing?.(data);
    });

    room.onMessage("action", (data: GameAction & { sender: string }) => {
      this.callbacks.onAction?.(data);
    });

    room.onMessage("vote", (data: { sender: string; chapterId: string }) => {
      this.callbacks.onVote?.(data);
    });

    room.onMessage("gameStart", (data: { chapterId?: string } = {}) => {
      this.callbacks.onGameStart?.(data?.chapterId ?? "chapter1");
    });

    room.onMessage("newDay", (data: { day: number }) => {
      this.callbacks.onNewDay?.(data.day);
    });

    room.onLeave((code) => {
      this.room = null;
      if (!this.intentionalDisconnect && code !== 1000) {
        this.attemptAutoReconnect();
      }
    });

    room.onError((code, message) => {
      this.callbacks.onError?.(new Error(`Colyseus room error (${code}): ${message}`));
    });
  }
}
