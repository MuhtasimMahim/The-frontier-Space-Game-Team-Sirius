import { describe, expect, it } from "vitest";
import {
  looksLikeServerOffline,
  multiplayerHttpBase,
  SERVER_OFFLINE_MESSAGE,
} from "@/frontier/game/multiplayer/serverStatus";

describe("multiplayer server status helpers", () => {
  it("maps websocket URLs to HTTP health bases", () => {
    expect(multiplayerHttpBase("ws://localhost:2567")).toBe("http://localhost:2567");
    expect(multiplayerHttpBase("wss://the-frontier-colyseus.herokuapp.com/")).toBe(
      "https://the-frontier-colyseus.herokuapp.com",
    );
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
