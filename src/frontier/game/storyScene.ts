// Chapter 2–4 props built from Kenney parts + primitives, synced to story progress every frame.
import * as pc from "playcanvas";
import type { Obstacle } from "./lunarPhysics";
import {
  latheMesh,
  meshPart,
  mkMat,
  part,
  solarCellTexture,
  type ModelKit,
  type Vec3Tuple,
} from "./sceneKit";
import { EARTH_DIRECTION, type Point } from "./sites";
import {
  CABEUS_OVERLOOK,
  CABEUS_RADAR,
  CARGO_CONSOLE,
  CARGO_PAD,
  HELIOS_TOWER,
  MALAPERT_ANTENNA,
  MOUTON_MASTS,
  RELAY_STATION,
  STORY,
  UPGRADE_BAY,
  antennaSignal,
  packsReady,
  type StoryChapterDef,
  type StoryState,
} from "./storyline";

export interface StoryTools {
  app: pc.Application;
  kit: ModelKit;
  height: (x: number, z: number) => number;
  obstacles: (Obstacle & { id?: string })[];
  accent: pc.Color;
  sunYaw: number;
  puff: (x: number, y: number, z: number, n: number, power: number) => void;
}

/** Visual offset of the third Mons Mouton mast so it doesn't stand inside the Solar Tower. */
const KNOLL_MAST_OFFSET: Point = { x: -8, z: -6 };
const HOPPER_SCALE = 2.6;

export class StoryScene {
  private root = new pc.Entity("StoryProps");
  private structures = new Map<string, { e: pc.Entity; at: Point; r: number }>();
  private markers = new Map<string, pc.Entity>();
  private seen = new Set<string>();
  private mastLamps: pc.StandardMaterial[] = [];
  private towerPacks: pc.Entity[] = [];
  private padPacks: pc.Entity[] = [];
  private padBarrels: pc.Entity[] = [];
  private roverCargo: pc.Entity[] = [];
  private hopper: pc.Entity | null = null;
  private flame: pc.Entity | null = null;
  private flameLight: pc.Entity | null = null;
  private wings: pc.Entity | null = null;
  private dishYaw: pc.Entity | null = null;
  private dishPitch: pc.Entity | null = null;
  private beam: pc.Entity | null = null;
  private beamMat: pc.StandardMaterial | null = null;
  private aimRay: pc.Entity | null = null;
  private aimRayMat: pc.StandardMaterial | null = null;
  private radarPulse: {
    mesh: pc.Mesh;
    positions: Float32Array;
    mat: pc.StandardMaterial;
  } | null = null;
  private bayMat: pc.StandardMaterial | null = null;
  private lightBar: pc.Entity | null = null;
  private headlight: pc.Entity | null = null;
  private launchStarted = false;
  private time = 0;
  private readonly white = mkMat(0.86, 0.87, 0.9, { metal: 0.3, gloss: 0.55 });
  private readonly steel = mkMat(0.55, 0.57, 0.62, { metal: 0.7, gloss: 0.5 });
  private readonly dark = mkMat(0.16, 0.17, 0.2, { metal: 0.4, gloss: 0.4 });
  private readonly glow: pc.StandardMaterial;
  private readonly markerMat: pc.StandardMaterial;
  private readonly packMat: pc.StandardMaterial;

  constructor(
    private def: StoryChapterDef,
    private t: StoryTools,
    rover: pc.Entity,
  ) {
    const a = t.accent;
    this.glow = mkMat(a.r, a.g, a.b, { emissive: 2.2 });
    this.markerMat = mkMat(a.r, a.g, a.b, { emissive: 1.6, opacity: 0.35 });
    this.packMat = mkMat(1, 0.78, 0.25, { emissive: 1.8 });
    t.app.root.addChild(this.root);
    if (def.id === "chapter2") this.buildHelios();
    if (def.id === "chapter3") this.buildRelay();
    if (def.id === "chapter4") this.buildHorizon();
    if (def.id === "chapter2" || def.id === "chapter4") this.buildHopper();
    this.buildRoverCargo(rover);
  }

