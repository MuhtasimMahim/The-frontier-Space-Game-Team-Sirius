// Shared PlayCanvas helpers: materials, primitives, procedural textures, and the Kenney model kit.
import * as pc from "playcanvas";

export type Vec3Tuple = [number, number, number];
export type PrimitiveShape = "box" | "capsule" | "cone" | "cylinder" | "sphere" | "plane" | "torus";

export interface MatOpts {
  metal?: number;
  gloss?: number;
  emissive?: number;
  opacity?: number;
  additive?: boolean;
  fog?: boolean;
}

export function mkMat(r: number, g: number, b: number, o: MatOpts = {}) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(r, g, b);
  m.useMetalness = true;
  m.metalness = o.metal ?? 0.1;
  m.gloss = o.gloss ?? 0.4;
  if (o.emissive) {
    m.emissive = new pc.Color(r, g, b);
    m.emissiveIntensity = o.emissive;
  }
  if (o.opacity !== undefined) {
    m.opacity = o.opacity;
    m.blendType = o.additive ? pc.BLEND_ADDITIVEALPHA : pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  if (o.fog === false) m.useFog = false;
  m.update();
  return m;
}

export function part(
  parent: pc.Entity,
  type: PrimitiveShape,
  scale: Vec3Tuple,
  pos: Vec3Tuple,
  mat: pc.Material,
  rot: Vec3Tuple = [0, 0, 0],
  name = "Part",
  shadows = true,
) {
  const e = new pc.Entity(name);
  // Glows, beams and halos are see-through light, so they never cast shadows
  const solid = mat.blendType === pc.BLEND_NONE;
  e.addComponent("render", { type, castShadows: shadows && solid, receiveShadows: solid });
  e.render!.material = mat;
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
  parent.addChild(e);
  return e;
}

/**
 * Smooth solid of revolution around +Y from (radius, height) points. Faces point up while the
 * radius grows and outward/down while it shrinks, so a closed shell needs no culling tricks.
 */
export function latheMesh(device: pc.GraphicsDevice, profile: [number, number][], segs = 48) {
  const rows = profile.length;
  const positions = new Float32Array(rows * segs * 3);
  for (let i = 0; i < rows; i++) {
    const [r, y] = profile[i]!;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2,
        k = (i * segs + j) * 3;
      positions[k] = Math.cos(a) * r;
      positions[k + 1] = y;
      positions[k + 2] = Math.sin(a) * r;
    }
  }
  const idx = (i: number, j: number) => i * segs + (j % segs);
  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < segs; j++)
      indices.push(
        idx(i, j),
        idx(i, j + 1),
        idx(i + 1, j),
        idx(i, j + 1),
        idx(i + 1, j + 1),
        idx(i + 1, j),
      );
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(pc.calculateNormals(positions, indices));
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/**
 * Disc draped over the ground around (cx, cz), in local coords of an entity standing at the ground
 * there. Vertex alpha fades to 0 at the rim (pair with opacityVertexColor for a soft edge).
 */
export function groundPatchMesh(
  device: pc.GraphicsDevice,
  height: (x: number, z: number) => number,
  cx: number,
  cz: number,
  radius: number,
  lift = 0.08,
  rings = 6,
  segs = 32,
) {
  const y0 = height(cx, cz);
  const n = 1 + rings * segs;
  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 4).fill(255);
  positions[1] = lift;
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2,
        v = 1 + (i - 1) * segs + j,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      positions[v * 3] = x;
      positions[v * 3 + 1] = height(cx + x, cz + z) - y0 + lift;
      positions[v * 3 + 2] = z;
      colors[v * 4 + 3] = Math.round(255 * (1 - (i / rings) ** 2));
    }
  }
  const idx = (i: number, j: number) => 1 + i * segs + (j % segs);
  const indices: number[] = [];
  for (let j = 0; j < segs; j++) indices.push(0, idx(0, j + 1), idx(0, j));
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segs; j++)
      indices.push(
        idx(i, j),
        idx(i, j + 1),
        idx(i + 1, j),
        idx(i, j + 1),
        idx(i + 1, j + 1),
        idx(i + 1, j),
      );
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(pc.calculateNormals(positions, indices));
  mesh.setColors32(colors);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/** Like part(), for a custom mesh. */
export function meshPart(
  parent: pc.Entity,
  mesh: pc.Mesh,
  pos: Vec3Tuple,
  mat: pc.Material,
  rot: Vec3Tuple = [0, 0, 0],
  name = "Part",
) {
  const e = new pc.Entity(name);
  e.addComponent("render", {
    meshInstances: [new pc.MeshInstance(mesh, mat)],
    castShadows: true,
    receiveShadows: true,
  });
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
  parent.addChild(e);
  return e;
}

