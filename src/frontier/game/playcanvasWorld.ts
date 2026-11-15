import { RULES, holdStep, crystalScale, damagedMaxSpeed, canStartBoost } from "./rules";
import {
  DOCK,
  RECOVERY_CONSOLE,
  HAB_DOOR,
  ORIENT_CONSOLE,
  SOLAR_TRACKER,
  SOLAR_FIELD,
  HIDDEN_ICE,
  gameSim,
  type MissionStage,
  type SimulationManager,
} from "./simulation";
import { BASES, type BaseId } from "./network";
import * as pc from "playcanvas";
import { CONFIG, type IceSiteDef, type ModuleId } from "./config";
import { sound } from "./soundEngine";
import {
  makeAstronaut,
  makeRover,
  stepAstronaut,
  stepRover,
  ROVER_PHYS,
  type Astronaut,
  type Rover,
  type Obstacle,
} from "./lunarPhysics";
import {
  groundPatchMesh,
  ModelKit,
  mkMat,
  part,
  solarCellTexture,
  type KitModel,
  type PrimitiveShape,
  type Vec3Tuple,
} from "./sceneKit";
import {
  PLAY_RADIUS,
  SITE_LOOK,
  SUNLESS_MASK,
  buildSky,
  buildTerrain,
  type SiteLook,
  type SkyRig,
} from "./siteScene";
import { StoryScene } from "./storyScene";
import {
  distToSegment,
  EARTH_DIRECTION,
  makeSiteTerrain,
  mulberry32,
  type Point,
  type SiteKey,
  type SiteTerrain,
} from "./sites";
import {
  STORY,
  STORY_CHAPTERS,
  STORY_CHAPTER_IDS,
  chapterRoute,
  currentStep,
  type StoryChapterDef,
} from "./storyline";
import { RemotePlayerManager } from "./multiplayer/remotePlayers";
import { StormVisualController } from "./multiplayer/stormVisuals";

export type Quality = "low" | "medium" | "high";
export function detectQuality(): Quality {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile || cores <= 4) return "low";
  return cores >= 8 ? "high" : "medium";
}

/** Camp Sirius mint; story camps use their chapter accent. */
const SIRIUS_ACCENT = "#7EE0B8";

interface NamedObstacle extends Obstacle {
  id?: string;
}
interface IceEntityRecord {
  id: number;
  entity: pc.Entity;
  crystal: pc.Entity;
  baseScale: pc.Vec3;
}
interface DevWindow extends Window {
  __world?: PlayCanvasLunarWorld;
  __gameSim?: SimulationManager;
}

const codeKey = (c: string) => (c.startsWith("Key") ? c.slice(3).toLowerCase() : c.toLowerCase());

export class PlayCanvasLunarWorld {
  public app: pc.Application;
  public cameraEntity!: pc.Entity;
  public lightEntity!: pc.Entity;
  public remotePlayerManager!: RemotePlayerManager;
  public stormController!: StormVisualController;

  // Scene Entities
  private playerEntity!: pc.Entity;
  private roverEntity!: pc.Entity;
  private landerEntity!: pc.Entity;
  private panelEntities: pc.Entity[] = [];
  private moduleEntities: Partial<Record<ModuleId, pc.Entity>> = {};
  private iceRoot: pc.Entity | null = null;
  private iceEntities: IceEntityRecord[] = [];

  // Controls & Physics
  private keys: Record<string, boolean> = {};
  private terrainHeightMap: (x: number, z: number) => number;
  public readonly siteKey: SiteKey;
  private terrain: SiteTerrain;
  private look: SiteLook;
  private storyDef: StoryChapterDef | null;
  private story: StoryScene | null = null;
  private kit: ModelKit;
  private sky: SkyRig | null = null;
  private fillLight: pc.Entity | null = null;
  private helmetLight: pc.Entity | null = null;
  private roverIceCargo: pc.Entity | null = null;
  private beaconMats: pc.StandardMaterial[] = [];
  private dark = 0;
  private edgeWarned = false;
  private isDestroyed: boolean = false;
  private astro!: Astronaut;
  private rover!: Rover;
  private obstacles: NamedObstacle[] = [];
  private jumpQueued = false;
  private flipTimer = 0;
  private dust: { e: pc.Entity; vx: number; vy: number; vz: number; life: number }[] = [];
  private dustIdx = 0;
  private stepTimer = 0;
  private stormBlend = 0;
  private meteorDaySeen = -1;
  private cameraFrame: pc.CameraFrame | null = null;
  private canvas: HTMLCanvasElement;

  // GTA-style Orbit Camera & Mouse Controls
  public camYaw: number = 0; // horizontal orbit angle (rad): 0 = looking -Z (North)
  public camPitch: number = 0.35; // vertical angle (rad): ~20 deg above horizon
  public camDist: number = 14; // astronaut camera distance (m)
  public camDistRover: number = 16; // rover camera distance (m)
  private isPointerLocked: boolean = false;
  private isMouseDown: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private mouseSensitivity: number = 0.003;
  private roverAutoCenterTimer: number = 0;
  private lastInRover: boolean = false;

  private onResize!: () => void;
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onKeyUp!: (e: KeyboardEvent) => void;
  private onBlur!: () => void;
  private onMouseDown!: (e: MouseEvent) => void;
  private onMouseMove!: (e: MouseEvent) => void;
  private onMouseUp!: (e: MouseEvent) => void;
  private onWheel!: (e: WheelEvent) => void;
  private onPointerLockChange!: () => void;
  private onContextMenu!: (e: MouseEvent) => void;

  public quality: Quality = "medium";
  public get modelsLoaded() {
    return this.kit.loaded;
  }
  public get modelsTotal() {
    return this.kit.total;
  }

  constructor(canvas: HTMLCanvasElement, siteKey: SiteKey = "nobile") {
    this.canvas = canvas;
    this.app = new pc.Application(canvas, {
      keyboard: new pc.Keyboard(window),
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: {
        antialias: true,
        powerPreference: "high-performance",
      },
    });

    this.app.start();
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // One analytic height function per site, shared by drawing and driving
    this.siteKey = siteKey;
    this.terrain = makeSiteTerrain(siteKey, {
      iceCraters: siteKey === "nobile" ? [...CONFIG.ICE_SITES, ...HIDDEN_ICE] : [],
    });
    this.terrainHeightMap = this.terrain.height;
    this.look = SITE_LOOK[siteKey];
    const storyId = STORY_CHAPTER_IDS.find((id) => STORY_CHAPTERS[id].siteKey === siteKey);
    this.storyDef = storyId ? STORY_CHAPTERS[storyId] : null;
    this.quality = (localStorage.getItem("frontier-quality") as Quality) || detectQuality();
    this.kit = new ModelKit(
      this.app,
      () => this.isDestroyed,
      () => this.quality !== "low",
      this.accent(),
    );
    this.initScene();
    this.initDust();
    this.loadModels();
    this.applyQuality(this.quality);
    this.setupInputs();

    this.remotePlayerManager = new RemotePlayerManager(this.app, this.app.root);
    if (this.cameraEntity?.camera) {
      this.remotePlayerManager.setCamera(this.cameraEntity.camera);
    }
    this.stormController = new StormVisualController(
      this.app,
      this.lightEntity,
      this.sky,
      this.cameraEntity,
      this.terrainHeightMap,
    );

    this.app.on("update", (dt: number) => this.update(dt));
    if (import.meta.env.DEV) {
      const devWin = window as DevWindow;
      devWin.__world = this;
      devWin.__gameSim = gameSim;
    }

    this.onResize = () => {
      if (this.isDestroyed || !this.app.graphicsDevice) return;
      this.app.resizeCanvas();
    };
    window.addEventListener("resize", this.onResize);
  }

  private initScene() {
    // 1. Camera
    this.cameraEntity = new pc.Entity("MainCamera");
    this.cameraEntity.addComponent("camera", {
      clearColor: new pc.Color(0.006, 0.008, 0.016), // Deep space black
      farClip: 5000,
      nearClip: 0.1,
      fov: 65,
    });
    this.cameraEntity.setPosition(0, 15, 30);
    this.cameraEntity.setEulerAngles(-25, 0, 0);
    this.app.root.addChild(this.cameraEntity);

    // 2. Sunlight: each site has its own low polar Sun
    const look = this.look;
    this.lightEntity = new pc.Entity("SunLight");
    this.lightEntity.addComponent("light", {
      type: "directional",
      color: new pc.Color(look.sunColor[0], look.sunColor[1], look.sunColor[2]),
      intensity: look.sunIntensity,
      castShadows: true,
      shadowDistance: 160,
      shadowType: pc.SHADOW_PCF5_32F,
      shadowBias: 0.2,
      normalOffsetBias: 0.05,
      shadowResolution: 2048,
    });
    this.lightEntity.setEulerAngles(look.sunPitch, look.sunYaw, 0);
    this.app.root.addChild(this.lightEntity);

    // Ambient light
    this.app.scene.ambientLight = new pc.Color(look.ambient[0], look.ambient[1], look.ambient[2]);
    this.cameraEntity.camera!.toneMapping = pc.TONEMAP_ACES;
    this.cameraEntity.camera!.gammaCorrection = pc.GAMMA_SRGB;
    this.app.scene.fog.type = pc.FOG_LINEAR;
    this.app.scene.fog.color = new pc.Color(0.02, 0.025, 0.04);
    this.app.scene.fog.start = 900;
    this.app.scene.fog.end = 3600;
    // soft fill light from opposite side
    const fill = new pc.Entity("FillLight");
    fill.addComponent("light", {
      type: "directional",
      color: new pc.Color(0.55, 0.62, 0.8),
      intensity: look.fill,
      castShadows: false,
    });
    fill.setEulerAngles(40, look.sunYaw + 180, 0);
    this.app.root.addChild(fill);
    this.fillLight = fill;

    // 3. Terrain, rocks, and sky
    this.initTerrain();

    // 4. Base structures (Lander, Modules, Solar field)
    this.initBase();

    // 5. Rover
    this.initRover();

    // 6. Player Astronaut
    this.initPlayer();

    // 7. Ice Deposits, sandbox outposts, and story props
    this.initIceSites();
    if (this.siteKey === "nobile") this.initOutposts();
    if (this.storyDef) {
      this.story = new StoryScene(
        this.storyDef,
        {
          app: this.app,
          kit: this.kit,
          height: this.terrainHeightMap,
          obstacles: this.obstacles,
          accent: this.accent(),
          sunYaw: this.look.sunYaw,
          puff: (x, y, z, n, p) => this.puff(x, y, z, n, p),
        },
        this.roverEntity,
      );
    }
    this.sky?.update(this.cameraEntity.getPosition(), 0);
  }

  private accent() {
    const hex = this.storyDef?.accent ?? SIRIUS_ACCENT;
    const n = parseInt(hex.slice(1), 16);
    return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  private makeCanvasTexture(
    size: number,
    draw: (ctx: CanvasRenderingContext2D, size: number) => void,
    repeat = true,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    draw(ctx, size);
    const tex = new pc.Texture(this.app.graphicsDevice, {
      width: size,
      height: size,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      anisotropy: 8,
    });
    tex.setSource(canvas);
    return tex;
  }

  private plateTexture() {
    return this.makeCanvasTexture(256, (ctx, n) => {
      ctx.fillStyle = "#8d8f94";
      ctx.fillRect(0, 0, n, n);
      ctx.strokeStyle = "rgba(40,40,45,0.6)";
      ctx.lineWidth = 2;
      for (let y = 0; y < n; y += 16)
        for (let x = (y / 16) % 2 ? 8 : 0; x < n; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, y + 4);
          ctx.lineTo(x + 6, y + 10);
          ctx.stroke();
        }
      ctx.strokeStyle = "rgba(30,30,35,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, n - 2, n - 2);
    });
  }

  private initTerrain() {
    const low = this.quality === "low";
    buildTerrain(this.app, this.terrain, this.look, low);
    this.sky = buildSky(this.app, this.siteKey, this.lightEntity, low);
    this.scatterRocks(low);
  }