  private group(name: string, at: Point, yaw = 0) {
    const g = new pc.Entity(name);
    g.setPosition(at.x, this.t.height(at.x, at.z), at.z);
    g.setEulerAngles(0, yaw, 0);
    this.root.addChild(g);
    return g;
  }

  private structure(id: string, at: Point, r: number, build: (g: pc.Entity) => void, yaw = 0) {
    const g = this.group(`Story_${id}`, at, yaw);
    build(g);
    g.enabled = false;
    this.structures.set(id, { e: g, at, r });
    return g;
  }

  /** Glowing foundation ring shown until the first stage at a site is built. */
  private marker(id: string, at: Point, radius: number) {
    const g = this.group(`Marker_${id}`, at);
    part(
      g,
      "cylinder",
      [radius * 2, 0.06, radius * 2],
      [0, 0.08, 0],
      this.markerMat,
      [0, 0, 0],
      "Ring",
      false,
    );
    part(
      g,
      "cylinder",
      [radius * 2 - 1.2, 0.07, radius * 2 - 1.2],
      [0, 0.09, 0],
      this.dark,
      [0, 0, 0],
      "Inner",
      false,
    );
    this.markers.set(id, g);
  }

  private crate(parent: pc.Entity, pos: Vec3Tuple, scale = 1) {
    const c = new pc.Entity("EnergyPack");
    c.setLocalPosition(pos[0], pos[1], pos[2]);
    c.setLocalScale(scale, scale, scale);
    part(c, "box", [0.8, 0.5, 0.8], [0, 0.25, 0], this.dark);
    part(c, "box", [0.84, 0.12, 0.84], [0, 0.32, 0], this.packMat);
    part(c, "box", [0.3, 0.08, 0.3], [0, 0.54, 0], this.steel);
    parent.addChild(c);
    return c;
  }

  private lampPost(parent: pc.Entity, pos: Vec3Tuple, h: number, lamp: pc.Material) {
    part(parent, "cylinder", [0.18, h, 0.18], [pos[0], pos[1] + h / 2, pos[2]], this.steel);
    part(parent, "sphere", [0.45, 0.45, 0.45], [pos[0], pos[1] + h + 0.2, pos[2]], lamp);
  }

  // ---------- Chapter 2: Camp Helios ----------
  private buildHelios() {
    const { kit } = this.t;
    MOUTON_MASTS.forEach((p, i) => {
      const at = i === 2 ? { x: p.x + KNOLL_MAST_OFFSET.x, z: p.z + KNOLL_MAST_OFFSET.z } : p;
      const g = this.group(`SurveyMast_${i}`, at, i * 50);
      const lamp = mkMat(1, 0.82, 0.3, { emissive: 2.5 });
      this.mastLamps.push(lamp);
      part(g, "cylinder", [1.6, 0.25, 1.6], [0, 0.12, 0], this.dark);
      part(g, "cylinder", [0.25, 7, 0.25], [0, 3.6, 0], this.white);
      part(
        g,
        "box",
        [1.4, 0.08, 0.9],
        [0, 6.2, 0.2],
        mkMat(0.1, 0.2, 0.45, { metal: 0.8, gloss: 0.85 }),
        [-35, 0, 0],
      );
      part(g, "sphere", [0.8, 0.8, 0.8], [0, 7.4, 0], lamp);
      kit.place("machine_wireless", g, { scale: 2, pos: [1.4, 0, -0.6] });
      this.t.obstacles.push({ x: at.x, z: at.z, r: 1.2 });
    });

    const at = HELIOS_TOWER;
    this.marker("tower", at, 5);
    this.structure("tower_1", at, 4.2, (g) => {
      const standIn = part(g, "box", [9, 0.4, 9], [0, 0.2, 0], this.steel);
      kit.place("platform_large", g, { scale: 4.5, hide: [standIn] });
      kit.place("machine_generatorLarge", g, { scale: 2.2, pos: [2.6, 0.45, -2.4], yaw: 90 });
      for (let i = 0; i < 4; i++) this.towerPacks.push(this.crate(g, [-3 + i * 1.3, 0.45, 3.1]));
    });
    this.structure("tower_2", at, 0, (g) => {
      const standIn = part(g, "box", [1.4, 8.8, 1.4], [0, 4.85, 0], this.white);
      let loaded = 0;
      for (let i = 0; i < 4; i++)
        kit.place("supports_high", g, {
          scale: 2.2,
          pos: [0, 0.45 + i * 2.2, 0],
          onLoad: () => {
            if (++loaded === 4) standIn.enabled = false;
          },
        });
    });
    this.structure("tower_3", at, 0, (g) => {
      const wings = new pc.Entity("SolarWings");
      wings.setLocalPosition(0, 9.6, 0);
      wings.setLocalEulerAngles(0, this.t.sunYaw, 0);
      g.addChild(wings);
      const cells = new pc.StandardMaterial();
      cells.diffuseMap = solarCellTexture(this.t.app.graphicsDevice);
      cells.diffuseMapTiling = new pc.Vec2(2, 3);
      cells.useMetalness = true;
      cells.metalness = 0.6;
      cells.gloss = 0.8;
      cells.update();
      part(wings, "cylinder", [0.35, 11, 0.35], [0, 0, 0], this.steel, [0, 0, 90]);
      for (const x of [-3.1, 3.1]) {
        part(wings, "box", [4.6, 7, 0.18], [x, 0, 0], cells);
        part(wings, "box", [4.8, 0.14, 0.24], [x, 3.55, 0], this.white);
        part(wings, "box", [4.8, 0.14, 0.24], [x, -3.55, 0], this.white);
      }
      part(wings, "sphere", [0.7, 0.7, 0.7], [0, 0, 0], this.glow);
      this.wings = wings;
    });
  }

