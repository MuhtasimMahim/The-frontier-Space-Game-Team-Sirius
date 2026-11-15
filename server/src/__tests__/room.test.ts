import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FrontierRoom } from "../rooms/FrontierRoom";
import { FrontierRoomState } from "../schemas/StateSchema";

describe("FrontierRoom", () => {
  let room: FrontierRoom;

  beforeEach(() => {
    room = new FrontierRoom();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Room creation and state initialization", () => {
    it("initializes default state and metadata", () => {
      room.onCreate({ roomCode: "TEST", maxPlayers: 4, chapterId: "chapter1" });

      expect(room.state).toBeInstanceOf(FrontierRoomState);
      expect(room.state.stage).toBe("chapter1");
      expect(room.state.chapterId).toBe("chapter1");
      expect(room.state.phase).toBe("lobby");
      expect(room.state.day).toBe(1);
      expect(room.maxClients).toBe(4);
      expect(room.roomCode).toBe("TEST");
    });

    it("falls back to chapter1 for unknown chapter ids", () => {
      room.onCreate({ chapterId: "ch1" });
      expect(room.state.stage).toBe("chapter1");
    });

    it("generates a 4-character roomCode if none provided", () => {
      room.onCreate({});
      expect(room.roomCode).toBeDefined();
      expect(room.roomCode.length).toBe(4);
    });

    it("caps maxClients at 4", () => {
      room.onCreate({ maxPlayers: 10 });
      expect(room.maxClients).toBe(4);
    });
  });

  describe("Player join handling", () => {
    beforeEach(() => {
      room.onCreate({ roomCode: "TEST" });
    });

    it("assigns seat 0 and first color to first player", () => {
      const mockClient = { sessionId: "sess-1" } as any;
      const broadcastSpy = vi.spyOn(room, "broadcast");

      room.onJoin(mockClient, { name: "Commander" });

      expect(room.state.players.size).toBe(1);
      const player = room.state.players.get("sess-1");
      expect(player?.name).toBe("Commander");
      expect(player?.seat).toBe(0);
      expect(player?.color).toBe("#7EE0B8");
      expect(broadcastSpy).toHaveBeenCalledWith(
        "playerJoin",
        expect.objectContaining({
          sessionId: "sess-1",
          name: "Commander",
          seat: 0,
          color: "#7EE0B8",
        }),
      );
    });

    it("assigns sequential seats and distinct colors to subsequent players", () => {
      const expectedColors = ["#7EE0B8", "#FFD166", "#FF9D9D", "#8FD3FF"];

      for (let i = 0; i < 4; i++) {
        const client = { sessionId: `sess-${i}` } as any;
        room.onJoin(client, { name: `Player ${i}` });
        const p = room.state.players.get(`sess-${i}`);
        expect(p?.seat).toBe(i);
        expect(p?.color).toBe(expectedColors[i]);
      }

      expect(room.state.players.size).toBe(4);
    });

    it("reuses freed seats when a player leaves", async () => {
      room.onJoin({ sessionId: "sess-0" } as any, { name: "P0" });
      room.onJoin({ sessionId: "sess-1" } as any, { name: "P1" });
      room.state.players.delete("sess-0");
      room.onJoin({ sessionId: "sess-2" } as any, { name: "P2" });
      expect(room.state.players.get("sess-2")?.seat).toBe(0);
    });
  });

  describe("Message handlers", () => {
    let client1: any;
    let client2: any;

    beforeEach(() => {
      room.onCreate({ roomCode: "TEST", chapterId: "chapter1" });
      client1 = { sessionId: "c1" };
      client2 = { sessionId: "c2" };
      room.onJoin(client1, { name: "Alice" });
      room.onJoin(client2, { name: "Bob" });
    });

    const invokeHandler = (type: string, client: any, data?: any) => {
      const handlers = (room as any).onMessageHandlers;
      if (handlers instanceof Map) {
        const handler = handlers.get(type);
        if (handler) handler(client, data);
      } else if (handlers && typeof handlers[type] === "function") {
        handlers[type](client, data);
      }
    };

    it("handles move message and updates player position", () => {
      invokeHandler("move", client1, { x: 12.5, z: -45.2, rotation: 1.57, inRover: true });
      const p1 = room.state.players.get("c1");
      expect(p1?.x).toBeCloseTo(12.5);
      expect(p1?.z).toBeCloseTo(-45.2);
      expect(p1?.rotation).toBeCloseTo(1.57);
      expect(p1?.inRover).toBe(true);
    });

    it("ignores invalid move message data", () => {
      invokeHandler("move", client1, { x: "invalid", z: null, rotation: NaN });
      const p1 = room.state.players.get("c1");
      expect(p1?.x).toBe(0);
      expect(p1?.z).toBe(0);
    });

    it("broadcasts game actions only while playing", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("action", client1, { type: "mine_ice", siteId: "site-a" });
      expect(broadcastSpy).not.toHaveBeenCalled();

      room.state.phase = "playing";
      invokeHandler("action", client1, { type: "mine_ice", siteId: "site-a" });
      expect(broadcastSpy).toHaveBeenCalledWith(
        "action",
        { sender: "c1", type: "mine_ice", siteId: "site-a" },
        { except: client1 },
      );
    });

    it("broadcasts valid chat presets", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("chat", client1, { message: "Need help" });

      expect(broadcastSpy).toHaveBeenCalledWith("chat", {
        sender: "c1",
        name: "Alice",
        message: "Need help",
        color: "#7EE0B8",
      });
    });

    it("rejects non-preset chat messages (child safety)", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("chat", client1, { message: "Arbitrary unapproved text!" });
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("broadcasts ping coordinates", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("ping", client1, { x: 50, z: -20 });

      expect(broadcastSpy).toHaveBeenCalledWith("ping", {
        x: 50,
        z: -20,
        color: "#7EE0B8",
        sender: "c1",
      });
    });

    it("stores and broadcasts chapter votes", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("vote", client1, { chapterId: "chapter2" });

      expect(room.state.players.get("c1")?.vote).toBe("chapter2");
      expect(broadcastSpy).toHaveBeenCalledWith("vote", {
        sender: "c1",
        chapterId: "chapter2",
      });
    });

    it("rejects invalid chapter votes", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");
      invokeHandler("vote", client1, { chapterId: "chapter-2" });
      expect(room.state.players.get("c1")?.vote).toBe("");
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("toggles ready without auto-starting; host start launches", () => {
      const broadcastSpy = vi.spyOn(room, "broadcast");

      invokeHandler("ready", client1);
      expect(room.state.players.get("c1")?.ready).toBe(true);
      expect(room.state.phase).toBe("lobby");

      invokeHandler("ready", client2);
      expect(room.state.players.get("c2")?.ready).toBe(true);
      expect(room.state.phase).toBe("lobby");

      invokeHandler("vote", client1, { chapterId: "chapter3" });
      invokeHandler("vote", client2, { chapterId: "chapter3" });
      invokeHandler("start", client1, { chapterId: "chapter1" });

      expect(room.state.phase).toBe("playing");
      expect(room.state.chapterId).toBe("chapter3");
      expect(broadcastSpy).toHaveBeenCalledWith("gameStart", { chapterId: "chapter3" });
    });

    it("ignores start from non-host", () => {
      invokeHandler("ready", client1);
      invokeHandler("ready", client2);
      invokeHandler("start", client2, { chapterId: "chapter2" });
      expect(room.state.phase).toBe("lobby");
    });
  });

  describe("Leave and Reconnection", () => {
    let client: any;

    beforeEach(() => {
      room.onCreate({ roomCode: "TEST" });
      client = { sessionId: "reconnect-user" };
      room.onJoin(client, { name: "Explorer" });
    });

    it("marks player as disconnected upon leave", async () => {
      (room as any).allowReconnection = vi.fn().mockResolvedValue(true);

      const leavePromise = room.onLeave(client, false);
      const player = room.state.players.get("reconnect-user");
      expect(player?.connected).toBe(false);

      await leavePromise;
      expect(player?.connected).toBe(true);
    });

    it("removes player if reconnection times out", async () => {
      (room as any).allowReconnection = vi.fn().mockRejectedValue(new Error("Timeout"));
      const broadcastSpy = vi.spyOn(room, "broadcast");

      await room.onLeave(client, false);

      expect(room.state.players.has("reconnect-user")).toBe(false);
      expect(broadcastSpy).toHaveBeenCalledWith("playerLeave", {
        sessionId: "reconnect-user",
      });
    });
  });
});