  /** Seeded Kenney boulders kept off every chapter route so objectives are never blocked. */
  private scatterRocks(low: boolean) {
    const seed = { nobile: 4402, mouton: 7304, malapert: 5503, cabeus: 9903 }[this.siteKey];
    const rand = mulberry32(seed);
    const routes: Point[][] = this.storyDef ? [chapterRoute(this.storyDef)] : [];
    const spots: Point[] = this.storyDef
      ? []
      : [...CONFIG.ICE_SITES, ...HIDDEN_ICE, ...BASES.map((b) => ({ x: b.x, z: b.z }))];
    const clear = (p: Point, margin: number) =>
      routes.every((r) => r.every((a, i) => i === 0 || distToSegment(p, r[i - 1]!, a) > margin)) &&
      spots.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > margin + 22);
    const rockMats = [0.3, 0.38, 0.46].map((g) => mkMat(g, g, g + 0.02, { metal: 0, gloss: 0.1 }));
    const kinds: [KitModel, number, number][] = [
      ["rock_largeA", 4, 9],
      ["rock_largeB", 4, 9],
      ["meteor_detailed", 2.5, 5],
      ["rocks_smallA", 2, 4],
      ["rocks_smallB", 2, 4],
    ];
    const count = low ? 40 : 75;
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 8; tries++) {
      const ang = rand() * Math.PI * 2;
      const dist = 55 + rand() * 450;
      const p = { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist };
      const [model, min, max] = kinds[Math.floor(rand() * kinds.length)]!;
      const size = min + rand() * (max - min);
      if (!clear(p, size + 12)) continue;
      placed++;
      const holder = new pc.Entity(`Boulder_${placed}`);
      holder.setPosition(p.x, this.terrainHeightMap(p.x, p.z) - size * 0.08, p.z);
      holder.setEulerAngles(0, rand() * 360, 0);
      this.app.root.addChild(holder);
      const standIn = part(
        holder,
        "sphere",
        [size, size * 0.5, size * 0.8],
        [0, size * 0.15, 0],
        rockMats[placed % 3]!,
      );
      this.kit.place(model, holder, { size, hide: [standIn] });
      if (size > 3.2) this.obstacles.push({ x: p.x, z: p.z, r: size * 0.42 });
    }
    // Small pebbles for ground detail (purely visual)
    const pebbleCount = low ? 80 : 180;
    for (let i = 0; i < pebbleCount; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = 40 + rand() * 300;
      const x = Math.cos(ang) * dist,
        z = Math.sin(ang) * dist;
      const s = 0.25 + rand() * 0.7;
      part(
        this.app.root,
        rand() < 0.5 ? "sphere" : "box",
        [s * 1.4, s * 0.55, s],
        [x, this.terrainHeightMap(x, z) + s * 0.12, z],
        rockMats[i % 3]!,
        [rand() * 25, rand() * 360, rand() * 25],
        "Pebble",
        false,
      );
    }
  }

  private initBase() {
    const baseGroup = new pc.Entity("LunarBase");

    // 1. Apollo/Artemis Lunar Lander
    this.landerEntity = new pc.Entity("Lander");
    const mk = (r: number, g: number, b: number, gloss = 0.45, metal = 0.1) => {
      const m = new pc.StandardMaterial();
      m.useMetalness = true;
      m.diffuse = new pc.Color(r, g, b);
      m.gloss = gloss;
      m.metalness = metal;
      m.update();
      return m;
    };
    const part = (
      name: string,
      type: PrimitiveShape,
      scale: Vec3Tuple,
      pos: Vec3Tuple,
      mat: pc.StandardMaterial,
    ) => {
      const e = new pc.Entity(name);
      e.addComponent("render", { type });
      e.setLocalScale(scale[0], scale[1], scale[2]);
      e.setPosition(pos[0], pos[1], pos[2]);
      e.render!.material = mat;
      this.landerEntity.addChild(e);
      return e;
    };
    const plateMat = new pc.StandardMaterial();
    plateMat.diffuseMap = this.plateTexture();
    plateMat.diffuseMapTiling = new pc.Vec2(4, 4);
    plateMat.useMetalness = true;
    plateMat.metalness = 0.6;
    plateMat.gloss = 0.5;
    plateMat.update();
    part("Pad", "box", [18, 0.4, 18], [0, 0.2, 0], plateMat);
    const cream = mk(0.86, 0.8, 0.7),
      tan = mk(0.62, 0.52, 0.44, 0.35),
      steel = mk(0.75, 0.75, 0.78, 0.7, 0.8);
    part("Base", "cylinder", [10.5, 0.8, 10.5], [0, 0.8, 0], tan);
    part("Body", "cylinder", [10, 5, 10], [0, 3.6, 0], cream);
    part("Band", "cylinder", [10.2, 0.25, 10.2], [0, 6.1, 0], tan);
    part("Dome", "sphere", [10, 9, 10], [0, 6.1, 0], tan);
    part("Mast", "cylinder", [0.25, 4, 0.25], [0, 12, 0], steel);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = part(
        `Leg_${i}`,
        "box",
        [0.5, 3.5, 0.5],
        [Math.cos(a) * 5.6, 1.4, Math.sin(a) * 5.6],
        steel,
      );
      leg.setEulerAngles(Math.sin(a) * 25, 0, -Math.cos(a) * 25);
      part(
        `Foot_${i}`,
        "cylinder",
        [1.4, 0.2, 1.4],
        [Math.cos(a) * 6.4, 0.5, Math.sin(a) * 6.4],
        steel,
      );
    }
    part("Hatch", "box", [2.6, 3.4, 0.3], [0, 3.2, 5.05], mk(0.35, 0.36, 0.4, 0.6, 0.5));
    const lampMat = new pc.StandardMaterial();
    lampMat.emissive = new pc.Color(1, 1, 0.95);
    lampMat.emissiveIntensity = 3;
    lampMat.update();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(
        `Lamp_${i}`,
        "cylinder",
        [1.1, 0.05, 0.6],
        [Math.cos(a) * 8, 0.43, Math.sin(a) * 8],
        lampMat,
      );
    }

    this.landerEntity.setPosition(0, 0, -18);
    this.obstacles.push({ x: 0, z: -18, r: 5.5 });
    baseGroup.addChild(this.landerEntity);

    // 2. Solar Panel Field
    const solarField = new pc.Entity("SolarField");
    solarField.setPosition(-25, 0, -10);
    const pMat = new pc.StandardMaterial();
    pMat.diffuseMap = solarCellTexture(this.app.graphicsDevice);
    pMat.diffuseMapTiling = new pc.Vec2(2, 1);
    pMat.useMetalness = true;
    pMat.gloss = 0.85;
    pMat.metalness = 0.7;
    pMat.update();
    const frameMat = mkMat(0.75, 0.77, 0.8, { metal: 0.6, gloss: 0.5 });

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const panel = new pc.Entity(`SolarPanel_${r}_${c}`);
        panel.addComponent("render", { type: "box" });
        panel.setLocalScale(3.2, 0.15, 2.0);
        panel.setPosition(c * 4.5, 1.8, r * 3.5);
        panel.setEulerAngles(35, 65, 0); // Angled to polar sun
        if (panel.render) panel.render.material = pMat;
        const post = this.box(
          solarField,
          "cylinder",
          [0.14, 1.8, 0.14],
          [c * 4.5, 0.9, r * 3.5],
          frameMat,
        );
        post.enabled = false;
        this.panelPosts.push(post);

        panel.enabled = false; // enabled as player builds panels
        this.panelEntities.push(panel);
        solarField.addChild(panel);
      }
    }
    baseGroup.addChild(solarField);

    // 3. Module Pads (A: Habitat, B: Farm, C: Lab)
    const moduleDefs: {
      id: ModuleId;
      name: string;
      pos: pc.Vec3;
      color: pc.Color;
      size: pc.Vec3;
    }[] = [
      {
        id: "A",
        name: "Habitat",
        pos: new pc.Vec3(20, 0, -10),
        color: new pc.Color(0.9, 0.9, 0.95),
        size: new pc.Vec3(10, 6, 12),
      },
      {
        id: "B",
        name: "Farm",
        pos: new pc.Vec3(35, 0, 5),
        color: new pc.Color(0.4, 0.85, 0.5),
        size: new pc.Vec3(12, 6, 14),
      },
      {
        id: "C",
        name: "Lab",
        pos: new pc.Vec3(25, 0, 25),
        color: new pc.Color(0.4, 0.65, 0.95),
        size: new pc.Vec3(14, 7, 14),
      },
    ];

    for (const m of moduleDefs) {
      const modRoot = new pc.Entity(`Module_${m.id}`);
      modRoot.setPosition(m.pos);

      // Concrete Base Pad
      const pad = new pc.Entity("Pad");
      pad.addComponent("render", { type: "box" });
      pad.setLocalScale(m.size.x + 3, 0.4, m.size.z + 3);
      pad.setPosition(0, 0.2, 0);
      const padMat = new pc.StandardMaterial();
      padMat.diffuseMap = this.plateTexture();
      padMat.diffuseMapTiling = new pc.Vec2(3, 3);
      padMat.diffuse = new pc.Color(0.8, 0.8, 0.82);
      padMat.update();
      if (pad.render) pad.render.material = padMat;
      modRoot.addChild(pad);

      // Building Structure (Dome / Hab)
      const building = new pc.Entity("Building");
      building.addComponent("render", { type: "sphere" });
      building.setLocalScale(m.size.x, m.size.y, m.size.z);
      building.setPosition(0, m.size.y * 0.45, 0);

      const bMat = new pc.StandardMaterial();
      bMat.diffuse = m.color;
      bMat.useMetalness = true;
      bMat.metalness = 0.05;
      bMat.gloss = 0.45;
      bMat.update();
      if (building.render) building.render.material = bMat;
      building.enabled = false; // enabled when built

      modRoot.addChild(building);
      // Exterior control panel with status lamp
      const panelPost = this.box(
        modRoot,
        "box",
        [0.8, 1.6, 0.3],
        [m.size.x / 2 + 2, 0.8, m.size.z / 2 + 1],
        this.mkMat(0.3, 0.32, 0.36, { metal: 0.6 }),
        [0, 0, 0],
        "ControlPanel",
      );
      const lampMat = this.mkMat(0.3, 0.3, 0.3, { emissive: 2 });
      this.box(panelPost, "sphere", [0.5, 0.3, 1.2], [0, 0.6, 0.5], lampMat, [0, 0, 0], "Lamp");
      this.lampMats[m.id] = lampMat;
      this.moduleEntities[m.id] = modRoot;
      baseGroup.addChild(modRoot);
    }

    // 4. Water Tank & Rover Charging Dock
    const tankDock = new pc.Entity("WaterTank_ChargeDock");
    tankDock.setPosition(10, 0, 0);

    const tank = new pc.Entity("WaterTank");
    tank.addComponent("render", { type: "cylinder" });
    tank.setLocalScale(4, 5, 4);
    tank.setPosition(0, 2.5, 0);
    const tankMat = new pc.StandardMaterial();
    tankMat.diffuse = new pc.Color(0.2, 0.6, 0.9);
    tankMat.metalness = 0.5;
    tankMat.update();
    if (tank.render) tank.render.material = tankMat;
    tankDock.addChild(tank);

    // Charge pad: plated deck with a glowing border that shows the dock state
    const deckMat = new pc.StandardMaterial();
    deckMat.diffuseMap = this.plateTexture();
    deckMat.diffuseMapTiling = new pc.Vec2(2, 2);
    deckMat.diffuse = new pc.Color(0.62, 0.64, 0.68);
    deckMat.update();
    this.box(tankDock, "box", [7, 0.16, 7], [0, 0.08, 0], deckMat);
    const dockMat = new pc.StandardMaterial();
    dockMat.diffuse = new pc.Color(0.95, 0.78, 0.15);
    dockMat.update();
    for (const [sx, sz, x, z] of [
      [7.2, 0.28, 0, 3.5],
      [7.2, 0.28, 0, -3.5],
      [0.28, 7.2, 3.5, 0],
      [0.28, 7.2, -3.5, 0],
    ] as const)
      this.box(tankDock, "box", [sx, 0.2, sz], [x, 0.12, z], dockMat);
    this.dockMat = dockMat;
    // Rover recovery console
    const con = new pc.Entity("RecoveryConsole");
    con.setPosition(RECOVERY_CONSOLE.x, 0, RECOVERY_CONSOLE.z);
    this.box(
      con,
      "box",
      [1.2, 1.4, 0.6],
      [0, 0.7, 0],
      this.mkMat(0.25, 0.28, 0.35, { metal: 0.6 }),
    );
    this.box(con, "box", [1, 0.5, 0.1], [0, 1.2, 0.32], this.mkMat(0.3, 0.8, 1, { emissive: 1.5 }));
    baseGroup.addChild(con);
    // Habitat airlock door
    const door = new pc.Entity("AirlockDoor");
    door.setPosition(HAB_DOOR.x, 0, HAB_DOOR.z);
    this.box(
      door,
      "box",
      [3.4, 3.4, 1.6],
      [0, 1.7, -0.4],
      this.mkMat(0.85, 0.85, 0.88, { metal: 0.4 }),
    );
    this.doorPanel = this.box(
      door,
      "box",
      [2.2, 2.6, 0.2],
      [0, 1.4, 0.45],
      this.mkMat(0.95, 0.7, 0.15, { metal: 0.5 }),
    );
    door.enabled = false;
    this.doorRoot = door;
    baseGroup.addChild(door);

    // 5. Camp Sirius Lander Orientation Console
    const orient = new pc.Entity("OrientConsole");
    orient.setPosition(ORIENT_CONSOLE.x, 0, ORIENT_CONSOLE.z);
    this.box(
      orient,
      "cylinder",
      [0.6, 1.2, 0.6],
      [0, 0.6, 0],
      this.mkMat(0.32, 0.35, 0.42, { metal: 0.6 }),
    );
    this.orientLampMat = this.mkMat(0.45, 0.9, 0.72, { emissive: 2 });
    this.box(orient, "box", [1.1, 0.65, 0.12], [0, 1.35, 0], this.orientLampMat, [-30, 0, 0]);
    baseGroup.addChild(orient);

    // 6. Solar Sun-Tracker Console
    const tracker = new pc.Entity("SolarTrackerConsole");
    tracker.setPosition(SOLAR_TRACKER.x, 0, SOLAR_TRACKER.z);
    this.box(
      tracker,
      "box",
      [1.0, 1.3, 0.6],
      [0, 0.65, 0],
      this.mkMat(0.28, 0.31, 0.38, { metal: 0.6 }),
    );
    this.trackerLampMat = this.mkMat(1.0, 0.75, 0.2, { emissive: 2 });
    this.box(tracker, "sphere", [0.45, 0.45, 0.45], [0, 1.55, 0], this.trackerLampMat);
    baseGroup.addChild(tracker);

    // 7. Active Objective Guidance Beacon Ring (camp accent colour)
    const ac = this.accent();
    const beacon = new pc.Entity("ObjectiveBeacon");
    const beaconMat = this.mkMat(ac.r, ac.g, ac.b, { emissive: 2.2, opacity: 0.5 });
    this.box(beacon, "cylinder", [4.2, 0.12, 4.2], [0, 0.15, 0], beaconMat);
    const beamMat = this.mkMat(ac.r, ac.g, ac.b, { emissive: 1.4, opacity: 0.4, additive: true });
    // Faint up close so the objective itself stays readable; the bright beam starts above
    // any structure so far-off objectives (summits, crater floors) stay visible
    this.box(beacon, "cylinder", [0.35, 12, 0.35], [0, 6, 0], beamMat);
    const skyBeam = this.mkMat(ac.r, ac.g, ac.b, { emissive: 1.6, opacity: 0.45, additive: true });
    this.box(beacon, "cylinder", [0.9, 60, 0.9], [0, 42, 0], skyBeam);
    this.beaconMats = [beaconMat, beamMat, skyBeam];
    beacon.enabled = false;
    this.objectiveBeacon = beacon;
    this.app.root.addChild(beacon);

    // Camp flag in the camp's accent colour beside the crew hopper
    const flag = new pc.Entity("CampFlag");
    flag.setPosition(-7, 0, -12);
    this.box(
      flag,
      "cylinder",
      [0.08, 4, 0.08],
      [0, 2, 0],
      this.mkMat(0.8, 0.8, 0.82, { metal: 0.6 }),
    );
    this.box(flag, "box", [1.6, 0.9, 0.03], [0.82, 3.5, 0], this.mkMat(ac.r, ac.g, ac.b, {}));
    this.box(
      flag,
      "box",
      [1.6, 0.03, 0.03],
      [0.82, 3.96, 0],
      this.mkMat(0.8, 0.8, 0.82, { metal: 0.6 }),
    );
    baseGroup.addChild(flag);

    // Story camps run on prebuilt Habitat A + panels; Camp Sirius-only consoles stay home
    if (this.storyDef) {
      orient.enabled = false;
      tracker.enabled = false;
      for (const id of ["B", "C"] as ModuleId[]) {
        const m = this.moduleEntities[id];
        if (m) m.enabled = false;
      }
    }

    baseGroup.addChild(tankDock);
    this.app.root.addChild(baseGroup);
  }

  private mkMat(
    r: number,
    g: number,
    b: number,
    o: {
      metal?: number;
      gloss?: number;
      emissive?: number;
      opacity?: number;
      additive?: boolean;
    } = {},
  ) {
    return mkMat(r, g, b, o);
  }

  private box(
    parent: pc.Entity,
    type: PrimitiveShape,
    scale: Vec3Tuple,
    pos: Vec3Tuple,
    mat: pc.StandardMaterial,
    rot: Vec3Tuple = [0, 0, 0],
    name = "Part",
  ) {
    return part(parent, type, scale, pos, mat, rot, name);
  }

  private panelPosts: pc.Entity[] = [];
  private roverWheels: pc.Entity[] = [];
  private lampMats: Partial<Record<ModuleId, pc.StandardMaterial>> = {};
  private dockMat: pc.StandardMaterial | null = null;
  private orientLampMat: pc.StandardMaterial | null = null;
  private trackerLampMat: pc.StandardMaterial | null = null;
  private objectiveBeacon: pc.Entity | null = null;
  private doorRoot: pc.Entity | null = null;
  private doorPanel: pc.Entity | null = null;
  private action: {
    key: "e" | "r";
    hold: number;
    objectText: string;
    actionText: string;
    run: () => void;
  } | null = null;
  private holdProgress = 0;
  private holdLatch = false;
  private roverTeleportSeen = 0;
  private playerTeleportSeen = 0;
  private doorTimer = 0;
  private boostWarned = false;
  private limbs: { lArm: pc.Entity; rArm: pc.Entity; lLeg: pc.Entity; rLeg: pc.Entity } | null =
    null;
  private walkPhase = 0;
  private wheelSpin = 0;
  private shake = 0;

  /** Lunar Terrain Vehicle in the style of the clip: open white chassis, six mesh wheels, solar deck, antenna. */
  private initRover() {
    this.roverEntity = new pc.Entity("LunarRover");
    this.roverEntity.setPosition(10, 0.8, 0);
    const white = this.mkMat(0.9, 0.9, 0.92, { metal: 0.2, gloss: 0.55 });
    const grey = this.mkMat(0.35, 0.36, 0.4, { metal: 0.7, gloss: 0.5 });
    const dark = this.mkMat(0.08, 0.08, 0.1, { metal: 0.3, gloss: 0.3 });
    const gold = this.mkMat(0.85, 0.62, 0.18, { metal: 0.9, gloss: 0.7 });
    const panel = this.mkMat(0.08, 0.14, 0.35, { metal: 0.8, gloss: 0.85 });
    const orange = this.mkMat(1, 0.45, 0.1, { emissive: 1.5 });
    const lamp = this.mkMat(1, 1, 0.95, { emissive: 3 });
    const R = this.roverEntity;
    // forward is +Z
    this.box(R, "box", [2.6, 0.35, 4.6], [0, 0.55, 0], white); // main deck
    this.box(R, "box", [2.2, 0.25, 4.2], [0, 0.3, 0], grey); // belly pan
    this.box(R, "box", [2.8, 0.12, 0.5], [0, 0.6, 2.4], grey); // front bumper
    this.box(R, "box", [2.0, 0.5, 0.8], [0, 0.95, 1.9], white); // nose console
    this.box(R, "box", [0.5, 0.08, 0.15], [-0.75, 1.0, 2.31], lamp); // headlights
    this.box(R, "box", [0.5, 0.08, 0.15], [0.75, 1.0, 2.31], lamp);
    // seats
    for (const x of [-0.6, 0.6]) {
      this.box(R, "box", [0.8, 0.15, 0.8], [x, 0.85, 0.6], dark);
      this.box(R, "box", [0.8, 0.9, 0.15], [x, 1.25, 0.2], dark);
    }
    // control stick + display
    this.box(R, "box", [0.6, 0.35, 0.08], [0, 1.35, 1.55], dark, [-30, 0, 0]);
    this.box(
      R,
      "box",
      [0.5, 0.25, 0.02],
      [0, 1.36, 1.5],
      this.mkMat(0.2, 0.8, 1, { emissive: 1.2 }),
      [-30, 0, 0],
    );
    // roll cage
    for (const x of [-1.15, 1.15]) {
      this.box(R, "cylinder", [0.08, 1.4, 0.08], [x, 1.4, 1.2], grey);
      this.box(R, "cylinder", [0.08, 1.4, 0.08], [x, 1.4, -0.4], grey);
      this.box(R, "cylinder", [0.08, 1.6, 0.08], [x, 2.1, 0.4], grey, [90, 0, 0]);
    }
    this.box(R, "cylinder", [0.08, 2.3, 0.08], [0, 2.1, 1.2], grey, [0, 0, 90]);
    this.box(R, "cylinder", [0.08, 2.3, 0.08], [0, 2.1, -0.4], grey, [0, 0, 90]);
    // rear cargo bay with gold foil and solar deck
    this.box(R, "box", [2.3, 0.6, 1.5], [0, 0.95, -1.5], gold);
    this.box(R, "box", [2.5, 0.06, 1.7], [0, 1.3, -1.5], panel, [8, 0, 0]);
    // high-gain antenna
    this.box(R, "cylinder", [0.06, 1.4, 0.06], [-0.9, 2.0, -1.9], grey);
    const dish = this.box(R, "cone", [0.8, 0.25, 0.8], [-0.9, 2.8, -1.9], white, [200, 0, 0]);
    void dish;
    this.box(R, "box", [0.12, 0.12, 0.12], [1.15, 1.25, -2.2], orange); // beacon
    // fenders + 6 wheels
    this.roverWheels = [];
    for (const z of [1.55, 0, -1.55])
      for (const x of [-1.55, 1.55]) {
        this.box(R, "box", [0.65, 0.08, 1.25], [x, 1.0, z], white);
        const hub = new pc.Entity("WheelHub");
        hub.setLocalPosition(x, 0.45, z);
        R.addChild(hub);
        this.box(hub, "cylinder", [0.95, 0.45, 0.95], [0, 0, 0], dark, [0, 0, 90]); // tyre
        this.box(hub, "cylinder", [0.6, 0.47, 0.6], [0, 0, 0], grey, [0, 0, 90]); // rim
        for (let i = 0; i < 4; i++)
          this.box(hub, "box", [0.48, 0.06, 0.98], [0, 0, 0], grey, [i * 45, 0, 0]); // treads
        this.roverWheels.push(hub);
      }
    // Ice canister on the cargo deck while the rover carries harvested ice
    const ice = new pc.Entity("RoverIceCargo");
    R.addChild(ice);
    this.box(
      ice,
      "cylinder",
      [0.75, 0.9, 0.75],
      [-0.5, 1.75, -1.5],
      this.mkMat(0.6, 0.85, 1, { emissive: 0.8, opacity: 0.8 }),
      [0, 0, 90],
    );
    this.box(
      ice,
      "cylinder",
      [0.75, 0.9, 0.75],
      [0.5, 1.75, -1.5],
      this.mkMat(0.6, 0.85, 1, { emissive: 0.8, opacity: 0.8 }),
      [0, 0, 90],
    );
    ice.enabled = false;
    this.roverIceCargo = ice;
    this.app.root.addChild(this.roverEntity);
  }

  /** Spacesuited astronaut: white suit, gold visor helmet, life-support pack, articulated limbs. Faces +Z. */
  private initPlayer() {
    this.playerEntity = new pc.Entity("PlayerAstronaut");
    this.playerEntity.setPosition(0, 1.0, 6);
    const P = this.playerEntity;
    const suit = this.mkMat(0.95, 0.95, 0.97, { metal: 0.03, gloss: 0.55 });
    const joint = this.mkMat(0.38, 0.40, 0.45, { metal: 0.2, gloss: 0.45 });
    const visor = this.mkMat(1.0, 0.76, 0.22, { metal: 0.98, gloss: 0.98 });
    const pack = this.mkMat(0.86, 0.88, 0.91, { metal: 0.15, gloss: 0.5 });
    const dark = this.mkMat(0.12, 0.13, 0.15, { metal: 0.15, gloss: 0.4 });
    const goldFoil = this.mkMat(0.92, 0.75, 0.2, { metal: 0.85, gloss: 0.75 });
    const flag = this.mkMat(0.12, 0.32, 0.82, {});
    const red = this.mkMat(0.95, 0.15, 0.15, { emissive: 1.8 });
    const light = this.mkMat(0.4, 0.95, 1.0, { emissive: 2.5 });

    // Contoured capsule torso (rounded, non-blocky spacesuit body)
    this.box(P, "capsule", [0.58, 0.54, 0.44], [0, 1.24, 0], suit);
    // Ergonomic rounded shoulder bells
    this.box(P, "sphere", [0.26, 0.22, 0.26], [-0.34, 1.44, 0], suit);
    this.box(P, "sphere", [0.26, 0.22, 0.26], [0.34, 1.44, 0], suit);
    // Neck collar seal ring
    this.box(P, "cylinder", [0.44, 0.08, 0.44], [0, 1.54, 0], joint);
    // Abdomen & waist mobility joints
    this.box(P, "cylinder", [0.48, 0.20, 0.38], [0, 0.94, 0], joint);
    this.box(P, "cylinder", [0.50, 0.08, 0.40], [0, 0.80, 0], joint);

    // Chest control unit (RCU) with telemetry screen and indicators
    this.box(P, "box", [0.34, 0.20, 0.08], [0, 1.22, 0.24], pack);
    this.box(P, "box", [0.22, 0.08, 0.02], [0, 1.24, 0.285], light);
    this.box(P, "cylinder", [0.03, 0.02, 0.03], [-0.08, 1.15, 0.285], red, [90, 0, 0]);
    this.box(P, "cylinder", [0.03, 0.02, 0.03], [0.08, 1.15, 0.285], light, [90, 0, 0]);
    this.box(P, "box", [0.12, 0.08, 0.01], [0.22, 1.36, 0.225], flag); // mission patch

    // Helmet & Visor
    this.box(P, "sphere", [0.54, 0.52, 0.52], [0, 1.74, 0], suit); // outer helmet dome
    this.box(P, "sphere", [0.44, 0.36, 0.34], [0, 1.74, 0.15], visor); // gleaming gold reflective bubble visor
    this.box(P, "box", [0.40, 0.05, 0.14], [0, 1.89, 0.16], suit, [-15, 0, 0]); // sun visor brow cap
    // Dual EVA Helmet Spotlights
    this.box(P, "cylinder", [0.07, 0.10, 0.07], [-0.24, 1.85, 0.12], pack, [-70, 0, 0]);
    this.box(P, "sphere", [0.06, 0.04, 0.06], [-0.24, 1.85, 0.17], light);
    this.box(P, "cylinder", [0.07, 0.10, 0.07], [0.24, 1.85, 0.12], pack, [-70, 0, 0]);
    this.box(P, "sphere", [0.06, 0.04, 0.06], [0.24, 1.85, 0.17], light);

    // PLSS Life-Support Backpack
    this.box(P, "box", [0.56, 0.74, 0.30], [0, 1.22, -0.34], pack);
    this.box(P, "cylinder", [0.52, 0.10, 0.26], [0, 1.62, -0.34], joint);
    this.box(P, "cylinder", [0.11, 0.44, 0.11], [-0.22, 1.22, -0.42], goldFoil); // secondary O2 tanks
    this.box(P, "cylinder", [0.11, 0.44, 0.11], [0.22, 1.22, -0.42], goldFoil);
    this.box(P, "cylinder", [0.025, 0.45, 0.025], [0.22, 1.85, -0.38], dark); // antenna

    // Articulated smooth rounded limbs
    const limb = (x: number, y: number, len: number, w: number) => {
      const pivot = new pc.Entity("Limb");
      pivot.setLocalPosition(x, y, 0);
      P.addChild(pivot);
      this.box(pivot, "cylinder", [w, len * 0.48, w], [0, -len * 0.24, 0], suit);
      this.box(pivot, "cylinder", [w * 1.14, 0.08, w * 1.14], [0, -len * 0.5, 0], joint);
      this.box(pivot, "cylinder", [w * 0.94, len * 0.44, w * 0.94], [0, -len * 0.74, 0], suit);
      return pivot;
    };
    const lArm = limb(-0.42, 1.42, 0.7, 0.18);
    const rArm = limb(0.42, 1.42, 0.7, 0.18);
    this.box(lArm, "cylinder", [0.19, 0.05, 0.19], [0, -0.72, 0], joint);
    this.box(rArm, "cylinder", [0.19, 0.05, 0.19], [0, -0.72, 0], joint);
    this.box(lArm, "capsule", [0.17, 0.20, 0.17], [0, -0.76, 0.02], dark); // gloves
    this.box(rArm, "capsule", [0.17, 0.20, 0.17], [0, -0.76, 0.02], dark);

    const lLeg = limb(-0.17, 0.82, 0.72, 0.22);
    const rLeg = limb(0.17, 0.82, 0.72, 0.22);
    for (const leg of [lLeg, rLeg]) {
      this.box(leg, "cylinder", [0.24, 0.06, 0.24], [0, -0.66, 0.02], joint);
      this.box(leg, "box", [0.26, 0.08, 0.38], [0, -0.74, 0.06], dark); // boot sole
      this.box(leg, "sphere", [0.25, 0.15, 0.24], [0, -0.70, 0.18], dark); // toe cap
      this.box(leg, "cylinder", [0.24, 0.16, 0.24], [0, -0.70, -0.06], dark); // heel
    }
    this.limbs = { lArm, rArm, lLeg, rLeg };
    const helmet = new pc.Entity("HelmetLamp");
    helmet.addComponent("light", {
      type: "spot",
      color: new pc.Color(0.95, 0.97, 1),
      intensity: 4,
      range: 30,
      innerConeAngle: 18,
      outerConeAngle: 44,
      castShadows: false,
      affectLightmapped: true,
    });
    helmet.setLocalPosition(0, 1.9, 0.3);
    helmet.setLocalEulerAngles(-72, 0, 0);
    helmet.enabled = false;
    P.addChild(helmet);
    this.helmetLight = helmet;

    this.app.root.addChild(this.playerEntity);
  }

  private outpostParts: Partial<
    Record<BaseId, { stages: pc.Entity[]; lamp: pc.StandardMaterial }>
  > = {};
  private initOutposts() {
    const root = new pc.Entity("Outposts");
    const colors: Record<BaseId, Vec3Tuple> = {
      COMM: [0.4, 0.7, 1],
      POWER: [1, 0.85, 0.2],
      FOOD: [0.4, 0.9, 0.5],
      EXPLORE: [0.9, 0.5, 1],
    };
    for (const b of BASES) {
      const e = new pc.Entity(`Outpost_${b.id}`);
      e.setPosition(b.x, this.terrainHeightMap(b.x, b.z), b.z);
      const c = colors[b.id];
      this.box(
        e,
        "cylinder",
        [14, 0.3, 14],
        [0, 0.15, 0],
        this.mkMat(0.35, 0.36, 0.4, { metal: 0.5 }),
      );
      // beacon post with status lamp
      this.box(e, "box", [0.5, 4, 0.5], [0, 2, 8], this.mkMat(0.3, 0.3, 0.35, { metal: 0.7 }));
      const lamp = this.mkMat(c[0], c[1], c[2], { emissive: 2 });
      this.box(e, "sphere", [1, 1, 1], [0, 4.4, 8], lamp);
      const metal = this.mkMat(0.85, 0.86, 0.9, { metal: 0.5 }),
        accent = this.mkMat(c[0], c[1], c[2], { metal: 0.3 });
      const tint = new pc.Color(c[0], c[1], c[2]);
      const stages: pc.Entity[] = [];
      const mk = (build: (g: pc.Entity) => void) => {
        const g = new pc.Entity("Stage");
        build(g);
        g.enabled = false;
        e.addChild(g);
        stages.push(g);
      };
      // Kenney model on the pad, with the primitive stand-in hidden once it loads
      const kit = (
        g: pc.Entity,
        name: KitModel,
        scale: number,
        pos: Vec3Tuple,
        standIn: pc.Entity[],
        yaw = 0,
      ) => this.kit.place(name, g, { scale, pos, yaw, accent: tint, hide: standIn });
      const airlock = (g: pc.Entity) =>
        kit(
          g,
          "structure_closed",
          3,
          [-4.6, 0.3, -2.6],
          [this.box(g, "box", [3, 3, 3], [-4.6, 1.8, -2.6], metal)],
        );
      if (b.id === "COMM") {
        // The Kenney dish opens toward local -Z, so turn it half a revolution past the Earth bearing
        const toEarth = (EARTH_DIRECTION.nobile.yaw * 180) / Math.PI + 180;
        mk((g) => {
          const mast = this.box(g, "cylinder", [0.6, 5, 0.6], [2, 2.8, 2], metal);
          const dish = this.box(g, "cylinder", [4, 0.4, 4], [2, 5, 2], metal, [35, 0, 0]);
          kit(g, "satelliteDish_large", 4.8, [2, 0.3, 2], [mast, dish], toEarth);
        });
        mk((g) => {
          const box = this.box(g, "box", [2.4, 1.8, 2], [4.2, 1.2, -3.6], metal);
          kit(g, "machine_wireless", 3, [4.2, 0.3, -3.6], [box], 200);
        });
        mk((g) => {
          const hut = this.box(g, "box", [5, 2.8, 5], [-3.5, 1.7, -3], metal);
          kit(g, "hangar_smallA", 2.8, [-3.5, 0.3, -3], [hut], 90);
          kit(g, "satelliteDish", 2, [0.8, 0.3, -5.2], [], 180);
        });
      } else if (b.id === "POWER") {
        mk(airlock);
        // Solar tower: near-vertical wings catch a Sun that skims the polar horizon
        mk((g) => {
          const cells = new pc.StandardMaterial();
          cells.diffuseMap = solarCellTexture(this.app.graphicsDevice);
          cells.diffuseMapTiling = new pc.Vec2(2, 2);
          cells.useMetalness = true;
          cells.metalness = 0.6;
          cells.gloss = 0.8;
          cells.update();
          this.box(g, "cylinder", [0.9, 13, 0.9], [3, 6.5, -2], metal);
          this.box(g, "box", [8.6, 0.3, 0.3], [3, 11, -2], metal);
          for (const s of [-1, 1])
            this.box(g, "box", [3.8, 4.6, 0.12], [3 + s * 2.3, 11, -2], cells, [-18, 0, 0]);
          this.box(g, "cylinder", [1.4, 0.4, 1.4], [3, 13.1, -2], accent);
        });
        // Energy-pack hopper: charged packs fly between camps instead of a long power cable
        mk((g) => {
          const pad = this.box(g, "box", [5, 0.3, 5], [4, 0.45, 4], metal);
          kit(g, "platform_large", 2.5, [4, 0.3, 4], [pad]);
          const body = this.box(g, "cylinder", [1.6, 4.6, 1.6], [4, 3, 4], metal);
          const nose = this.box(g, "cone", [1.6, 1.4, 1.6], [4, 6, 4], accent);
          const k = 1.5;
          let loaded = 0;
          for (const [name, y] of [
            ["rocket_baseA", 0],
            ["rocket_sidesA", 1.6],
            ["rocket_fuelA", 2.6],
            ["rocket_topA", 3.1],
          ] as [KitModel, number][])
            this.kit.place(name, g, {
              scale: k,
              pos: [4, 0.5 + y * k, 4],
              accent: tint,
              onLoad: () => {
                if (++loaded === 4) body.enabled = nose.enabled = false;
              },
            });
          for (const [x, z] of [
            [-1.6, -1.6],
            [1.6, -1.6],
            [-1.6, 1.6],
            [1.6, 1.6],
          ] as [number, number][])
            this.box(g, "box", [0.7, 0.5, 0.7], [4 + x, 0.75, 4 + z], accent);
        });
      } else if (b.id === "FOOD") {
        mk(airlock);
        mk((g) => {
          const tank = this.box(g, "cylinder", [2.6, 2.6, 2.6], [3.2, 1.6, -4], accent);
          kit(g, "machine_barrelLarge", 3, [3.2, 0.3, -4], [tank]);
        });
        mk((g) => {
          const dome = this.box(
            g,
            "sphere",
            [7, 4, 7],
            [1.8, 0.5, 2.4],
            this.mkMat(0.5, 0.9, 0.6, { opacity: 0.55, emissive: 0.3 }),
          );
          kit(g, "hangar_roundGlass", 2.6, [1.8, 0.3, 2.4], [dome]);
        });
      } else {
        mk((g) => {
          const hut = this.box(g, "box", [4.4, 2.4, 4.4], [-3.6, 1.5, -1.2], metal);
          kit(g, "hangar_smallB", 2.6, [-3.6, 0.3, -1.2], [hut], 90);
        });
        mk((g) => {
          const box = this.box(g, "box", [2.6, 1.6, 2.2], [3.6, 1.1, -4], accent);
          kit(g, "machine_wireless", 3, [3.6, 0.3, -4], [box], 160);
          kit(g, "satelliteDish_detailed", 2.3, [5.4, 0.3, -1.4], [], 200);
        });
        mk((g) => {
          const bay = this.box(g, "box", [4.8, 2.8, 7], [1.8, 1.7, 3], metal);
          kit(g, "hangar_largeA", 2.4, [1.8, 0.3, 3], [bay]);
        });
      }
      this.outpostParts[b.id] = { stages, lamp };
      this.obstacles.push({ id: `out_${b.id}`, x: b.x, z: b.z, r: 6 });
      root.addChild(e);
    }
    this.app.root.addChild(root);
  }

  private spawnIceEntity(site: IceSiteDef) {
    if (!this.iceRoot || this.iceEntities.some((e) => e.id === site.id)) return;
    const siteEntity = new pc.Entity(`Ice_${site.id}`);
    const y = this.terrainHeightMap(site.x, site.z);
    siteEntity.setPosition(site.x, y, site.z);

    // Frosty ground patch draped over the crater floor, fading out at the edge
    const pMat = new pc.StandardMaterial();
    pMat.diffuse = new pc.Color(0.62, 0.7, 0.8);
    pMat.useMetalness = true;
    pMat.metalness = 0;
    pMat.gloss = 0.55;
    pMat.opacity = 0.55;
    pMat.blendType = pc.BLEND_NORMAL;
    pMat.opacityVertexColor = true;
    pMat.opacityVertexColorChannel = "a";
    pMat.depthWrite = false;
    pMat.update();
    const patchMesh = groundPatchMesh(
      this.app.graphicsDevice,
      this.terrainHeightMap,
      site.x,
      site.z,
      8,
    );
    const patch = new pc.Entity("Patch");
    patch.addComponent("render", {
      meshInstances: [new pc.MeshInstance(patchMesh, pMat)],
      castShadows: false,
      receiveShadows: true,
    });
    if (this.terrain.shadow(site.x, site.z) > 0.5)
      patch.render!.meshInstances[0]!.mask = SUNLESS_MASK;
    siteEntity.addChild(patch);

    // Glowing cyan ice crystals (Kenney crystal cluster, cone stand-in until it loads)
    const crystal = new pc.Entity("Crystal");
    siteEntity.addChild(crystal);
    const cMat = new pc.StandardMaterial();
    cMat.diffuse = new pc.Color(0.3, 0.75, 1.0);
    cMat.emissive = new pc.Color(0.15, 0.5, 0.85);
    cMat.opacity = 0.85;
    cMat.blendType = pc.BLEND_NORMAL;
    cMat.update();
    const cone = this.box(crystal, "cone", [4, 5, 4], [0, 2.5, 0], cMat);
    this.kit.place(site.id % 2 ? "rock_crystalsLargeA" : "rock_crystalsLargeB", crystal, {
      size: 6,
      yaw: site.id * 47,
      hide: [cone],
    });
    if (this.terrain.shadow(site.x, site.z) > 0.5) {
      const glow = new pc.Entity("IceGlow");
      glow.addComponent("light", {
        type: "omni",
        color: new pc.Color(0.45, 0.8, 1),
        intensity: 2.2,
        range: 20,
        castShadows: false,
        affectLightmapped: true,
      });
      glow.setLocalPosition(0, 3, 0);
      crystal.addChild(glow);
    }

    this.iceEntities.push({
      id: site.id,
      entity: siteEntity,
      crystal,
      baseScale: crystal.getLocalScale().clone(),
    });
    this.iceRoot.addChild(siteEntity);
  }

  private initIceSites() {
    const iceRoot = new pc.Entity("IceSites");
    this.iceRoot = iceRoot;
    this.app.root.addChild(iceRoot);
    if (this.siteKey !== "nobile") return;
    for (const site of CONFIG.ICE_SITES) {
      this.spawnIceEntity(site);
    }
  }

  private applyQuality(q: Quality) {
    this.quality = q;
    const light = this.lightEntity.light!;
    light.castShadows = q !== "low";
    light.shadowResolution = q === "high" ? 4096 : 2048;
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.graphicsDevice.maxPixelRatio = q === "low" ? 1 : Math.min(window.devicePixelRatio, 2);
    try {
      if (q === "low") {
        if (this.cameraFrame) {
          this.cameraFrame.destroy();
          this.cameraFrame = null;
        }
        this.cameraEntity.camera!.toneMapping = pc.TONEMAP_ACES;
        return;
      }
      if (!this.cameraFrame)
        this.cameraFrame = new pc.CameraFrame(this.app, this.cameraEntity.camera!);
      const cf = this.cameraFrame;
      cf.rendering.toneMapping = pc.TONEMAP_ACES2;
      cf.rendering.samples = q === "high" ? 4 : 1;
      cf.bloom.intensity = 0.015;
      cf.bloom.blurLevel = 6;
      cf.grading.enabled = true;
      cf.grading.saturation = 0.9;
      cf.grading.contrast = 1.12;
      cf.grading.brightness = 1.0;
      cf.vignette.intensity = 0.35;
      cf.vignette.inner = 0.5;
      cf.vignette.outer = 1.1;
      cf.taa.enabled = q === "high";
      cf.update();
    } catch (err) {
      console.warn("Post-processing unavailable", err);
    }
  }

  public setQuality(q: Quality) {
    localStorage.setItem("frontier-quality", q);
    this.applyQuality(q);
  }

  private loadModels() {
    const mods: Record<ModuleId, [KitModel, number]> = {
      A: ["hangar_roundA", 11],
      B: ["hangar_roundGlass", 13],
      C: ["hangar_largeA", 15],
    };
    for (const id of ["A", "B", "C"] as ModuleId[]) {
      const [model, size] = mods[id];
      const root = this.moduleEntities[id];
      if (!root) continue;
      const standIn = root.findByName("Building") as pc.Entity | null;
      const slot = new pc.Entity("Building");
      slot.enabled = false;
      root.addChild(slot);
      if (standIn) {
        // Keep primitive dome inside `slot` so it renders whenever the module is built,
        // and only hide it after the GLB model actually finishes loading.
        root.removeChild(standIn);
        standIn.name = "BuildingStandIn";
        standIn.enabled = true;
        slot.addChild(standIn);
        this.kit.place(model, slot, { size, hide: [standIn], pos: [0, 0.4, 0] });
      } else {
        this.kit.place(model, slot, { size, pos: [0, 0.4, 0] });
      }
      // construction scaffold shown while building
      const frame = new pc.Entity("Scaffold");
      const fm = new pc.StandardMaterial();
      fm.diffuse = new pc.Color(0.9, 0.7, 0.2);
      fm.update();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const post = new pc.Entity();
        post.addComponent("render", { type: "box" });
        post.render!.material = fm;
        post.setLocalScale(0.3, 6, 0.3);
        post.setLocalPosition(Math.cos(a) * size * 0.55, 3, Math.sin(a) * size * 0.55);
        frame.addChild(post);
      }
      frame.enabled = false;
      root.addChild(frame);
    }
    const tank = this.app.root.findByName("WaterTank") as pc.Entity | null;
    if (tank && tank.parent) {
      const tr = new pc.Entity("TankModel");
      tr.setLocalPosition(5.5, 0, -4);
      (tank.parent as pc.Entity).addChild(tr);
      this.kit.place("machine_barrelLarge", tr, { size: 3.5, hide: [tank], pos: [0, 0.2, 0] });
      this.obstacles.push({ x: 15.5, z: -4, r: 2 });
    }
    const dishRoot = new pc.Entity("Dish");
    dishRoot.setPosition(-8, 0, -30);
    this.app.root.addChild(dishRoot);
    this.kit.place("satelliteDish_large", dishRoot, { size: 6 });
    this.obstacles.push({ x: -8, z: -30, r: 2.5 });
    // Camp clutter: supply barrels and a generator beside the habitat
    const clutter: [KitModel, number, Vec3Tuple, number][] = [
      ["barrels", 2.2, [29, 0, -9], 20],
      ["machine_barrel", 1.6, [13, 0, -15], 0],
      ["machine_generatorLarge", 2.4, [29, 0, -16], 90],
      ["chimney_detailed", 2.2, [12.5, 0, -18], 0],
    ];
    for (const [model, size, pos, yaw] of clutter) {
      this.kit.place(model, this.app.root, { size, pos, yaw });
      this.obstacles.push({ x: pos[0], z: pos[2], r: size * 0.45 });
    }
    if (this.siteKey !== "nobile") return;
    // Camp Sirius hero boulders (story camps get seeded boulders kept clear of their routes)
    const spots: Vec3Tuple[] = [
      [-40, 25, 7],
      [55, -35, 9],
      [-60, -45, 11],
      [70, 40, 8],
      [5, 60, 6],
    ];
    spots.forEach(([x, z, sz], i) => {
      const r = new pc.Entity("HeroRock");
      r.setPosition(x, this.terrainHeightMap(x, z) - 0.3, z);
      r.setEulerAngles(0, i * 70, 0);
      this.app.root.addChild(r);
      this.kit.place(i % 2 ? "rock_largeA" : "rock_largeB", r, { size: sz });
      this.obstacles.push({ x, z, r: sz * 0.45 });
    });
  }

  private initDust() {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(0.7, 0.7, 0.72);
    m.opacity = 0.7;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
    m.update();
    for (let i = 0; i < 90; i++) {
      const e = new pc.Entity("Dust");
      e.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false });
      e.render!.material = m;
      e.enabled = false;
      this.app.root.addChild(e);
      this.dust.push({ e, vx: 0, vy: 0, vz: 0, life: 0 });
    }
  }

  private puff(x: number, y: number, z: number, n: number, power: number) {
    if (this.quality === "low") n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const d = this.dust[this.dustIdx++ % this.dust.length];
      if (!d) continue;
      d.e.enabled = true;
      d.e.setPosition(x, y + 0.1, z);
      const a = Math.random() * Math.PI * 2,
        s = power * (0.4 + Math.random());
      d.vx = Math.cos(a) * s;
      d.vz = Math.sin(a) * s;
      d.vy = power * (0.8 + Math.random());
      d.life = 1;
      d.e.setLocalScale(0.25, 0.25, 0.25);
    }
  }

  private updateDust(dt: number) {
    for (const d of this.dust) {
      if (!d.e.enabled) continue;
      // no air: pure ballistic arcs under lunar gravity, no drag or billowing
      d.vy -= 1.62 * dt;
      const p = d.e.getPosition();
      const nx = p.x + d.vx * dt,
        ny = p.y + d.vy * dt,
        nz = p.z + d.vz * dt;
      if (ny < this.terrainHeightMap(nx, nz)) {
        d.e.enabled = false;
        continue;
      }
      d.e.setPosition(nx, ny, nz);
      d.life -= dt * 0.25;
      if (d.life <= 0) d.e.enabled = false;
    }
  }

  private setupInputs() {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      this.keys[e.key.toLowerCase()] = true;
      this.keys[codeKey(e.code)] = true;
      if (
        ["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(
          codeKey(e.code),
        ) &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
      }

      // Esc toggles the pause / exit menu during an active mission
      if (e.key === "Escape" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        if (gameSim.state.phase === "playing") {
          e.preventDefault();
          gameSim.togglePauseMenu();
          this.keys = {};
          this.holdLatch = false;
        }
        return;
      }

      if (gameSim.state.phase !== "playing" || gameSim.state.menuOpen) return;

      // Handle Key E / R action trigger
      const k = e.key.toLowerCase();
      if ((k === "e" || k === "r") && !e.repeat) {
        const a = this.action;
        if (a && a.key === k && a.hold === 0) a.run();
      }

      // Space: step away from the dish, exit rover (stays parked), or jump on foot
      if (e.key === " ") {
        e.preventDefault();
        if (gameSim.state.story.aiming) gameSim.stopAiming();
        else if (gameSim.state.player.inRover) gameSim.exitRover();
        else this.jumpQueued = true;
      }
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      this.keys[e.key.toLowerCase()] = false;
      this.keys[codeKey(e.code)] = false;
      if (e.key === "Shift") this.keys["shift"] = false;
      if (["e", "r"].includes(e.key.toLowerCase())) this.holdLatch = false;
    };

    // never leave a key "stuck" when the window loses focus
    this.onBlur = () => {
      this.keys = {};
      this.holdLatch = false;
      this.isMouseDown = false;
    };

    this.onMouseDown = (e: MouseEvent) => {
      if (this.isDestroyed) return;
      if (gameSim.state.phase === "playing" && !gameSim.state.menuOpen) {
        if (e.button === 0 || e.button === 2) {
          if (!this.isPointerLocked && document.pointerLockElement !== this.canvas) {
            try {
              this.canvas.requestPointerLock();
            } catch {
              // ignore if pointer lock is unavailable
            }
          }
          this.isMouseDown = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
      }
    };

    this.onMouseMove = (e: MouseEvent) => {
      if (this.isDestroyed) return;
      if (gameSim.state.phase !== "playing" || gameSim.state.menuOpen) return;

      let dx = 0;
      let dy = 0;
      if (this.isPointerLocked) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (this.isMouseDown) {
        dx = e.clientX - this.lastMouseX;
        dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }

      if (dx !== 0 || dy !== 0) {
        if (gameSim.state.story.aiming) {
          // Chapter 3: summit dish aiming
          gameSim.adjustAim(-dx * 0.002, dy * 0.002);
        } else {
          // GTA-style third-person orbit look
          this.camYaw -= dx * this.mouseSensitivity;
          this.camPitch += dy * this.mouseSensitivity;
          this.camPitch = Math.max(-0.25, Math.min(1.2, this.camPitch));
          this.roverAutoCenterTimer = 1.8;
        }
      }
    };

    this.onMouseUp = () => {
      this.isMouseDown = false;
    };

    this.onWheel = (e: WheelEvent) => {
      if (this.isDestroyed) return;
      if (gameSim.state.phase !== "playing" || gameSim.state.menuOpen) return;
      const delta = e.deltaY * 0.01;
      if (gameSim.state.player.inRover) {
        this.camDistRover = Math.max(8, Math.min(35, this.camDistRover + delta));
      } else {
        this.camDist = Math.max(5, Math.min(25, this.camDist + delta));
      }
    };

    this.onPointerLockChange = () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    };

    this.onContextMenu = (e: MouseEvent) => {
      if (gameSim.state.phase === "playing") {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private update(dt: number) {
    if (this.isDestroyed) return;
    // Sky, Sun, and Earth stay at "infinity" around the camera even on menus
    this.sky?.update(this.cameraEntity.getPosition(), dt);
    if (gameSim.state.phase !== "playing" || gameSim.state.menuOpen) {
      if (document.pointerLockElement === this.canvas) {
        try {
          document.exitPointerLock();
        } catch {
          // ignore
        }
      }
      return;
    }

    const state = gameSim.state;
    this.remotePlayerManager.update(dt);
    this.stormController.update(dt, state.activeStorm, state.eventBanner);
    if (state.player.inRover !== this.lastInRover) {
      this.lastInRover = state.player.inRover;
      if (state.player.inRover && this.rover) {
        this.camYaw = this.rover.heading + Math.PI;
        this.camPitch = 0.35;
        this.roverAutoCenterTimer = 0;
      }
    }
    const look = this.look;
    const meX = state.player.inRover ? state.rover.x : state.player.x;
    const meZ = state.player.inRover ? state.rover.z : state.player.z;

    // Permanently shadowed crater: the Sun can't reach you, so only lamps light the way
    const darkTarget = this.terrain.shadow(meX, meZ);
    this.dark += (darkTarget - this.dark) * Math.min(1, dt * 1.5);

    // 3D Environmental Event Feedback (solar storm haze/amber sun & micrometeor impact shake)
    const stormTarget = state.activeStorm ? 1 : 0;
    this.stormBlend += (stormTarget - this.stormBlend) * Math.min(1, dt * 2.5);
    const light = this.lightEntity.light;
    if (light) {
      // Storms stay readable: a red-amber cast and haze warn the crew without blacking out the map
      const base = pc.math.lerp(look.sunIntensity, look.sunIntensity * 0.75, this.stormBlend);
      light.intensity = base * (1 - 0.85 * this.dark);
      light.color.set(
        look.sunColor[0],
        pc.math.lerp(look.sunColor[1], 0.78, this.stormBlend),
        pc.math.lerp(look.sunColor[2], 0.6, this.stormBlend),
      );
    }
    const amb = look.ambient;
    this.app.scene.ambientLight.set(
      pc.math.lerp(pc.math.lerp(amb[0], amb[0] * 1.3, this.stormBlend), 0.035, this.dark),
      pc.math.lerp(pc.math.lerp(amb[1], amb[1] * 0.8, this.stormBlend), 0.04, this.dark),
      pc.math.lerp(pc.math.lerp(amb[2], amb[2] * 0.7, this.stormBlend), 0.06, this.dark),
    );
    if (this.fillLight?.light) this.fillLight.light.intensity = look.fill * (1 - 0.9 * this.dark);
    if (this.helmetLight) this.helmetLight.enabled = this.dark > 0.2 && !state.player.inRover;
    if (this.roverIceCargo) this.roverIceCargo.enabled = state.rover.waterTank > 0;
    this.story?.update(state.story, dt, this.dark);
    this.app.scene.fog.color.set(
      pc.math.lerp(0.02, 0.16, this.stormBlend),
      pc.math.lerp(0.025, 0.05, this.stormBlend),
      pc.math.lerp(0.04, 0.04, this.stormBlend),
    );
    this.app.scene.fog.start = pc.math.lerp(900, 260, this.stormBlend);
    this.app.scene.fog.end = pc.math.lerp(3600, 1400, this.stormBlend);
    if (
      state.eventBanner?.kind === "meteor" &&
      state.eventBanner.phase === "active" &&
      this.meteorDaySeen !== state.day
    ) {
      this.meteorDaySeen = state.day;
      this.shake = Math.min(1, this.shake + 0.9);
      const px = state.player.inRover ? state.rover.x : state.player.x;
      const pz = state.player.inRover ? state.rover.z : state.player.z;
      this.puff(px + 10, this.terrainHeightMap(px + 10, pz - 8), pz - 8, 18, 3.2);
    }

    // Update solar panel visual count & polar horizon tilt (flat when unaligned, 68° horizon tilt when aligned)
    const panelPitch = state.solarAligned ? 68 : 12;
    for (let i = 0; i < this.panelEntities.length; i++) {
      const panel = this.panelEntities[i];
      if (panel) {
        panel.enabled = i < state.panelsInstalled;
        if (panel.enabled) panel.setEulerAngles(panelPitch, 65, 0);
        const post = this.panelPosts[i];
        if (post) post.enabled = panel.enabled;
      }
    }
    if (this.orientLampMat) {
      const c: Vec3Tuple = state.siteOriented ? [0.2, 0.9, 0.5] : [0.49, 0.88, 0.72];
      this.orientLampMat.emissive.set(c[0], c[1], c[2]);
      this.orientLampMat.update();
    }
    if (this.trackerLampMat) {
      const c: Vec3Tuple = state.solarAligned ? [0.2, 1.0, 0.45] : [1.0, 0.65, 0.15];
      this.trackerLampMat.emissive.set(c[0], c[1], c[2]);
      this.trackerLampMat.update();
    }

    // Update modules visual state
    for (const id of ["A", "B", "C"] as ModuleId[]) {
      const entity = this.moduleEntities[id];
      if (!entity) continue;
      const st = state.modules[id];
      const building = entity.findByName("Building") as pc.Entity | null;
      const scaffold = entity.findByName("Scaffold") as pc.Entity | null;
      if (building) {
        building.enabled = st.status !== "locked" && st.status !== "available";
        // grow out of the pad while under construction
        const total = st.def.buildDays || 5;
        const t = st.status === "building" ? Math.max(0.15, 1 - st.daysLeft / total) : 1;
        building.setLocalScale(1, t, 1);
        if (
          building.enabled &&
          st.status !== "building" &&
          !this.obstacles.some((o) => o.id === id)
        ) {
          const pos = entity.getPosition();
          this.obstacles.push({ id, x: pos.x, z: pos.z, r: 6 });
        }
      }
      if (scaffold) scaffold.enabled = st.status === "building";
      const lm = this.lampMats[id];
      if (lm) {
        const c: Vec3Tuple =
          st.status === "active"
            ? [0.2, 1, 0.4]
            : st.status === "damaged"
              ? [1, 0.15, 0.1]
              : st.status === "paused"
                ? [1, 0.7, 0.1]
                : [0.25, 0.25, 0.3];
        lm.emissive.set(c[0], c[1], c[2]);
        lm.diffuse.set(c[0], c[1], c[2]);
        lm.update();
      }
    }
    for (const b of state.bases) {
      const p = this.outpostParts[b.id];
      if (!p) continue;
      p.stages.forEach((g, i) => (g.enabled = i < b.built));
      const on = state.baseOnline[b.id];
      const c: Vec3Tuple =
        b.built === 0
          ? state.networkOpen
            ? [0.9, 0.9, 1]
            : [0.2, 0.2, 0.25]
          : on
            ? [0.2, 1, 0.4]
            : [1, 0.6, 0.1];
      p.lamp.emissive.set(c[0], c[1], c[2]);
      p.lamp.update();
    }
    if (this.dockMat) {
      const c: Vec3Tuple = {
        empty: [0.95, 0.78, 0.15] as Vec3Tuple,
        docked: [0.3, 0.6, 1] as Vec3Tuple,
        charging: [0.3, 1, 0.5] as Vec3Tuple,
        full: [0.2, 0.9, 0.3] as Vec3Tuple,
      }[state.dockState];
      this.dockMat.diffuse.set(c[0], c[1], c[2]);
      this.dockMat.emissive.set(c[0] * 0.3, c[1] * 0.3, c[2] * 0.3);
      this.dockMat.update();
    }
    if (this.doorRoot) {
      this.doorRoot.enabled = ["active", "damaged"].includes(state.modules.A.status);
      const t =
        state.modules.A.status === "active"
          ? state.airlock.open
            ? 1
            : state.airlock.opening / RULES.AIRLOCK_SECONDS
          : 0;
      this.doorPanel?.setLocalPosition(0, 1.4 + t * 2.5, 0.45);
    }
    if (state.roverTeleport !== this.roverTeleportSeen && this.rover) {
      this.roverTeleportSeen = state.roverTeleport;
      const r = this.rover;
      r.x = state.rover.x;
      r.z = state.rover.z;
      r.heading = state.rover.rotation;
      r.vx = r.vy = r.vz = 0;
      r.flipped = false;
      r.y = this.terrainHeightMap(r.x, r.z) + ROVER_PHYS.RIDE_HEIGHT;
    }
    if (state.playerTeleport !== this.playerTeleportSeen && this.astro) {
      this.playerTeleportSeen = state.playerTeleport;
      const a = this.astro;
      a.x = state.player.x;
      a.z = state.player.z;
      a.heading = state.player.rotation;
      a.vx = a.vy = a.vz = 0;
      a.y = this.terrainHeightMap(a.x, a.z);
      a.grounded = true;
    }

    // Update 3D Objective Guidance Beacon
    if (this.objectiveBeacon) {
      const target = this.objectiveTarget();
      if (target) {
        this.objectiveBeacon.enabled = true;
        const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.12;
        this.objectiveBeacon.setPosition(
          target.x,
          this.terrainHeightMap(target.x, target.z),
          target.z,
        );
        this.objectiveBeacon.setLocalScale(pulse, 1, pulse);
      } else {
        this.objectiveBeacon.enabled = false;
      }
    }

    // Spawn 3D entities for any newly revealed hidden ice sites, then scale crystals
    for (const simIce of state.iceSites) {
      if (!this.iceEntities.some((e) => e.id === simIce.id)) {
        this.spawnIceEntity(simIce);
      }
    }
    for (const iceItem of this.iceEntities) {
      const simIce = state.iceSites.find((s) => s.id === iceItem.id);
      iceItem.entity.enabled = !!simIce;
      if (simIce) {
        const sc = crystalScale(simIce.deposit, simIce.maxDeposit);
        iceItem.crystal.enabled = sc > 0;
        if (sc > 0) {
          const b = iceItem.baseScale;
          iceItem.crystal.setLocalScale(b.x * sc, b.y * sc, b.z * sc);
        }
      }
    }

    // Handle Movement
    if (!this.astro) {
      this.astro = makeAstronaut(state.player.x, state.player.z, this.terrainHeightMap);
      this.rover = makeRover(
        state.rover.x,
        state.rover.z,
        state.rover.rotation,
        this.terrainHeightMap,
      );
      if (state.player.inRover) {
        this.camYaw = state.rover.rotation + Math.PI;
      } else {
        this.camYaw = 0;
      }
      this.camPitch = 0.35;
      this.lastInRover = state.player.inRover;
    }
    if (state.story.aiming && this.story) {
      this.updateAim(dt);
      this.settleParkedRover(dt);
    } else if (state.player.inRover) {
      this.updateRover(dt);
    } else {
      this.updatePlayer(dt);
      this.settleParkedRover(dt);
      // Keep sim coords locked to the parked chassis so it never drifts from where you left it
      if (this.rover) {
        state.rover.x = this.rover.x;
        state.rover.z = this.rover.z;
        state.rover.rotation = this.rover.heading;
        state.rover.speed = 0;
      }
    }
    this.updateDust(dt);

    // Check & update context prompt
    this.updatePrompt(dt);
  }

  private updatePlayer(dt: number) {
    const state = gameSim.state;
    let fwd = 0,
      str = 0;
    if (this.keys["w"] || this.keys["arrowup"]) fwd += 1;
    if (this.keys["s"] || this.keys["arrowdown"]) fwd -= 1;
    if (this.keys["a"] || this.keys["arrowleft"]) str -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) str += 1;

    // Camera-relative forward and right vectors projected onto the horizontal XZ plane
    const camForwardX = -Math.sin(this.camYaw);
    const camForwardZ = -Math.cos(this.camYaw);
    const camRightX = Math.cos(this.camYaw);
    const camRightZ = -Math.sin(this.camYaw);

    let moveX = camForwardX * fwd + camRightX * str;
    let moveZ = camForwardZ * fwd + camRightZ * str;
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.001) {
      moveX /= len;
      moveZ /= len;
    } else {
      moveX = 0;
      moveZ = 0;
    }

    const a = this.astro;
    // resync if the sim moved the player (e.g. exiting the rover)
    if (Math.hypot(a.x - state.player.x, a.z - state.player.z) > 3) {
      a.x = state.player.x;
      a.z = state.player.z;
      a.y = this.terrainHeightMap(a.x, a.z);
      a.vx = a.vz = a.vy = 0;
    }
    const wasGrounded = a.grounded;
    stepAstronaut(
      a,
      { x: moveX, z: moveZ },
      this.jumpQueued,
      dt,
      this.terrainHeightMap,
      this.obstacles,
    );
    this.jumpQueued = false;
    this.clampToPlayArea(a);
    if (!wasGrounded && a.grounded) this.puff(a.x, a.y, a.z, 6, 1.2);

    state.player.x = a.x;
    state.player.z = a.z;
    state.player.rotation = a.heading;
    state.cameraHeading = this.camYaw + Math.PI;
    this.playerEntity.setPosition(a.x, a.y, a.z);
    // slight forward lean while bounding
    const lean = Math.min(15, Math.hypot(a.vx, a.vz) * 2);
    this.playerEntity.setEulerAngles(0, (a.heading * 180) / Math.PI, 0);
    this.playerEntity.rotateLocal(lean, 0, 0);
    if (this.limbs) {
      const sp = Math.hypot(a.vx, a.vz);
      this.walkPhase += dt * (2 + sp * 1.1);
      const amp = a.grounded ? Math.min(35, sp * 7) : 12;
      const sw = Math.sin(this.walkPhase) * amp;
      this.limbs.lLeg.setLocalEulerAngles(sw, 0, 0);
      this.limbs.rLeg.setLocalEulerAngles(-sw, 0, 0);
      this.limbs.lArm.setLocalEulerAngles(-sw * 0.8, 0, -8);
      this.limbs.rArm.setLocalEulerAngles(sw * 0.8, 0, 8);
    }

    const ground = this.terrainHeightMap(a.x, a.z);
    const camY = Math.max(ground, a.y * 0.5 + ground * 0.5);
    const focus = this.story?.cameraFocus(state.story) ?? null;

    // GTA-style third-person orbit camera
    const cosPitch = Math.cos(this.camPitch);
    const sinPitch = Math.sin(this.camPitch);
    const offsetX = Math.sin(this.camYaw) * cosPitch * this.camDist;
    const offsetZ = Math.cos(this.camYaw) * cosPitch * this.camDist;
    const offsetY = sinPitch * this.camDist;

    const target = focus
      ? new pc.Vec3(a.x, camY + 5, a.z + 24)
      : new pc.Vec3(a.x + offsetX, a.y + 1.6 + offsetY, a.z + offsetZ);
    target.y = Math.max(target.y, this.terrainHeightMap(target.x, target.z) + 1.5);
    const cp = this.cameraEntity.getPosition();
    const k = 1 - Math.exp(-10 * Math.min(dt, 0.05));
    this.cameraEntity.setPosition(
      pc.math.lerp(cp.x, target.x, k),
      pc.math.lerp(cp.y, target.y, k),
      pc.math.lerp(cp.z, target.z, k),
    );
    if (focus)
      this.cameraEntity.lookAt(new pc.Vec3().lerp(new pc.Vec3(a.x, a.y + 1.5, a.z), focus, 0.7));
    else this.cameraEntity.lookAt(a.x, a.y + 1.5, a.z);
    if (this.shake > 0.001) {
      const t = performance.now() * 0.05,
        s = this.shake * 1.2;
      this.cameraEntity.rotateLocal(Math.sin(t * 1.7) * s, Math.sin(t * 2.3) * s, 0);
      this.shake *= Math.exp(-6 * Math.min(dt, 0.05));
    }
  }

  private updateRover(dt: number) {
    const state = gameSim.state;
    const r = this.rover;
    const R = CONFIG.ROVER;

    let boost = 1;
    const rv = state.rover;
    const canBoost = rv.isBoosting
      ? rv.battery > 0 && rv.boostCooldown <= 0
      : canStartBoost(rv.battery, rv.batteryMax, rv.boostCooldown, R.boostMinBatteryRatio);
    if (this.keys["shift"] && canBoost) {
      rv.isBoosting = true;
      boost = R.boostSpeedMultiplier;
      rv.boostTime += dt;
      rv.battery = Math.max(0, rv.battery - R.batteryDrainPerSecond * R.boostDrainMultiplier * dt);
      if (rv.boostTime >= R.boostMaxSeconds) {
        rv.isBoosting = false;
        rv.boostTime = 0;
        rv.boostCooldown = R.boostCooldownSeconds;
        gameSim.addToast(`Booster overheated. Cooling down ${R.boostCooldownSeconds}s.`, "warn");
      }
    } else {
      if (
        this.keys["shift"] &&
        !rv.isBoosting &&
        rv.boostCooldown <= 0 &&
        rv.battery < rv.batteryMax * R.boostMinBatteryRatio &&
        !this.boostWarned
      ) {
        this.boostWarned = true;
        gameSim.addToast("Booster needs 20% battery.", "warn");
      }
      if (!this.keys["shift"]) this.boostWarned = false;
      rv.isBoosting = false;
      rv.boostTime = 0;
    }

    let throttle = 0,
      steer = 0;
    if (state.rover.battery > 0 && state.rover.damage < R.maxDamage) {
      if (this.keys["w"] || this.keys["arrowup"]) throttle = 1;
      if (this.keys["s"] || this.keys["arrowdown"]) throttle = -1;
    }
    if (this.keys["a"] || this.keys["arrowleft"]) steer += 1;
    if (this.keys["d"] || this.keys["arrowright"]) steer -= 1;

    const wasGrounded = r.grounded;
    const impact = stepRover(
      r,
      { throttle, steer, boost },
      damagedMaxSpeed(R.maxSpeed, state.rover.damage),
      dt,
      this.terrainHeightMap,
      this.obstacles,
    );
    this.clampToPlayArea(r);
    const speed = Math.hypot(r.vx, r.vz);
    if (impact > ROVER_PHYS.CRASH_SPEED) {
      state.rover.damage = Math.min(R.maxDamage, state.rover.damage + 1);
      gameSim.addToast("Rover collision! Chassis damaged.", "warn");
      this.puff(r.x, r.y, r.z, 12, 2);
    }
    const bump = r.bump || 0;
    if (bump > 2) {
      this.shake = Math.min(1, this.shake + bump * 0.12);
      this.puff(r.x, r.y - 0.7, r.z, Math.min(20, 4 + bump * 3), 1 + bump * 0.2);
      sound.playThud(Math.min(1, bump / 6));
      if (bump > 6) {
        state.rover.damage = Math.min(R.maxDamage, state.rover.damage + 1);
        gameSim.addToast("Hard landing! Suspension damaged.", "warn");
      }
    }
    if (impact > 2) this.shake = Math.min(1, this.shake + impact * 0.08);
    if (r.grounded && speed > 4 && Math.random() < speed * dt * 0.8) {
      this.puff(
        r.x - Math.sin(r.heading) * 2,
        r.y - 0.6,
        r.z - Math.cos(r.heading) * 2,
        2,
        0.6 + speed * 0.06,
      );
    }
    if (r.flipped) {
      this.flipTimer += dt;
      if (this.flipTimer > 2.5) {
        r.flipped = false;
        r.roll = 0;
        r.pitch = 0;
        r.vx = r.vz = 0;
        r.y = this.terrainHeightMap(r.x, r.z) + 2;
        this.flipTimer = 0;
        state.rover.damage = Math.min(R.maxDamage, state.rover.damage + 1);
        gameSim.addToast("Rover rolled over! Recovered with damage.", "warn");
      }
    }

    if (speed > 1)
      state.rover.battery = Math.max(0, state.rover.battery - R.batteryDrainPerSecond * dt);
    state.rover.speed = r.vx * Math.sin(r.heading) + r.vz * Math.cos(r.heading);
    state.rover.x = r.x;
    state.rover.z = r.z;
    state.rover.rotation = r.heading;
    state.cameraHeading = this.camYaw + Math.PI;
    sound.setRoverEngineSpeed(Math.min(1, speed / R.maxSpeed), state.rover.isBoosting);

    this.roverEntity.setPosition(r.x, r.y - ROVER_PHYS.RIDE_HEIGHT, r.z);
    this.roverEntity.setEulerAngles(0, (r.heading * 180) / Math.PI, 0);
    this.wheelSpin = (this.wheelSpin + (state.rover.speed / 0.475) * dt * (180 / Math.PI)) % 360;
    for (const w of this.roverWheels) w.setLocalEulerAngles(this.wheelSpin, 0, 0);
    this.roverEntity.rotateLocal(
      (-r.pitch * 180) / Math.PI,
      0,
      ((r.flipped ? Math.sign(r.roll) * 1.6 : r.roll) * 180) / Math.PI,
    );
    // Position and orient astronaut in the driver's seat, facing the front of the vehicle
    const localSeat = new pc.Vec3(-0.6, 0.12, 0.55);
    const worldSeat = new pc.Vec3();
    this.roverEntity.getWorldTransform().transformPoint(localSeat, worldSeat);
    this.playerEntity.setPosition(worldSeat);
    this.playerEntity.setRotation(this.roverEntity.getRotation());
    this.astro.x = r.x;
    this.astro.z = r.z;
    this.astro.heading = r.heading;
    state.player.rotation = r.heading;

    if (this.limbs) {
      // Natural seated driving pose: legs resting forward on seat, hands on steering controls
      const steer = (this.keys["a"] || this.keys["arrowleft"])
        ? 1
        : (this.keys["d"] || this.keys["arrowright"])
          ? -1
          : 0;
      this.limbs.lLeg.setLocalEulerAngles(-78, -4, 0);
      this.limbs.rLeg.setLocalEulerAngles(-78, 4, 0);
      this.limbs.lArm.setLocalEulerAngles(-42 - steer * 12, 14, -8);
      this.limbs.rArm.setLocalEulerAngles(-42 + steer * 12, -14, 8);
    }

    // Rover camera auto-centering behind vehicle when driving without mouse input
    if (this.roverAutoCenterTimer > 0) {
      this.roverAutoCenterTimer -= dt;
    } else if (speed > 0.8) {
      const desiredYaw = r.heading + Math.PI;
      let diff = desiredYaw - this.camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.camYaw += diff * Math.min(1, 2.5 * dt);
    }

    const cosPitch = Math.cos(this.camPitch);
    const sinPitch = Math.sin(this.camPitch);
    const camX = r.x + Math.sin(this.camYaw) * cosPitch * this.camDistRover;
    const camZ = r.z + Math.cos(this.camYaw) * cosPitch * this.camDistRover;
    const camY = r.y + 1.2 + sinPitch * this.camDistRover;

    const target = new pc.Vec3(
      camX,
      Math.max(camY, this.terrainHeightMap(camX, camZ) + 2.5),
      camZ,
    );
    const cp = this.cameraEntity.getPosition();
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.05));
    this.cameraEntity.setPosition(
      pc.math.lerp(cp.x, target.x, k),
      pc.math.lerp(cp.y, target.y, k),
      pc.math.lerp(cp.z, target.z, k),
    );
    this.cameraEntity.lookAt(r.x, r.y + 1.2, r.z);
    if (this.shake > 0.001) {
      const t = performance.now() * 0.05,
        a = this.shake * 1.5;
      this.cameraEntity.rotateLocal(
        Math.sin(t * 1.7) * a,
        Math.sin(t * 2.3) * a,
        Math.sin(t * 3.1) * a * 0.5,
      );
      this.shake *= Math.exp(-6 * Math.min(dt, 0.05));
    }
  }

  /** Soft wall at the survey-area edge so nobody drives off the mapped terrain. */
  private clampToPlayArea(b: { x: number; z: number; vx: number; vz: number }) {
    const d = Math.hypot(b.x, b.z);
    if (d <= PLAY_RADIUS) {
      if (d < PLAY_RADIUS - 30) this.edgeWarned = false;
      return;
    }
    const nx = b.x / d,
      nz = b.z / d;
    b.x = nx * PLAY_RADIUS;
    b.z = nz * PLAY_RADIUS;
    const out = b.vx * nx + b.vz * nz;
    if (out > 0) {
      b.vx -= out * nx;
      b.vz -= out * nz;
    }
    if (!this.edgeWarned) {
      this.edgeWarned = true;
      gameSim.addToast("Edge of the survey area. Turn back toward camp.", "warn");
    }
  }

  /** Dish steering on the Malapert summit: A/D yaw, W/S pitch; camera rides behind the dish. */
  private updateAim(dt: number) {
    const state = gameSim.state;
    const s = state.story;
    const rate = 0.6 * Math.min(dt, 0.05);
    let dYaw = 0,
      dPitch = 0;
    if (this.keys["a"] || this.keys["arrowleft"]) dYaw += rate;
    if (this.keys["d"] || this.keys["arrowright"]) dYaw -= rate;
    if (this.keys["w"] || this.keys["arrowup"]) dPitch += rate * 0.7;
    if (this.keys["s"] || this.keys["arrowdown"]) dPitch -= rate * 0.7;
    if (dYaw || dPitch) gameSim.adjustAim(dYaw, dPitch);

    const a = this.astro;
    this.playerEntity.setPosition(a.x, a.y, a.z);
    if (this.limbs) {
      this.limbs.lArm.setLocalEulerAngles(-70, 0, -8);
      this.limbs.rArm.setLocalEulerAngles(-70, 0, 8);
      this.limbs.lLeg.setLocalEulerAngles(0, 0, 0);
      this.limbs.rLeg.setLocalEulerAngles(0, 0, 0);
    }
    if (!this.story) return;
    const pivot = this.story.dishPivot();
    const dir = new pc.Vec3(
      Math.sin(s.aimYaw) * Math.cos(s.aimPitch),
      Math.sin(s.aimPitch),
      Math.cos(s.aimYaw) * Math.cos(s.aimPitch),
    );
    // Over-the-shoulder and parallel to the dish axis: the dish sits lower-left, and Earth (at
    // infinity) lands exactly under the screen-centre crosshair when the aim is right
    const right = new pc.Vec3().cross(dir, pc.Vec3.UP).normalize();
    const camPos = pivot
      .clone()
      .sub(dir.clone().mulScalar(13))
      .add(right.mulScalar(5))
      .add(new pc.Vec3(0, 4.5, 0));
    camPos.y = Math.max(camPos.y, this.terrainHeightMap(camPos.x, camPos.z) + 2);
    const cp = this.cameraEntity.getPosition();
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.05));
    const next = cp.clone().lerp(cp, camPos, k);
    this.cameraEntity.setPosition(next);
    this.cameraEntity.lookAt(next.clone().add(dir.mulScalar(1000)));
  }

  /** Beacon target: story step targets at story camps, mission stages at Camp Sirius. */
  private objectiveTarget(): Point | null {
    if (!this.storyDef) return this.getStageTarget(gameSim.state.stage);
    return gameSim.storyTarget();
  }

  /** Keeps the parked rover settled on the terrain slope without sliding away. */
  private settleParkedRover(dt: number) {
    const r = this.rover;
    const parkX = gameSim.state.rover.x;
    const parkZ = gameSim.state.rover.z;
    // Pin horizontal position to the leave-spot; only settle height / attitude
    r.x = parkX;
    r.z = parkZ;
    r.vx = 0;
    r.vz = 0;
    stepRover(r, { throttle: 0, steer: 0, boost: 1 }, 0, dt, this.terrainHeightMap, this.obstacles);
    r.x = parkX;
    r.z = parkZ;
    r.vx = 0;
    r.vz = 0;
    this.roverEntity.setPosition(r.x, r.y - ROVER_PHYS.RIDE_HEIGHT, r.z);
    this.roverEntity.setEulerAngles(0, (r.heading * 180) / Math.PI, 0);
    this.roverEntity.rotateLocal((-r.pitch * 180) / Math.PI, 0, (r.roll * 180) / Math.PI);
  }

  private getStageTarget(stage: MissionStage): { x: number; z: number } | null {
    const st = gameSim.state;
    switch (stage) {
      case "orient":
        return ORIENT_CONSOLE;
      case "panels":
        return { x: SOLAR_FIELD.x, z: SOLAR_FIELD.z };
      case "align_panels":
        return SOLAR_TRACKER;
      case "board_rover":
        return { x: st.rover.x, z: st.rover.z };
      case "find_ice": {
        let nearest: { x: number; z: number; d: number } | null = null;
        for (const ice of st.iceSites) {
          if (ice.deposit <= 0) continue;
          const d = Math.hypot(ice.x - st.rover.x, ice.z - st.rover.z);
          if (!nearest || d < nearest.d) nearest = { x: ice.x, z: ice.z, d };
        }
        return nearest ? { x: nearest.x, z: nearest.z } : null;
      }
      case "unload":
        return DOCK;
      case "build_A":
        return { x: 20, z: -10 };
      case "enter_airlock":
        return HAB_DOOR;
      case "build_B":
        return { x: 35, z: 5 };
      case "build_C":
        return { x: 25, z: 25 };
      default:
        return null;
    }
  }

  private findAction(): {
    key: "e" | "r";
    hold: number;
    objectText: string;
    actionText: string;
    run: () => void;
  } | null {
    const st = gameSim.state;
    const A = (
      key: "e" | "r",
      hold: number,
      objectText: string,
      actionText: string,
      run: () => void,
    ) => ({ key, hold, objectText, actionText, run });
    const info = (objectText: string, actionText: string) => ({
      key: "e" as const,
      hold: -1,
      objectText,
      actionText,
      run: () => {},
    });

    // Story camps: one story prompt at a time; real actions beat boarding, info yields to it
    const story = this.storyDef;
    let storyInfo: ReturnType<typeof info> | null = null;
    if (story) {
      if (st.story.aiming) {
        const sig = gameSim.aimSignal();
        if (sig >= STORY.AIM_LOCK_SIGNAL)
          return A(
            "e",
            STORY.AIM_LOCK_HOLD,
            `Main Antenna · Signal ${sig}%`,
            "Hold E to Lock Earth Link",
            () => gameSim.lockAntenna(),
          );
        return info(
          `Main Antenna · Signal ${sig}%`,
          "Steer with A/D and W/S toward Earth · Space to step away",
        );
      }
      const sa = gameSim.storyAction();
      if (sa && sa.id !== "info")
        return A("e", sa.hold, sa.objectText, sa.actionText, () => gameSim.performStoryAction(sa));
      if (sa) storyInfo = info(sa.objectText, sa.actionText);
    }

    if (st.player.inRover) {
      for (const ice of st.iceSites) {
        if (Math.hypot(st.rover.x - ice.x, st.rover.z - ice.z) < 22 && ice.deposit > 0) {
          if (story?.id === "chapter4" && !st.story.roverUpgraded)
            return info(
              "Crater Ice",
              "Too dark and cold: fit lights & heaters at the Upgrade Bay first",
            );
          return A(
            "e",
            RULES.ICE_HOLD,
            `Crater Ice (${ice.deposit}W Remaining)`,
            "Hold E to Harvest Ice",
            () => gameSim.fillIce(ice.id),
          );
        }
      }
      if (Math.hypot(st.rover.x - DOCK.x, st.rover.z - DOCK.z) < 16 && st.rover.waterTank > 0)
        return A(
          "e",
          0,
          story?.id === "chapter4" && currentStep(story, st.story)?.kind === "refine"
            ? `Ice Refinery (${st.rover.waterTank}W)`
            : "Water Refinery Tank",
          story?.id === "chapter4" && currentStep(story, st.story)?.kind === "refine"
            ? `Press E to Refine Ice → Water (${st.rover.waterTank}W)`
            : `Unload & Process (${st.rover.waterTank}W)`,
          () => gameSim.unloadWater(),
        );
      if (storyInfo) return storyInfo;
      if (Math.hypot(st.rover.x - DOCK.x, st.rover.z - DOCK.z) < CONFIG.ROVER.chargeRadius) {
        if (st.dockState === "charging") {
          return info(
            "Charging Dock",
            `Charging (${Math.round(st.rover.battery)}/${st.rover.batteryMax}E) · Space to exit`,
          );
        }
        if (st.dockState === "docked" && st.rover.battery < st.rover.batteryMax - 0.5) {
          if (st.energy <= 0) {
            return info("Charging Dock", "Base energy empty — deploy solar arrays to charge");
          }
          if (Math.abs(st.rover.speed) >= 0.5) {
            return info(
              "Charging Dock",
              "Stop moving (or Space to exit) so the dock can charge your battery",
            );
          }
          return info(
            "Charging Dock",
            "Parked — charging will start · Space to exit and walk",
          );
        }
      }
      return null;
    }
    const px = st.player.x,
      pz = st.player.z;
    const dRover = Math.hypot(px - st.rover.x, pz - st.rover.z);
    if (dRover < 8) {
      if (st.rover.damage > 0 && this.keys["r"])
        return A(
          "r",
          RULES.ROVER_REPAIR_HOLD,
          "Lunar Rover",
          `Repairing chassis (${CONFIG.ROVER.repairEnergy}E)`,
          () => gameSim.repairRover(),
        );
      if (st.rover.damage > 0)
        return {
          ...A(
            "e",
            0,
            `Lunar Rover (damage ${st.rover.damage}/${CONFIG.ROVER.maxDamage}) - hold R to repair`,
            "Board Vehicle",
            () => gameSim.boardRover(),
          ),
        };
      return A("e", 0, "Lunar Rover", "Board Vehicle", () => gameSim.boardRover());
    }
    if (Math.hypot(px - RECOVERY_CONSOLE.x, pz - RECOVERY_CONSOLE.z) < 3.5) {
      const away = Math.hypot(st.rover.x - DOCK.x, st.rover.z - DOCK.z) > 20;
      const stuck = st.rover.battery <= 0 || st.rover.damage >= CONFIG.ROVER.maxDamage;
      if (away || stuck)
        return A("e", 0, "Rover Recovery Console", "Recall Rover (cargo preserved)", () =>
          gameSim.recoverRover(),
        );
      return info("Rover Recovery Console", "Rover is at base");
    }
    if (
      ["active", "damaged"].includes(st.modules.A.status) &&
      Math.hypot(px - HAB_DOOR.x, pz - HAB_DOOR.z) < 4
    ) {
      if (st.modules.A.status === "damaged") {
        return info("Habitat Airlock (SEALED)", "Habitat A damaged — hold R at module to repair");
      }
      if (st.airlock.open)
        return info(
          "Habitat Airlock",
          st.player.insideAirlock
            ? story?.id === "chapter3" && st.story.stormTimer > 0
              ? "Sheltered — stay here until the storm ends"
              : "Inside: refilling oxygen"
            : story?.id === "chapter3" && (st.story.stormCountdown > 0 || st.story.stormTimer > 0)
              ? "Walk into the doorway and stay for shelter"
              : "Door open",
        );
      if (st.airlock.opening > 0)
        return info(
          "Habitat Airlock",
          `Cycling... ${Math.ceil(RULES.AIRLOCK_SECONDS - st.airlock.opening)}s`,
        );
      return A(
        "e",
        0,
        "Habitat Airlock",
        story?.id === "chapter3" && (st.story.stormCountdown > 0 || st.story.stormTimer > 0)
          ? "Open Airlock — shelter from the storm!"
          : "Open Airlock",
        () => gameSim.openAirlock(),
      );
    }
    if (storyInfo) return storyInfo;
    if (story?.id === "chapter4" && currentStep(story, st.story)?.kind === "harvest") {
      for (const ice of st.iceSites) {
        if (Math.hypot(px - ice.x, pz - ice.z) < 22 && ice.deposit > 0) {
          return info(
            "Crater Ice",
            "Board the rover — harvest ice from the driver's seat only (stay warm & O2-safe)",
          );
        }
      }
    }
    // Everything below exists only at Camp Sirius (Chapter 1 and the sandbox)
    if (story) return null;
    if (Math.hypot(px - ORIENT_CONSOLE.x, pz - ORIENT_CONSOLE.z) < 4.2) {
      if (!st.siteOriented) {
        return A("e", 0, "Camp Sirius Orientation Console", "Calibrate Radar & Site Map", () =>
          gameSim.completeOrientation(),
        );
      }
      return info(
        "Camp Sirius Orientation Console",
        "Radar calibrated · Solar West (-X) · Rover Dock East (+X)",
      );
    }
    if (Math.hypot(px - SOLAR_TRACKER.x, pz - SOLAR_TRACKER.z) < 4.5) {
      if (!st.solarAligned && st.panelsInstalled > 0) {
        return A(
          "e",
          RULES.SOLAR_ALIGN_HOLD,
          "Polar Sun-Tracker Console (70% Output)",
          "Hold E to Align Arrays to Horizon (100%)",
          () => gameSim.alignSolarArrays(),
        );
      }
      if (!st.solarAligned) {
        return info("Polar Sun-Tracker Console", "Deploy solar panels first, then align");
      }
      return info("Polar Sun-Tracker Console", "Locked to grazing polar sun (100% efficiency)");
    }
    if (
      Math.hypot(px - SOLAR_FIELD.x, pz - SOLAR_FIELD.z) < SOLAR_FIELD.radius &&
      st.panelsInstalled < CONFIG.PANELS_TOTAL
    ) {
      return A(
        "e",
        RULES.PANEL_HOLD,
        "Solar Field Array",
        `Hold to Deploy (Today ${st.panelsInstalledToday}/${CONFIG.PANELS_PER_DAY})`,
        () => gameSim.installPanel(),
      );
    }
    for (const b of BASES) {
      if (Math.hypot(px - b.x, pz - b.z) >= 12) continue;
      const bs = st.bases.find((x) => x.id === b.id)!;
      if (!st.networkOpen)
        return info(`${b.label} site`, "Locked: finish Habitat A and 3 solar panels");
      const f = b.facilities[bs.built];
      if (f)
        return A(
          "e",
          0,
          `${b.label} (${bs.built}/3)`,
          `Build ${f.name} (${f.energy}E, ${f.water}W)`,
          () => gameSim.buildFacility(b.id),
        );
      if (b.id === "FOOD")
        return A(
          "e",
          0,
          `${b.label}: ${st.baseOnline[b.id] ? "ONLINE" : "OFFLINE"}`,
          bs.led ? "Turn LED lights off" : "Turn LED lights on (+1 food, +3E/day)",
          () => gameSim.toggleLed(),
        );
      return info(`${b.label}: ${st.baseOnline[b.id] ? "ONLINE" : "OFFLINE"}`, b.role);
    }
    const mods: { id: ModuleId; name: string; x: number; z: number }[] = [
      { id: "A", name: "Habitat A", x: 20, z: -10 },
      { id: "B", name: "Farm B", x: 35, z: 5 },
      { id: "C", name: "Research Lab C", x: 25, z: 25 },
    ];
    for (const m of mods) {
      if (Math.hypot(px - m.x, pz - m.z) >= 12) continue;
      const mod = st.modules[m.id],
        up = `${mod.def.upkeep.energy}E/${mod.def.upkeep.water}W per day`;
      if (mod.status === "available")
        return A(
          "e",
          0,
          `${m.name} Foundation`,
          `Begin Construction (${mod.def.cost.energy}E, ${mod.def.cost.water}W)`,
          () => gameSim.startBuilding(m.id),
        );
      if (mod.status === "building")
        return info(`${m.name} Foundation`, `Under Construction (${mod.daysLeft}d left)`);
      if (mod.status === "damaged")
        return A(
          "r",
          RULES.MODULE_REPAIR_HOLD,
          `${m.name}: DAMAGED (still costs ${up})`,
          `Hold R to Repair (${RULES.MODULE_REPAIR_ENERGY}E)`,
          () => gameSim.repairModule(m.id),
        );
      if (m.id === "B" && (mod.status === "active" || mod.status === "paused"))
        return A(
          "e",
          0,
          `Farm B: ${mod.status === "active" ? "RUNNING" : "STANDBY"} (${up})`,
          mod.status === "active" ? "Pause Farm" : "Resume Farm",
          () => gameSim.toggleFarmPause(),
        );
      if (mod.status === "active" && m.id !== "A") return info(`${m.name}: RUNNING`, up);
    }
    return null;
  }

  private lastPromptT = 0;
  private updatePrompt(_dt = 0) {
    const st = gameSim.state;
    // real elapsed time, so holds take the same seconds even on slow frames
    const now = performance.now();
    const dt = this.lastPromptT ? Math.min(0.5, (now - this.lastPromptT) / 1000) : 0;
    this.lastPromptT = now;
    const a = this.findAction();
    if (!a || !this.action || a.actionText !== this.action.actionText) this.holdProgress = 0;
    this.action = a;
    if (a && a.hold > 0) {
      const held = !!this.keys[a.key] && !this.holdLatch;
      this.holdProgress = holdStep(this.holdProgress, dt, a.hold, held);
      if (this.holdProgress >= 1) {
        a.run();
        this.holdProgress = 0;
        this.holdLatch = true;
      }
    }
    st.prompt = a
      ? {
          visible: true,
          objectText: a.objectText,
          actionText: a.actionText,
          keyText: a.hold < 0 ? "" : a.key.toUpperCase(),
          holdProgress: this.holdProgress,
        }
      : null;
  }

  public getApp(): pc.Application {
    return this.app;
  }

  public getLightEntity(): pc.Entity {
    return this.lightEntity;
  }

  public getSkyRig(): SkyRig | null {
    return this.sky;
  }

  public getRemotePlayerManager(): RemotePlayerManager {
    return this.remotePlayerManager;
  }

  public getStormController(): StormVisualController {
    return this.stormController;
  }

  public destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (document.pointerLockElement === this.canvas) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
    if (this.cameraFrame) {
      this.cameraFrame.destroy();
      this.cameraFrame = null;
    }
    this.remotePlayerManager?.destroy();
    this.stormController?.destroy();
    this.app.destroy();
  }
}