  // ---------- Chapter 3: Camp Relay ----------
  private buildRelay() {
    const { kit } = this.t;
    const pad = this.group("SummitPad", MALAPERT_ANTENNA);
    const standIn = part(pad, "box", [10, 0.4, 10], [0, 0.2, 0], this.steel);
    kit.place("platform_large", pad, { scale: 5, hide: [standIn] });
    for (const [x, z] of [
      [-4.6, -4.6],
      [4.6, -4.6],
      [-4.6, 4.6],
      [4.6, 4.6],
    ] as [number, number][])
      this.lampPost(pad, [x, 0.5, z], 1.6, this.glow);

    this.structure("antenna_1", MALAPERT_ANTENNA, 2.2, (g) => {
      const cab = part(g, "box", [2.2, 2.2, 2.2], [3.2, 1.6, -2.6], this.white);
      kit.place("structure_closed", g, { scale: 2.4, pos: [3.2, 0.5, -2.6], hide: [cab] });
      part(g, "cylinder", [2.2, 0.5, 2.2], [0, 0.75, 0], this.dark);
      part(g, "cylinder", [1.1, 4.4, 1.1], [0, 3.1, 0], this.white);
      part(g, "cylinder", [1.5, 0.4, 1.5], [0, 5.3, 0], this.steel);
    });
    this.structure("antenna_2", MALAPERT_ANTENNA, 0, (g) => {
      const yawNode = new pc.Entity("DishYaw");
      yawNode.setLocalPosition(0, 5.6, 0);
      g.addChild(yawNode);
      const pitchNode = new pc.Entity("DishPitch");
      yawNode.addChild(pitchNode);
      part(yawNode, "box", [0.6, 1.4, 0.6], [-1.1, 0.4, 0], this.steel);
      part(yawNode, "box", [0.6, 1.4, 0.6], [1.1, 0.4, 0], this.steel);
      // Parabolic reflector (focus 4 m) facing local +Z, with a white rim lip and back shell
      const R = 3.5,
        f = 4,
        bowl = (r: number) => (r * r) / (4 * f);
      const face: [number, number][] = [];
      for (let i = 0; i <= 14; i++) face.push([(R * i) / 14, bowl((R * i) / 14)]);
      const shell: [number, number][] = [
        [R, bowl(R)],
        [R + 0.18, bowl(R)],
        [R + 0.18, bowl(R) - 0.22],
      ];
      for (let i = 12; i >= 0; i--) shell.push([(R * i) / 12, bowl((R * i) / 12) * 0.85 - 0.28]);
      const device = this.t.app.graphicsDevice;
      const dishMat = mkMat(0.78, 0.8, 0.84, { metal: 0.45, gloss: 0.62 });
      meshPart(pitchNode, latheMesh(device, face, 64), [0, 0, -0.4], dishMat, [90, 0, 0], "Dish");
      meshPart(pitchNode, latheMesh(device, shell, 64), [0, 0, -0.4], this.white, [90, 0, 0]);
      part(pitchNode, "cylinder", [1.5, 0.6, 1.5], [0, 0, -0.85], this.steel, [90, 0, 0]);
      for (let k = 0; k < 3; k++) {
        const spoke = new pc.Entity("FeedStrut");
        spoke.setLocalEulerAngles(0, 0, 90 + k * 120);
        pitchNode.addChild(spoke);
        const rr = R * 0.92,
          z0 = -0.4 + bowl(rr),
          z1 = 3.7;
        const tilt = new pc.Entity();
        tilt.setLocalPosition(rr / 2, 0, (z0 + z1) / 2);
        tilt.setLocalEulerAngles(0, (-Math.atan2(rr, z1 - z0) * 180) / Math.PI, 0);
        spoke.addChild(tilt);
        part(
          tilt,
          "cylinder",
          [0.09, Math.hypot(rr, z1 - z0), 0.09],
          [0, 0, 0],
          this.steel,
          [90, 0, 0],
        );
      }
      part(pitchNode, "box", [0.55, 0.55, 0.7], [0, 0, 3.8], this.dark);
      part(pitchNode, "sphere", [0.3, 0.3, 0.3], [0, 0, 4.2], this.glow);
      const beamMat = mkMat(0.55, 0.85, 1, {
        emissive: 2.5,
        opacity: 0.45,
        additive: true,
        fog: false,
      });
      this.beam = part(
        pitchNode,
        "cylinder",
        [0.5, 700, 0.5],
        [0, 0, 354],
        beamMat,
        [90, 0, 0],
        "EarthBeam",
        false,
      );
      this.beam.enabled = false;
      this.beamMat = beamMat;
      const rayMat = mkMat(1, 0.4, 0.3, { emissive: 2, opacity: 0.35, additive: true, fog: false });
      this.aimRay = part(
        pitchNode,
        "cylinder",
        [0.18, 140, 0.18],
        [0, 0, 74],
        rayMat,
        [90, 0, 0],
        "AimRay",
        false,
      );
      this.aimRay.enabled = false;
      this.aimRayMat = rayMat;
      this.dishYaw = yawNode;
      this.dishPitch = pitchNode;
    });

    this.marker("relay", RELAY_STATION, 4.5);
    this.structure("relay", RELAY_STATION, 3.4, (g) => {
      const hut = part(g, "box", [6, 3, 6], [0, 1.5, 0], this.white);
      kit.place("hangar_smallA", g, { scale: 3, hide: [hut] });
      kit.place("satelliteDish_detailed", g, { scale: 3.2, pos: [3.9, 0, 2.6], yaw: 200 });
      kit.place("chimney_detailed", g, { scale: 2.6, pos: [-3.6, 0, -2.4] });
      this.lampPost(g, [-3.6, 0, 3.4], 2.4, this.glow);
    });
  }

