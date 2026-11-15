/**
 * Remote multiplayer player rendering for PlayCanvas.
 *
 * Manages 3D astronaut figures for 2–3 remote players, with smooth position
 * interpolation, walking animation, chat bubbles, and ping markers.
 *
 * Does NOT modify any existing file — it is imported by playcanvasWorld.ts
 * when multiplayer is integrated.
 */

import * as pc from "playcanvas";
import { mkMat, part, type Vec3Tuple, type PrimitiveShape } from "../sceneKit";
import { PLAYER_COLORS, type RemotePlayer } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a hex colour string (#RRGGBB) into [r, g, b] in 0–1 range. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Lerp a single number. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-arc angular lerp in radians. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Normalise to (-PI, PI]
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// ---------------------------------------------------------------------------
// Interpolation buffer
// ---------------------------------------------------------------------------

interface PositionSnapshot {
  x: number;
  z: number;
  rotation: number; // radians
  time: number; // local performance.now() when received
}

/**
 * Buffers the last few network snapshots and interpolates between them.
 * Renders one snapshot behind the latest so there is always a pair to lerp.
 */
class InterpolationBuffer {
  private buf: PositionSnapshot[] = [];
  private readonly delay: number; // ms to render behind latest snapshot

  constructor(delayMs = 100) {
    this.delay = delayMs;
  }

  push(x: number, z: number, rotation: number) {
    const now = performance.now();
    this.buf.push({ x, z, rotation, time: now });
    // Keep at most 6 snapshots
    if (this.buf.length > 6) this.buf.shift();
  }

  /** Returns interpolated (x, z, rotation) for the current render time. */
  sample(): { x: number; z: number; rotation: number; speed: number } | null {
    if (this.buf.length === 0) return null;
    if (this.buf.length === 1) {
      const s = this.buf[0]!;
      return { x: s.x, z: s.z, rotation: s.rotation, speed: 0 };
    }

    const renderTime = performance.now() - this.delay;

    // Find the two snapshots that straddle renderTime
    let i = 0;
    for (; i < this.buf.length - 1; i++) {
      if (this.buf[i + 1]!.time >= renderTime) break;
    }

    const a = this.buf[i]!;
    const b = this.buf[Math.min(i + 1, this.buf.length - 1)]!;

    if (a === b) {
      return { x: a.x, z: a.z, rotation: a.rotation, speed: 0 };
    }

    const span = b.time - a.time;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.time) / span)) : 1;

    const x = lerp(a.x, b.x, t);
    const z = lerp(a.z, b.z, t);
    const rotation = lerpAngle(a.rotation, b.rotation, t);

    // Speed estimate (metres / second) for walk animation
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = span > 0 ? (dist / span) * 1000 : 0;

    // Drop stale snapshots we have moved past
    while (this.buf.length > 2 && this.buf[1]!.time < renderTime) {
      this.buf.shift();
    }

    return { x, z, rotation, speed };
  }
}

// ---------------------------------------------------------------------------
// RemotePlayerEntity — one remote astronaut
// ---------------------------------------------------------------------------

export class RemotePlayerEntity {
  public readonly sessionId: string;
  public readonly entity: pc.Entity;

  private limbs: {
    lArm: pc.Entity;
    rArm: pc.Entity;
    lLeg: pc.Entity;
    rLeg: pc.Entity;
  };
  private nameTag: pc.Entity | null = null;
  private ringEntity: pc.Entity;
  private chatBubble: HTMLDivElement | null = null;
  private chatTimer = 0;
  private walkPhase = 0;
  private interp = new InterpolationBuffer(100);
  private suitColor: [number, number, number];
  private _inRover = false;
  private _name: string;
  private app: pc.Application;

