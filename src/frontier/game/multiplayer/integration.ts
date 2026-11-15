/**
 * Multiplayer integration layer.
 *
 * Connects FrontierClient (Colyseus networking), RemotePlayerManager (PlayCanvas 3D rendering),
 * StormVisualController (environmental hazards), and SimulationManager (game state / actions).
 */

import { FrontierClient } from "./client";
import { RemotePlayerManager } from "./remotePlayers";
import { StormVisualController } from "./stormVisuals";
import type { PlayCanvasLunarWorld } from "../playcanvasWorld";
import type { SimulationManager } from "../simulation";
import type { GameAction, PingData, RemotePlayer } from "./types";

export class MultiplayerIntegration {
  public client: FrontierClient;
  public world: PlayCanvasLunarWorld | null = null;
  public sim: SimulationManager | null = null;
  public remotePlayerManager: RemotePlayerManager | null = null;
  public stormController: StormVisualController | null = null;

  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;
  private isOwnClient = false;
  private cleanupCallbacks: (() => void) | null = null;

  constructor(client?: FrontierClient | null) {
    if (client) {
      this.client = client;
      this.isOwnClient = false;
    } else {
      this.client = new FrontierClient();
      this.isOwnClient = true;
    }
  }

  /**
   * Initializes integration with the 3D world and simulation manager.
   */
  public init(
    world: PlayCanvasLunarWorld,
    sim: SimulationManager,
    client?: FrontierClient | null
  ): void {
    if (this.isDestroyed) return;
    this.world = world;
    this.sim = sim;

    if (client) {
      this.client = client;
    }

    // Attach remotePlayerManager and stormController from world if available
    this.remotePlayerManager =
      world.remotePlayerManager ??
      (world.getRemotePlayerManager ? world.getRemotePlayerManager() : null);

    this.stormController =
      world.stormController ??
      (world.getStormController ? world.getStormController() : null);

    // Subscribe to client events
    this.setupClientSubscriptions();

    // Start 15 Hz position sending (~66ms interval)
    this.startPositionSync();
  }

  /**
   * Updates active client instance if changed.
   */
  public setClient(client: FrontierClient): void {
    if (this.client === client) return;
    if (this.cleanupCallbacks) {
      this.cleanupCallbacks();
    }
    this.client = client;
    this.setupClientSubscriptions();
  }

  /**
   * Sets or overrides the remote player manager.
   */
  public setRemotePlayerManager(mgr: RemotePlayerManager | null): void {
    this.remotePlayerManager = mgr;
  }

  /**
   * Sets or overrides the storm visual controller.
   */
  public setStormController(ctrl: StormVisualController | null): void {
    this.stormController = ctrl;
  }

  private setupClientSubscriptions(): void {
    if (!this.client) return;

    const prevCallbacks = { ...this.client.callbacks };

    this.client.callbacks = {
      ...prevCallbacks,

      onPlayerJoin: (player: RemotePlayer) => {
        prevCallbacks.onPlayerJoin?.(player);
        if (
          player.sessionId !== this.client.sessionId &&
          this.remotePlayerManager
        ) {
          this.remotePlayerManager.addPlayer(
            player.sessionId,
            player.name,
            player.color,
            player.seat
          );
        }
      },

      onPlayerLeave: (sessionId: string) => {
        prevCallbacks.onPlayerLeave?.(sessionId);
        if (this.remotePlayerManager) {
          this.remotePlayerManager.removePlayer(sessionId);
        }
      },

      onPlayerMove: (player: RemotePlayer) => {
        prevCallbacks.onPlayerMove?.(player);
        if (
          player.sessionId !== this.client.sessionId &&
          this.remotePlayerManager
        ) {
          this.remotePlayerManager.updatePlayer(
            player.sessionId,
            player.x,
            player.z,
            player.rotation,
            player.inRover
          );
        }
      },

      onChat: (chat) => {
        prevCallbacks.onChat?.(chat);
        if (this.remotePlayerManager) {
          this.remotePlayerManager.showChat(chat.sender, chat.message);
        }
      },

      onPing: (ping: PingData) => {
        prevCallbacks.onPing?.(ping);
        if (this.remotePlayerManager) {
          this.remotePlayerManager.showPing(ping.x, ping.z, ping.color);
        }
      },

      onAction: (action: GameAction & { sender: string }) => {
        prevCallbacks.onAction?.(action);
        if (action.sender !== this.client.sessionId) {
          this.handleRemoteAction(action);
        }
      },
    };

    this.cleanupCallbacks = () => {
      if (this.client) {
        this.client.callbacks = prevCallbacks;
      }
    };
  }

  private startPositionSync(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
    }

    // 15 Hz = ~66.6ms
    this.positionInterval = setInterval(() => {
      this.sendLocalPosition();
    }, 66);
  }

  /**
   * Broadcasts local player position to the server at 15 Hz.
   */
  public sendLocalPosition(): void {
    if (this.isDestroyed || !this.sim || !this.client) return;
    const state = this.sim.state;
    if (!state || !state.player) return;

    const inRover = Boolean(state.player.inRover);
    const x = inRover ? state.rover.x : state.player.x;
    const z = inRover ? state.rover.z : state.player.z;
    const rot = inRover ? state.rover.rotation : state.player.rotation;

    this.client.sendMove(x, z, rot);
  }

  /**
   * Handles incoming game action messages from peers (broadcast by server).
   */
  public handleRemoteAction(action: GameAction): void {
    if (!this.sim) return;
    const state = this.sim.state;

    switch (action.type) {
      case "install_panel":
        if (typeof this.sim.installPanel === "function") {
          this.sim.installPanel();
        }
        break;

      case "mine_ice": {
        const targetId = parseInt(action.siteId, 10);
        const site = isNaN(targetId)
          ? state.iceSites?.find((s) => s.id.toString() === action.siteId)
          : state.iceSites?.find((s) => s.id === targetId);
        if (site && typeof this.sim.fillIce === "function") {
          this.sim.fillIce(site.id);
        }
        break;
      }

      case "build_module":
        if (
          (action.moduleId === "A" || action.moduleId === "B" || action.moduleId === "C") &&
          typeof this.sim.startBuilding === "function"
        ) {
          this.sim.startBuilding(action.moduleId);
        }
        break;

      case "repair":
        if (action.targetId === "rover" && typeof this.sim.repairRover === "function") {
          this.sim.repairRover();
        } else if (
          (action.targetId === "A" || action.targetId === "B" || action.targetId === "C") &&
          typeof this.sim.repairModule === "function"
        ) {
          this.sim.repairModule(action.targetId);
        }
        break;

      case "activate_antenna":
        if (typeof this.sim.lockAntenna === "function") {
          this.sim.lockAntenna();
        }
        break;

      case "harvest_water":
        if (typeof this.sim.unloadWater === "function") {
          this.sim.unloadWater();
        }
        break;

      case "charge_battery":
      case "deploy_relay":
      default:
        break;
    }
  }

  /**
   * Called each frame for position interpolation and animations.
   */
  public update(dt: number): void {
    if (this.isDestroyed) return;
    this.remotePlayerManager?.update(dt);
  }

  /**
   * Cleans up intervals, subscriptions, and references.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }

    if (this.cleanupCallbacks) {
      this.cleanupCallbacks();
      this.cleanupCallbacks = null;
    }

    if (this.isOwnClient && this.client) {
      this.client.disconnect();
    }

    this.world = null;
    this.sim = null;
    this.remotePlayerManager = null;
    this.stormController = null;
  }
}
