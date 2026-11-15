import { describe, expect, it } from "vitest";
import {
  looksLikeServerOffline,
  multiplayerHttpBase,
  normalizeMultiplayerUrl,
  SERVER_OFFLINE_MESSAGE,
} from "@/frontier/game/multiplayer/serverStatus";

describe("multiplayer server status helpers", () => {
  it("normalizes websocket URLs and corrects protocol typos", () => {
    expect(normalizeMultiplayerUrl("was://the-frontier-colyseus-996f14385e12.herokuapp.com")).toBe(
      "wss://the-frontier-colyseus-996f14385e12.herokuapp.com",
    );
    expect(normalizeMultiplayerUrl("https://the-frontier-colyseus-996f14385e12.herokuapp.com/")).toBe(
      "wss://the-frontier-colyseus-996f14385e12.herokuapp.com",
    );
    expect(normalizeMultiplayerUrl("ws://localhost:2567/")).toBe("ws://localhost:2567");
    expect(normalizeMultiplayerUrl("")).toBe(
      "wss://the-frontier-colyseus-996f14385e12.herokuapp.com",
    );
  });

  it("maps websocket URLs to HTTP health bases", () => {
    expect(multiplayerHttpBase("ws://localhost:2567")).toBe("http://localhost:2567");
    expect(multiplayerHttpBase("wss://the-frontier-colyseus.herokuapp.com/")).toBe(
      "https://the-frontier-colyseus.herokuapp.com",
    );
    expect(
      multiplayerHttpBase("was://the-frontier-colyseus-996f14385e12.herokuapp.com"),
    ).toBe("https://the-frontier-colyseus-996f14385e12.herokuapp.com");
  });

  it("detects common offline / unreachable errors", () => {
    expect(looksLikeServerOffline(new Error("Failed to fetch"))).toBe(true);
    expect(looksLikeServerOffline(new TypeError("NetworkError when attempting to fetch"))).toBe(
      true,
    );
    expect(looksLikeServerOffline("WebSocket connection failed")).toBe(true);
    expect(looksLikeServerOffline(new Error("room not found"))).toBe(false);
  });

  it("exposes solo-friendly offline copy", () => {
    expect(SERVER_OFFLINE_MESSAGE.toLowerCase()).toContain("solo");
    expect(SERVER_OFFLINE_MESSAGE.toLowerCase()).toContain("offline");
  });
});