  // ---------- Chapter 4: Camp Horizon ----------
  private buildHorizon() {
    const { kit } = this.t;
    this.marker("survey", CABEUS_OVERLOOK, 4);
    this.structure("survey_station", CABEUS_OVERLOOK, 2.8, (g) => {
      const hut = part(g, "box", [4.4, 2.4, 4.4], [0, 1.2, 0], this.white);
      kit.place("hangar_smallB", g, { scale: 2.6, hide: [hut], yaw: 180 });
      kit.place("satelliteDish", g, { scale: 2.4, pos: [-3, 0, 1.6], yaw: 180 });
      for (const a of [0, 120, 240]) {
        const r = (a * Math.PI) / 180;
        part(
          g,
          "cylinder",
          [0.08, 1.6, 0.08],
          [3 + Math.cos(r) * 0.4, 0.75, 2 + Math.sin(r) * 0.4],
          this.steel,
          [Math.sin(r) * 14, 0, -Math.cos(r) * 14],
        );
      }
      part(g, "cylinder", [0.35, 0.9, 0.35], [3, 1.7, 2], this.dark, [60, 0, 0]);
      this.lampPost(g, [-2.6, 0, -2.6], 2.2, this.glow);
    });

    this.marker("radar", CABEUS_RADAR, 4);
    this.structure("radar", CABEUS_RADAR, 2.4, (g) => {
      const box = part(g, "box", [2.2, 1.8, 1.6], [0, 0.9, 0], this.white);
      kit.place("machine_wireless", g, { scale: 3, hide: [box] });
      kit.place("satelliteDish_detailed", g, { scale: 2.6, pos: [2.6, 0, 0.4], yaw: 160 });
      // Sweep ring rebuilt each frame so it hugs the sloping crater rim instead of slicing into it
      const segs = 128;
      const positions = new Float32Array(segs * 2 * 3);
      const normals = new Float32Array(segs * 2 * 3);
      for (let k = 1; k < normals.length; k += 3) normals[k] = 1;
      const indices: number[] = [];
      for (let j = 0; j < segs; j++) {
        const a = j * 2,
          b = ((j + 1) % segs) * 2;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const mesh = new pc.Mesh(this.t.app.graphicsDevice);
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      mesh.setIndices(indices);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      const pulseMat = mkMat(0.75, 0.6, 1, { emissive: 2.4, opacity: 0.5, additive: true });
      pulseMat.cull = pc.CULLFACE_NONE;
      pulseMat.update();
      const ring = new pc.Entity("RadarPulse");
      ring.addComponent("render", {
        meshInstances: [new pc.MeshInstance(mesh, pulseMat)],
        castShadows: false,
        receiveShadows: false,
      });
      g.addChild(ring);
      this.radarPulse = { mesh, positions, mat: pulseMat };
    });

    const bay = this.group("UpgradeBay", UPGRADE_BAY, 90);
    const slab = part(bay, "box", [10, 0.3, 10], [0, 0.15, 0], this.steel);
    kit.place("platform_large", bay, { scale: 5, hide: [slab] });
    const bayMat = mkMat(this.t.accent.r, this.t.accent.g, this.t.accent.b, { emissive: 2 });
    this.bayMat = bayMat;
    part(
      bay,
      "cylinder",
      [9.2, 0.06, 9.2],
      [0, 0.55, 0],
      mkMat(this.t.accent.r, this.t.accent.g, this.t.accent.b, { emissive: 1.2, opacity: 0.3 }),
      [0, 0, 0],
      "BayRing",
      false,
    );
    for (const x of [-6, 6]) {
      part(bay, "box", [0.6, 5.2, 0.6], [x, 2.6, 0], this.white);
      part(bay, "box", [0.7, 0.3, 0.7], [x, 5.3, 0], bayMat);
      const p = bay.getWorldTransform().transformPoint(new pc.Vec3(x, 0, 0));
      this.t.obstacles.push({ x: p.x, z: p.z, r: 0.7 });
    }
    part(bay, "box", [12.6, 0.5, 0.6], [0, 5.6, 0], this.white);
    for (const x of [-3, 0, 3]) part(bay, "box", [0.8, 0.2, 0.4], [x, 5.3, 0], bayMat);
    kit.place("machine_generatorLarge", bay, { scale: 2, pos: [0, 0, -6.6] });
  }

  private buildHopper() {
    const { kit } = this.t;
    const padGroup = this.group("CargoPad", CARGO_PAD);
    const slab = part(padGroup, "box", [8, 0.3, 8], [0, 0.15, 0], this.steel);
    kit.place("platform_large", padGroup, { scale: 4, hide: [slab] });
    for (const [x, z] of [
      [-3.6, -3.6],
      [3.6, -3.6],
      [-3.6, 3.6],
      [3.6, 3.6],
    ] as [number, number][])
      part(padGroup, "box", [0.5, 0.12, 0.5], [x, 0.46, z], this.glow);

    const hopper = new pc.Entity("CargoHopper");
    hopper.setLocalPosition(0, 0.4, 0);
    padGroup.addChild(hopper);
    const body = part(hopper, "cylinder", [3, 8, 3], [0, 4, 0], this.white);
    const nose = part(hopper, "cone", [3, 2.4, 3], [0, 9.2, 0], this.white);
    const k = HOPPER_SCALE;
    const stack: [Parameters<ModelKit["place"]>[0], number][] = [
      ["rocket_baseA", 0],
      ["rocket_sidesA", 1.6],
      ["rocket_fuelA", 2.6],
      ["rocket_topA", 3.1],
    ];
    let loaded = 0;
    for (const [name, y] of stack)
      kit.place(name, hopper, {
        scale: k,
        pos: [0, y * k, 0],
        onLoad: () => {
          if (++loaded === stack.length) {
            body.enabled = false;
            nose.enabled = false;
          }
        },
      });
    const flameMat = mkMat(1, 0.62, 0.25, {
      emissive: 4,
      opacity: 0.85,
      additive: true,
      fog: false,
    });
    this.flame = part(
      hopper,
      "cone",
      [1.8, 5, 1.8],
      [0, -2.2, 0],
      flameMat,
      [180, 0, 0],
      "Flame",
      false,
    );
    this.flame.enabled = false;
    const fl = new pc.Entity("FlameLight");
    fl.addComponent("light", {
      type: "omni",
      color: new pc.Color(1, 0.65, 0.3),
      intensity: 4,
      range: 40,
      castShadows: false,
    });
    fl.setLocalPosition(0, -1.5, 0);
    fl.enabled = false;
    hopper.addChild(fl);
    this.flameLight = fl;
    this.hopper = hopper;
    this.t.obstacles.push({ x: CARGO_PAD.x, z: CARGO_PAD.z, r: 3.2 });

    for (let i = 0; i < STORY.PACK_TOTAL; i++) {
      const a = (i / STORY.PACK_TOTAL) * Math.PI * 2 + Math.PI / 4;
      this.padPacks.push(this.crate(padGroup, [Math.cos(a) * 3.1, 0.4, Math.sin(a) * 3.1]));
    }
    for (const [x, z] of [
      [-2.4, 3],
      [2.4, -3],
    ] as [number, number][]) {
      const b = new pc.Entity("WaterBarrels");
      b.setLocalPosition(x, 0.4, z);
      padGroup.addChild(b);
      kit.place("barrels", b, { scale: 1.8 });
      this.padBarrels.push(b);
    }

    const toPad = Math.atan2(CARGO_PAD.x - CARGO_CONSOLE.x, CARGO_PAD.z - CARGO_CONSOLE.z);
    const con = this.group("HopperConsole", CARGO_CONSOLE, (toPad * 180) / Math.PI);
    part(con, "box", [1.3, 1.3, 0.7], [0, 0.65, 0], this.white);
    part(con, "box", [1.1, 0.6, 0.1], [0, 1.25, 0.36], this.glow, [-25, 0, 0]);
    kit.place("machine_wireless", con, { scale: 1.5, pos: [1.5, 0, -0.3] });
    this.t.obstacles.push({ x: CARGO_CONSOLE.x, z: CARGO_CONSOLE.z, r: 0.8 });
  }

  private buildRoverCargo(rover: pc.Entity) {
    for (const x of [-0.55, 0.55]) {
      const c = this.crate(rover, [x, 1.36, -1.5], 0.9);
      c.enabled = false;
      this.roverCargo.push(c);
    }
    if (this.def.id !== "chapter4") return;
    const bar = new pc.Entity("RoverLightBar");
    rover.addChild(bar);
    part(bar, "box", [2.2, 0.18, 0.25], [0, 2.25, 1.2], this.dark);
    for (const x of [-0.8, -0.27, 0.27, 0.8])
      part(bar, "box", [0.4, 0.14, 0.06], [x, 2.25, 1.34], mkMat(1, 1, 0.95, { emissive: 3 }));
    bar.enabled = false;
    this.lightBar = bar;
    const lamps = new pc.Entity("RoverLamps");
    const head = new pc.Entity("RoverHeadlight");
    head.addComponent("light", {
      type: "spot",
      color: new pc.Color(1, 0.97, 0.9),
      intensity: 8,
      range: 80,
      innerConeAngle: 20,
      outerConeAngle: 50,
      castShadows: false,
      affectLightmapped: true,
    });
    head.setLocalPosition(0, 2.2, 1.6);
    head.setLocalEulerAngles(-78, 0, 0);
    lamps.addChild(head);
    // Soft work light so the rover and the ground right around it stay readable in the dark
    const work = new pc.Entity("RoverWorkLight");
    work.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.9, 0.95, 1),
      intensity: 2.6,
      range: 20,
      castShadows: false,
      affectLightmapped: true,
    });
    // High overhead so it falls steeply; low grazing light makes the regolith glitter
    work.setLocalPosition(0, 8, 0);
    lamps.addChild(work);
    lamps.enabled = false;
    rover.addChild(lamps);
    this.headlight = lamps;
  }

  /** Syncs props to story state; dark = how deep in permanent shadow the player is (0–1). */
  update(story: StoryState, dt: number, dark: number) {
    this.time += dt;
    const initial = this.seen.size === 0 && this.time <= dt;
    for (const [id, s] of this.structures) {
      const on = story.built.includes(id);
      if (s.e.enabled !== on) s.e.enabled = on;
      if (on && !this.seen.has(id)) {
        this.seen.add(id);
        if (s.r > 0) this.t.obstacles.push({ id: `story_${id}`, x: s.at.x, z: s.at.z, r: s.r });
        if (!initial) {
          const p = s.e.getPosition();
          this.t.puff(p.x, p.y + 0.5, p.z, 16, 2.2);
        }
      }
    }
    const firstStage: Record<string, string> = {
      tower: "tower_1",
      relay: "relay",
      survey: "survey_station",
      radar: "radar",
    };
    for (const [id, m] of this.markers) m.enabled = !story.built.includes(firstStage[id] ?? id);

    this.mastLamps.forEach((m, i) => {
      const done = story.surveyed.includes(i);
      const pulse = done ? 1 : 0.6 + 0.4 * Math.sin(this.time * 4 + i);
      m.emissive.set(done ? 0.3 : 1 * pulse, done ? 1 : 0.8 * pulse, done ? 0.45 : 0.25 * pulse);
      m.update();
    });

    const ready = packsReady(story);
    this.towerPacks.forEach((c, i) => (c.enabled = i < ready));
    this.roverCargo.forEach((c, i) => (c.enabled = i < story.packsCarried));
    const launching = story.launchTimer >= 0;
    this.padPacks.forEach((c, i) => (c.enabled = !launching && i < story.packsLoaded));
    const refined = this.def.id === "chapter4" && story.stepIndex >= this.def.steps.length - 1;
    this.padBarrels.forEach((b) => (b.enabled = refined && !launching));

    if (this.hopper) {
      if (launching) {
        const lt = story.launchTimer;
        const rise = 2.2 * lt * lt;
        const shake = lt < 1.2 ? (Math.random() - 0.5) * 0.12 : 0;
        this.hopper.setLocalPosition(shake, 0.4 + rise, shake);
        if (!this.launchStarted) {
          this.launchStarted = true;
          this.t.puff(
            CARGO_PAD.x,
            this.t.height(CARGO_PAD.x, CARGO_PAD.z) + 0.5,
            CARGO_PAD.z,
            40,
            4,
          );
        }
        if (lt < 2.5 && Math.random() < 0.6)
          this.t.puff(
            CARGO_PAD.x,
            this.t.height(CARGO_PAD.x, CARGO_PAD.z) + 0.4,
            CARGO_PAD.z,
            4,
            3,
          );
        const flicker = 0.85 + Math.random() * 0.3;
        if (this.flame) {
          this.flame.enabled = true;
          this.flame.setLocalScale(1.8 * flicker, 5 + rise * 0.02, 1.8 * flicker);
        }
        if (this.flameLight) {
          this.flameLight.enabled = true;
          this.flameLight.light!.intensity = 4 * flicker;
        }
      } else {
        this.hopper.setLocalPosition(0, 0.4, 0);
        if (this.flame) this.flame.enabled = false;
        if (this.flameLight) this.flameLight.enabled = false;
      }
    }

    if (this.wings)
      this.wings.setLocalEulerAngles(0, this.t.sunYaw + Math.sin(this.time * 0.3) * 4, 0);

    if (this.dishYaw && this.dishPitch) {
      const e = EARTH_DIRECTION.malapert;
      const yaw = story.linkLocked ? e.yaw : story.aimYaw;
      const pitch = story.linkLocked ? e.pitch : story.aimPitch;
      this.dishYaw.setLocalEulerAngles(0, (yaw * 180) / Math.PI, 0);
      this.dishPitch.setLocalEulerAngles((-pitch * 180) / Math.PI, 0, 0);
      if (this.beam && this.beamMat) {
        this.beam.enabled = story.linkLocked;
        this.beamMat.opacity = 0.3 + 0.15 * Math.sin(this.time * 3);
        this.beamMat.update();
      }
      if (this.aimRay && this.aimRayMat) {
        this.aimRay.enabled = story.aiming;
        if (story.aiming) {
          const s = antennaSignal(story.aimYaw, story.aimPitch, e.yaw, e.pitch) / 100;
          this.aimRayMat.emissive.set(1 - s, 0.35 + 0.6 * s, 0.3 + 0.2 * s);
          this.aimRayMat.update();
        }
      }
    }

    if (this.radarPulse && this.structures.get("radar")?.e.enabled) {
      const { mesh, positions, mat } = this.radarPulse;
      const p = (this.time % 4) / 4;
      const r = 2 + p * 70,
        w = 0.25 + p * 0.45;
      const at = CABEUS_RADAR,
        y0 = this.t.height(at.x, at.z);
      const segs = positions.length / 6;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a);
        for (let side = 0; side < 2; side++) {
          const rr = r + (side ? w : -w),
            x = c * rr,
            z = s * rr,
            k = (j * 2 + side) * 3;
          positions[k] = x;
          positions[k + 1] = this.t.height(at.x + x, at.z + z) - y0 + 0.3;
          positions[k + 2] = z;
        }
      }
      mesh.setPositions(positions);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      mat.opacity = 0.32 * (1 - p) ** 1.5;
      mat.update();
    }

    if (this.bayMat) {
      const done = story.roverUpgraded;
      const pulse = done ? 1 : 0.55 + 0.45 * Math.sin(this.time * 3);
      const a = this.t.accent;
      this.bayMat.emissive.set(
        done ? 0.3 : a.r * pulse,
        done ? 1 : a.g * pulse,
        done ? 0.5 : a.b * pulse,
      );
      this.bayMat.update();
    }
    if (this.lightBar) this.lightBar.enabled = story.roverUpgraded;
    if (this.headlight) this.headlight.enabled = story.roverUpgraded && dark > 0.05;
  }

  /** Camera look-at override for scripted moments (the hopper launch). */
  cameraFocus(story: StoryState): pc.Vec3 | null {
    if (!this.hopper || story.launchTimer < 0) return null;
    return this.hopper
      .getPosition()
      .clone()
      .add(new pc.Vec3(0, 6, 0));
  }

  /** World-space pivot of the summit dish, used by the aim camera. */
  dishPivot(): pc.Vec3 {
    const h = this.t.height(MALAPERT_ANTENNA.x, MALAPERT_ANTENNA.z);
    return new pc.Vec3(MALAPERT_ANTENNA.x, h + 5.6, MALAPERT_ANTENNA.z);
  }
}