  constructor(
    app: pc.Application,
    root: pc.Entity,
    sessionId: string,
    name: string,
    colorHex: string,
    _seat: number,
  ) {
    this.app = app;
    this.sessionId = sessionId;
    this._name = name;
    this.suitColor = hexToRgb(colorHex);
    const [r, g, b] = this.suitColor;

    this.entity = new pc.Entity(`Remote_${sessionId}`);

    // ---- materials ---------------------------------------------------
    const suit = mkMat(0.93 * 0.4 + r * 0.6, 0.93 * 0.4 + g * 0.6, 0.95 * 0.4 + b * 0.6, {
      metal: 0.02,
      gloss: 0.3,
    });
    const joint = mkMat(0.75, 0.76, 0.8, { metal: 0.1, gloss: 0.35 });
    const visor = mkMat(0.95, 0.7, 0.2, { metal: 1, gloss: 0.95 });
    const pack = mkMat(0.82, 0.83, 0.86, { metal: 0.2, gloss: 0.4 });
    const dark = mkMat(0.15, 0.15, 0.17, { metal: 0.3, gloss: 0.4 });
    const accentMat = mkMat(r, g, b, { emissive: 1.2 });

    // ---- torso -------------------------------------------------------
    const P = this.entity;
    part(P, "capsule", [0.58, 0.54, 0.44], [0, 1.24, 0], suit, [0, 0, 0], "Torso");
    part(P, "sphere", [0.26, 0.22, 0.26], [-0.34, 1.44, 0], suit, [0, 0, 0], "ShoulderL");
    part(P, "sphere", [0.26, 0.22, 0.26], [0.34, 1.44, 0], suit, [0, 0, 0], "ShoulderR");
    part(P, "cylinder", [0.44, 0.08, 0.44], [0, 1.54, 0], joint, [0, 0, 0], "Collar");
    part(P, "cylinder", [0.48, 0.20, 0.38], [0, 0.94, 0], joint, [0, 0, 0], "Waist");
    part(P, "box", [0.34, 0.20, 0.08], [0, 1.22, 0.24], pack, [0, 0, 0], "ChestUnit");
    // Colour stripes on chest for quick ID
    part(P, "box", [0.08, 0.06, 0.02], [-0.08, 1.22, 0.285], accentMat, [0, 0, 0], "Badge1");
    part(P, "box", [0.08, 0.06, 0.02], [0.08, 1.22, 0.285], accentMat, [0, 0, 0], "Badge2");
    part(P, "box", [0.14, 0.09, 0.01], [0.24, 1.35, 0.225], accentMat, [0, 0, 0], "Patch");

    // ---- helmet ------------------------------------------------------
    part(P, "sphere", [0.54, 0.52, 0.52], [0, 1.74, 0], suit, [0, 0, 0], "Helmet");
    part(P, "sphere", [0.44, 0.36, 0.34], [0, 1.74, 0.15], visor, [0, 0, 0], "Visor");
    part(P, "box", [0.40, 0.05, 0.14], [0, 1.89, 0.16], suit, [-15, 0, 0], "Brow");
    part(P, "cylinder", [0.07, 0.10, 0.07], [0.24, 1.85, 0.12], pack, [-70, 0, 0], "HLampMount");
    part(P, "sphere", [0.06, 0.04, 0.06], [0.24, 1.85, 0.17], accentMat, [0, 0, 0], "HLamp");

    // ---- backpack ----------------------------------------------------
    part(P, "box", [0.56, 0.74, 0.30], [0, 1.22, -0.34], pack, [0, 0, 0], "PLSS");
    part(P, "cylinder", [0.52, 0.10, 0.26], [0, 1.62, -0.34], joint, [0, 0, 0], "PackTop");
    part(P, "cylinder", [0.04, 0.45, 0.04], [0.22, 1.85, -0.38], dark, [0, 0, 0], "Antenna");

    // ---- limbs -------------------------------------------------------
    const makeLimb = (x: number, y: number, len: number, w: number): pc.Entity => {
      const pivot = new pc.Entity("Limb");
      pivot.setLocalPosition(x, y, 0);
      P.addChild(pivot);
      part(pivot, "cylinder", [w, len * 0.48, w], [0, -len * 0.24, 0], suit);
      part(pivot, "cylinder", [w * 1.14, 0.08, w * 1.14], [0, -len * 0.5, 0], joint);
      part(pivot, "cylinder", [w * 0.94, len * 0.44, w * 0.94], [0, -len * 0.74, 0], suit);
      return pivot;
    };

    const lArm = makeLimb(-0.42, 1.42, 0.7, 0.18);
    const rArm = makeLimb(0.42, 1.42, 0.7, 0.18);
    part(lArm, "cylinder", [0.19, 0.05, 0.19], [0, -0.72, 0], joint);
    part(rArm, "cylinder", [0.19, 0.05, 0.19], [0, -0.72, 0], joint);
    part(lArm, "capsule", [0.17, 0.20, 0.17], [0, -0.76, 0.02], dark, [0, 0, 0], "GloveL");
    part(rArm, "capsule", [0.17, 0.20, 0.17], [0, -0.76, 0.02], dark, [0, 0, 0], "GloveR");

    const lLeg = makeLimb(-0.17, 0.82, 0.72, 0.22);
    const rLeg = makeLimb(0.17, 0.82, 0.72, 0.22);
    for (const [leg, side] of [[lLeg, "L"], [rLeg, "R"]] as const) {
      part(leg, "cylinder", [0.24, 0.06, 0.24], [0, -0.66, 0.02], joint);
      part(leg, "box", [0.26, 0.08, 0.38], [0, -0.74, 0.06], dark, [0, 0, 0], `BootSole${side}`);
      part(leg, "sphere", [0.25, 0.15, 0.24], [0, -0.70, 0.18], dark, [0, 0, 0], `BootToe${side}`);
    }
    this.limbs = { lArm, rArm, lLeg, rLeg };

    // ---- identification ring under feet ------------------------------
    const ringMat = mkMat(r, g, b, { emissive: 2.5, opacity: 0.45, additive: true });
    this.ringEntity = part(P, "torus", [1.2, 0.08, 1.2], [0, 0.05, 0], ringMat, [0, 0, 0], "Ring");

    // ---- floating name tag (billboard entity) ------------------------
    this.initNameTag(name, colorHex);

    root.addChild(this.entity);
  }

