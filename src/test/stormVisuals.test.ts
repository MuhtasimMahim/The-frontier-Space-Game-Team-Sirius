import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pc from "playcanvas";
import { StormVisualController } from "../frontier/game/multiplayer/stormVisuals";
import {
  MultiplayerLobbyUI,
  MultiplayerHUDOverlay,
} from "../frontier/game/multiplayer/MultiplayerUI";
import { useMultiplayer } from "../frontier/game/multiplayer/useMultiplayer";

describe("StormVisualController Logic", () => {
  let app: pc.Application;
  let sunEntity: pc.Entity;
  let cameraEntity: pc.Entity;
  let controller: StormVisualController;

  beforeEach(() => {
    const root = new pc.Entity("MockRoot");
    app = {
      root,
      systems: undefined,
      graphicsDevice: {
        canvas: { parentElement: document.createElement("div") },
      },
      scene: {
        ambientLight: new pc.Color(0.04, 0.04, 0.06),
        fog: {
          start: 900,
          end: 3600,
          color: new pc.Color(0.02, 0.025, 0.04),
        },
      },
    } as unknown as pc.Application;
    (pc.Application as unknown as { getApplication: () => pc.Application }).getApplication = () => app;

    sunEntity = new pc.Entity("SunLight");
    (sunEntity as unknown as { light: { intensity: number; color: pc.Color } }).light = {
      intensity: 1.4,
      color: new pc.Color(1, 0.95, 0.9),
    };
    root.addChild(sunEntity);

    cameraEntity = new pc.Entity("MainCamera");
    cameraEntity.rotateLocal = vi.fn();
    root.addChild(cameraEntity);

    controller = new StormVisualController(app, sunEntity, null, cameraEntity);
  });

  it("initializes with stormBlend at 0 and baseline lighting", () => {
    expect(controller.stormBlend).toBe(0);
    expect(sunEntity.light?.intensity).toBeCloseTo(1.4, 2);
  });

  it("modulates lighting and ramps stormBlend up during solar storm", () => {
    for (let i = 0; i < 20; i++) {
      controller.update(0.1, true, null);
    }

    expect(controller.stormBlend).toBeGreaterThan(0.9);
    // Dimmed to 30% of 1.4 = 0.42
    expect(sunEntity.light?.intensity).toBeLessThan(0.6);
    expect(sunEntity.light?.intensity).toBeGreaterThan(0.35);
  });

  it("smoothly restores to clear over 2 seconds when storm ends", () => {
    // Ramp up
    for (let i = 0; i < 20; i++) {
      controller.update(0.1, true, null);
    }
    expect(controller.stormBlend).toBeGreaterThan(0.9);

    // Clear storm for 2.2 seconds
    for (let i = 0; i < 22; i++) {
      controller.update(0.1, false, null);
    }

    expect(controller.stormBlend).toBe(0);
    expect(sunEntity.light?.intensity).toBeCloseTo(1.4, 1);
  });

  it("triggers micrometeor impact when eventBanner is meteor active", () => {
    const impactSpy = vi.spyOn(controller, "triggerMicrometeorImpact");

    // Warning does not trigger
    controller.update(0.1, false, { kind: "meteor", phase: "warning" });
    expect(impactSpy).not.toHaveBeenCalled();

    // Active triggers
    controller.update(0.1, false, { kind: "meteor", phase: "active" });
    expect(impactSpy).toHaveBeenCalledTimes(1);

    // Continuing in active phase does not re-trigger
    controller.update(0.1, false, { kind: "meteor", phase: "active" });
    expect(impactSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans up entities and restores scene parameters on destroy()", () => {
    controller.update(0.5, true, null);
    controller.destroy();
    expect(sunEntity.light?.intensity).toBeCloseTo(1.4, 2);
  });
});

describe("Multiplayer UI & Hook definitions", () => {
  it("exports MultiplayerLobbyUI and MultiplayerHUDOverlay components", () => {
    expect(MultiplayerLobbyUI).toBeDefined();
    expect(typeof MultiplayerLobbyUI).toBe("function");
    expect(MultiplayerHUDOverlay).toBeDefined();
    expect(typeof MultiplayerHUDOverlay).toBe("function");
  });

  it("exports useMultiplayer hook function", () => {
    expect(useMultiplayer).toBeDefined();
    expect(typeof useMultiplayer).toBe("function");
  });
});