export function canvasTexture(
  device: pc.GraphicsDevice,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  opts: { repeat?: boolean; height?: number } = {},
) {
  const repeat = opts.repeat ?? true;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = opts.height ?? size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new pc.Texture(device, {
    width: canvas.width,
    height: canvas.height,
    format: pc.PIXELFORMAT_SRGBA8,
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

/** Blue photovoltaic cells with silver bus lines, used by every solar panel and wing. */
export function solarCellTexture(device: pc.GraphicsDevice) {
  return canvasTexture(device, 256, (ctx, n) => {
    ctx.fillStyle = "#0b1a3c";
    ctx.fillRect(0, 0, n, n);
    const cell = n / 8;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const g = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
        g.addColorStop(0, "#1d3f86");
        g.addColorStop(1, "#0f2556");
        ctx.fillStyle = g;
        ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
    ctx.strokeStyle = "rgba(200,210,230,0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, n);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(n, i * cell);
      ctx.stroke();
    }
  });
}

/** Loads an image as a texture asset (sRGB for colour maps, linear for normal / roughness). */
export function loadTexture(
  app: pc.Application,
  url: string,
  srgb: boolean,
  onLoad: (tex: pc.Texture) => void,
) {
  const asset = new pc.Asset(url, "texture", { url }, { srgb });
  asset.ready(() => {
    const tex = asset.resource as pc.Texture | undefined;
    if (!tex) return;
    tex.anisotropy = 8;
    tex.addressU = pc.ADDRESS_REPEAT;
    tex.addressV = pc.ADDRESS_REPEAT;
    onLoad(tex);
  });
  asset.on("error", (err: unknown) => console.warn("Texture failed", url, err));
  app.assets.add(asset);
  app.assets.load(asset);
}

/**
 * Loads a colour texture as neutral grey with boosted contrast, so per-site tints and sunlight
 * alone decide the ground colour (the CC0 regolith scan is warm brown and very flat).
 */
export function loadGreyTexture(
  app: pc.Application,
  url: string,
  contrast: number,
  onLoad: (tex: pc.Texture) => void,
) {
  const img = new Image();
  img.onload = () => {
    const device = app.graphicsDevice;
    if (!device) return;
    const tex = canvasTexture(
      device,
      img.width,
      (ctx) => {
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height);
        const p = data.data;
        let mean = 0;
        for (let i = 0; i < p.length; i += 4)
          mean += p[i]! * 0.299 + p[i + 1]! * 0.587 + p[i + 2]! * 0.114;
        mean /= p.length / 4;
        for (let i = 0; i < p.length; i += 4) {
          const l = p[i]! * 0.299 + p[i + 1]! * 0.587 + p[i + 2]! * 0.114;
          p[i] = p[i + 1] = p[i + 2] = mean + (l - mean) * contrast;
        }
        ctx.putImageData(data, 0, 0);
      },
      { height: img.height },
    );
    onLoad(tex);
  };
  img.onerror = () => console.warn("Texture failed", url);
  img.src = url;
}

/** CC0 Kenney Space Kit models served from public/models. */
export type KitModel =
  | "hangar_roundA"
  | "hangar_roundGlass"
  | "hangar_largeA"
  | "hangar_largeB"
  | "hangar_smallA"
  | "hangar_smallB"
  | "machine_barrelLarge"
  | "machine_barrel"
  | "machine_wireless"
  | "machine_generatorLarge"
  | "barrels"
  | "satelliteDish"
  | "satelliteDish_large"
  | "satelliteDish_detailed"
  | "chimney_detailed"
  | "rocket_baseA"
  | "rocket_sidesA"
  | "rocket_fuelA"
  | "rocket_topA"
  | "supports_high"
  | "platform_large"
  | "platform_high"
  | "structure_detailed"
  | "structure_closed"
  | "gate_complex"
  | "rock_largeA"
  | "rock_largeB"
  | "rocks_smallA"
  | "rocks_smallB"
  | "meteor_detailed"
  | "rock_crystalsLargeA"
  | "rock_crystalsLargeB"
  | "craterLarge"
  | "crater";

export interface KitOpts {
  /** Multiplier on native size (Kenney tiles are ~1 unit), so stacked parts line up. */
  scale?: number;
  /** Or fit the largest horizontal side to this many metres. */
  size?: number;
  pos?: Vec3Tuple;
  yaw?: number;
  /** Replaces the kit's orange trim. */
  accent?: pc.Color;
  /** Stand-ins hidden once the model is in place (so the scene stays playable if a model fails). */
  hide?: pc.Entity[];
  shadows?: boolean;
  onLoad?: () => void;
}

/** Recolours Kenney's cartoon palette into white panels, dark metal, and grey regolith. */
const PALETTE: Record<string, (accent: pc.Color) => pc.StandardMaterial> = {
  metal: () => mkMat(0.82, 0.84, 0.88, { metal: 0.35, gloss: 0.55 }),
  metalDark: () => mkMat(0.3, 0.32, 0.36, { metal: 0.6, gloss: 0.5 }),
  dark: () => mkMat(0.12, 0.12, 0.14, { metal: 0.2, gloss: 0.35 }),
  metalRed: (a) => {
    const m = mkMat(a.r, a.g, a.b, { metal: 0.3, gloss: 0.5 });
    m.emissive = new pc.Color(a.r * 0.18, a.g * 0.18, a.b * 0.18);
    m.update();
    return m;
  },
  rock: () => mkMat(0.46, 0.46, 0.47, { metal: 0, gloss: 0.12 }),
  rockTrack: () => mkMat(0.38, 0.38, 0.39, { metal: 0, gloss: 0.12 }),
  rockDark: () => mkMat(0.28, 0.28, 0.3, { metal: 0, gloss: 0.12 }),
  crystal: () => {
    const m = mkMat(0.6, 0.88, 1, { metal: 0.1, gloss: 0.9, opacity: 0.92 });
    m.depthWrite = true;
    m.emissive = new pc.Color(0.25, 0.6, 1);
    m.emissiveIntensity = 1.4;
    m.update();
    return m;
  },
  _defaultMat: () => mkMat(0.82, 0.9, 1, { metal: 0.2, gloss: 0.8, emissive: 0.35 }),
  greenhouseGlass: () => {
    const m = mkMat(0.14, 0.2, 0.19, { metal: 0.55, gloss: 0.95 });
    m.emissive = new pc.Color(0.35, 0.75, 0.45);
    m.emissiveIntensity = 0.2;
    m.update();
    return m;
  },
};

/** Per-model palette swaps, e.g. the greenhouse's window panes glow with grow lamps instead of reading as dark windows. */
const MODEL_REMAP: Partial<Record<KitModel, Record<string, string>>> = {
  hangar_roundGlass: { dark: "greenhouseGlass" },
};

export class ModelKit {
  public loaded = 0;
  public total = 0;
  private cache = new Map<KitModel, Promise<pc.Asset | null>>();
  private mats = new Map<string, pc.StandardMaterial>();

  constructor(
    private app: pc.Application,
    private isDead: () => boolean,
    private castShadows: () => boolean,
    private defaultAccent: pc.Color,
  ) {}

  private load(name: KitModel) {
    let p = this.cache.get(name);
    if (!p) {
      this.total++;
      p = new Promise((resolve) => {
        this.app.assets.loadFromUrl(`/models/${name}.glb`, "container", (err, asset) => {
          this.loaded++;
          if (err || !asset) {
            console.warn("Model failed", name, err);
            resolve(null);
          } else resolve(asset);
        });
      });
      this.cache.set(name, p);
    }
    return p;
  }

  private material(name: string, accent: pc.Color) {
    const make = PALETTE[name];
    if (!make) return null;
    const key = name === "metalRed" ? `${name}:${accent.toString(false)}` : name;
    let m = this.mats.get(key);
    if (!m) {
      m = make(accent);
      this.mats.set(key, m);
    }
    return m;
  }

  /** Places a model under parent and returns its holder right away; the mesh arrives when loaded. */
  place(name: KitModel, parent: pc.Entity, o: KitOpts = {}) {
    const holder = new pc.Entity(`Kit_${name}`);
    const p = o.pos ?? [0, 0, 0];
    holder.setLocalPosition(p[0], p[1], p[2]);
    holder.setLocalEulerAngles(0, o.yaw ?? 0, 0);
    parent.addChild(holder);
    void this.load(name).then((asset) => {
      if (!asset || this.isDead() || !holder.parent) return;
      const resource = asset.resource as pc.ContainerResource;
      const shadows = o.shadows ?? this.castShadows();
      const e = resource.instantiateRenderEntity({ castShadows: shadows, receiveShadows: true });
      e.setPosition(0, 0, 0);
      e.syncHierarchy();
      const aabb = new pc.BoundingBox();
      let first = true;
      const accent = o.accent ?? this.defaultAccent;
      const remap = MODEL_REMAP[name] ?? {};
      for (const r of e.findComponents("render") as pc.RenderComponent[]) {
        for (const mi of r.meshInstances) {
          if (first) aabb.copy(mi.aabb);
          else aabb.add(mi.aabb);
          first = false;
          const raw = mi.material?.name ?? "";
          const m = this.material(remap[raw] ?? raw, accent);
          if (m) mi.material = m;
        }
      }
      const ext = aabb.halfExtents;
      const k = o.size ? o.size / (2 * Math.max(ext.x, ext.z, 0.001)) : (o.scale ?? 1);
      const inner = new pc.Entity("KitScale");
      inner.setLocalScale(k, k, k);
      e.setLocalPosition(-aabb.center.x, -(aabb.center.y - ext.y), -aabb.center.z);
      inner.addChild(e);
      holder.addChild(inner);
      (o.hide ?? []).forEach((h) => (h.enabled = false));
      o.onLoad?.();
    });
    return holder;
  }
}