  // ------------------------------------------------------------------
  // Name tag — canvas-texture billboard
  // ------------------------------------------------------------------

  private initNameTag(name: string, colorHex: string) {
    const device = this.app.graphicsDevice;
    if (!device) return;

    const canvas = document.createElement("canvas");
    const pxPerChar = 28;
    canvas.width = Math.max(128, name.length * pxPerChar + 32);
    canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Semi-transparent dark background pill
    const pad = 12;
    const bw = canvas.width - pad * 2;
    const bh = canvas.height - 8;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(pad, 4, bw, bh, bh / 2);
    ctx.fill();
    // Text
    ctx.fillStyle = colorHex;
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const tex = new pc.Texture(device, {
      width: canvas.width,
      height: canvas.height,
      format: pc.PIXELFORMAT_SRGBA8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    tex.setSource(canvas);

    const mat = new pc.StandardMaterial();
    mat.emissiveMap = tex;
    mat.emissive = new pc.Color(1, 1, 1);
    mat.emissiveIntensity = 1;
    mat.opacityMap = tex;
    mat.opacity = 1;
    mat.blendType = pc.BLEND_NORMAL;
    mat.depthWrite = false;
    mat.useLighting = false;
    mat.useFog = false;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();

    const tag = new pc.Entity("NameTag");
    tag.addComponent("render", {
      type: "plane",
      castShadows: false,
      receiveShadows: false,
    });
    tag.render!.material = mat;
    const aspect = canvas.width / canvas.height;
    const tagHeight = 0.35;
    tag.setLocalScale(tagHeight * aspect, 1, tagHeight);
    tag.setLocalPosition(0, 2.35, 0);
    tag.setLocalEulerAngles(-90, 0, 0); // plane faces +Y by default, rotate to face camera
    this.entity.addChild(tag);
    this.nameTag = tag;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  setPosition(x: number, z: number, rotation: number) {
    this.interp.push(x, z, rotation);
  }

  get name(): string {
    return this._name;
  }

  get inRover(): boolean {
    return this._inRover;
  }

  setInRover(inRover: boolean) {
    this._inRover = inRover;
    this.entity.enabled = !inRover;
  }

  setName(name: string) {
    this._name = name;
    // Rebuild the name tag
    if (this.nameTag) {
      this.nameTag.destroy();
      this.nameTag = null;
    }
    const [r, g, b] = this.suitColor;
    const hex = `#${Math.round(r * 255)
      .toString(16)
      .padStart(2, "0")}${Math.round(g * 255)
      .toString(16)
      .padStart(2, "0")}${Math.round(b * 255)
      .toString(16)
      .padStart(2, "0")}`;
    this.initNameTag(name, hex);
  }

  showChat(message: string) {
    this.removeChatBubble();
    const canvas = this.app.graphicsDevice.canvas as HTMLCanvasElement;
    const container = canvas.parentElement;
    if (!container) return;

    const bubble = document.createElement("div");
    bubble.textContent = message;
    Object.assign(bubble.style, {
      position: "absolute",
      padding: "6px 14px",
      borderRadius: "14px",
      background: "rgba(0,0,0,0.72)",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "600",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: "100",
      transform: "translate(-50%, -100%)",
      transition: "opacity 0.3s",
      opacity: "1",
    });
    container.style.position = "relative";
    container.appendChild(bubble);
    this.chatBubble = bubble;
    this.chatTimer = 3.0;
  }

  /** Frame update — call every frame with dt in seconds. */
  update(dt: number, camera: pc.CameraComponent | null) {
    if (this._inRover) return;

    const sample = this.interp.sample();
    if (sample) {
      this.entity.setPosition(sample.x, this.entity.getPosition().y, sample.z);
      this.entity.setEulerAngles(0, (sample.rotation * 180) / Math.PI, 0);

      // Walk animation
      this.walkPhase += dt * (2 + sample.speed * 1.1);
      const amp = Math.min(35, sample.speed * 7);
      const sw = amp > 0.5 ? Math.sin(this.walkPhase) * amp : 0;
      this.limbs.lLeg.setLocalEulerAngles(sw, 0, 0);
      this.limbs.rLeg.setLocalEulerAngles(-sw, 0, 0);
      this.limbs.lArm.setLocalEulerAngles(-sw * 0.8, 0, -8);
      this.limbs.rArm.setLocalEulerAngles(sw * 0.8, 0, 8);
    }

    // Billboard the name tag toward the camera
    if (this.nameTag && camera) {
      const camPos = camera.entity.getPosition();
      const tagPos = this.nameTag.getPosition();
      const dx = camPos.x - tagPos.x;
      const dz = camPos.z - tagPos.z;
      const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
      this.nameTag.setEulerAngles(-90, yaw, 0);
    }

    // Chat bubble positioning
    if (this.chatBubble && camera) {
      this.chatTimer -= dt;
      if (this.chatTimer <= 0) {
        this.removeChatBubble();
      } else {
        // Fade out in the last 0.5s
        if (this.chatTimer < 0.5) {
          this.chatBubble.style.opacity = String(this.chatTimer / 0.5);
        }
        // Project world position to screen
        const worldPos = new pc.Vec3(
          this.entity.getPosition().x,
          this.entity.getPosition().y + 2.6,
          this.entity.getPosition().z,
        );
        const screen = new pc.Vec3();
        camera.worldToScreen(worldPos, screen);
        const canvas = this.app.graphicsDevice.canvas as HTMLCanvasElement;
        if (screen.z > 0 && screen.z < 1) {
          this.chatBubble.style.left = `${screen.x}px`;
          this.chatBubble.style.top = `${screen.y}px`;
          this.chatBubble.style.display = "block";
        } else {
          this.chatBubble.style.display = "none";
        }
      }
    }
  }

  destroy() {
    this.removeChatBubble();
    this.entity.destroy();
  }

  private removeChatBubble() {
    if (this.chatBubble) {
      this.chatBubble.remove();
      this.chatBubble = null;
      this.chatTimer = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Ping marker — a pulsing beacon column
// ---------------------------------------------------------------------------

interface PingMarker {
  entity: pc.Entity;
  beamMat: pc.StandardMaterial;
  ringMat: pc.StandardMaterial;
  age: number;
  maxAge: number;
}

// ---------------------------------------------------------------------------
// RemotePlayerManager
// ---------------------------------------------------------------------------

export class RemotePlayerManager {
  private players = new Map<string, RemotePlayerEntity>();
  private pings: PingMarker[] = [];
  private root: pc.Entity;
  private app: pc.Application;
  private camera: pc.CameraComponent | null = null;

  constructor(app: pc.Application, rootEntity: pc.Entity) {
    this.app = app;
    this.root = new pc.Entity("RemotePlayers");
    rootEntity.addChild(this.root);
  }

  /** Set the camera used for billboarding and chat bubble projection. */
  setCamera(camera: pc.CameraComponent) {
    this.camera = camera;
  }

  addPlayer(sessionId: string, name: string, color: string, seat: number): RemotePlayerEntity {
    // Remove if already exists (reconnect)
    this.removePlayer(sessionId);

    const player = new RemotePlayerEntity(this.app, this.root, sessionId, name, color, seat);
    this.players.set(sessionId, player);
    return player;
  }

  removePlayer(sessionId: string) {
    const p = this.players.get(sessionId);
    if (p) {
      p.destroy();
      this.players.delete(sessionId);
    }
  }

  updatePlayer(sessionId: string, x: number, z: number, rotation: number, inRover: boolean) {
    const p = this.players.get(sessionId);
    if (!p) return;
    p.setPosition(x, z, rotation);
    p.setInRover(inRover);
  }

  showChat(sessionId: string, message: string) {
    const p = this.players.get(sessionId);
    if (p) p.showChat(message);
  }

  /** Place a pulsing ping beacon at (x, z) that fades after 5 seconds. */
  showPing(x: number, z: number, color: string) {
    const [r, g, b] = hexToRgb(color);

    const pingRoot = new pc.Entity("Ping");
    pingRoot.setPosition(x, 0, z);

    // Vertical beam
    const beamMat = mkMat(r, g, b, { emissive: 3, opacity: 0.5, additive: true });
    part(pingRoot, "cylinder", [0.3, 20, 0.3], [0, 10, 0], beamMat, [0, 0, 0], "Beam");

    // Ground ring
    const ringMat = mkMat(r, g, b, { emissive: 2.5, opacity: 0.6, additive: true });
    part(pingRoot, "torus", [2, 0.12, 2], [0, 0.1, 0], ringMat, [0, 0, 0], "PingRing");

    // Point light for local illumination
    const light = new pc.Entity("PingLight");
    light.addComponent("light", {
      type: "point",
      color: new pc.Color(r, g, b),
      intensity: 4,
      range: 12,
      castShadows: false,
    });
    light.setLocalPosition(0, 3, 0);
    pingRoot.addChild(light);

    this.app.root.addChild(pingRoot);
    this.pings.push({ entity: pingRoot, beamMat, ringMat, age: 0, maxAge: 5 });
  }

  /** Call every frame with dt in seconds. */
  update(dt: number) {
    // Update all remote players
    for (const p of this.players.values()) {
      p.update(dt, this.camera);
    }

    // Update ping markers
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i]!;
      ping.age += dt;

      if (ping.age >= ping.maxAge) {
        ping.entity.destroy();
        this.pings.splice(i, 1);
        continue;
      }

      // Pulsing: oscillate opacity
      const life = 1 - ping.age / ping.maxAge; // 1 → 0
      const pulse = 0.5 + 0.5 * Math.sin(ping.age * 6);
      const alpha = life * pulse;
      ping.beamMat.opacity = alpha * 0.5;
      ping.beamMat.update();
      ping.ringMat.opacity = alpha * 0.6;
      ping.ringMat.update();

      // Expand ring over time
      const scale = 1 + ping.age * 0.4;
      const ringChild = ping.entity.findByName("PingRing");
      if (ringChild) {
        ringChild.setLocalScale(scale * 2, 0.12, scale * 2);
      }
    }
  }

  getAll(): RemotePlayerEntity[] {
    return [...this.players.values()];
  }

  getPlayer(sessionId: string): RemotePlayerEntity | undefined {
    return this.players.get(sessionId);
  }

  get count(): number {
    return this.players.size;
  }

  destroy() {
    for (const p of this.players.values()) {
      p.destroy();
    }
    this.players.clear();
    for (const ping of this.pings) {
      ping.entity.destroy();
    }
    this.pings = [];
    this.root.destroy();
  }
}
