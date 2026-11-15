// Per-site terrain mesh, lighting, and sky (stars, Milky Way, Sun, Earth) for the PlayCanvas world.
import * as pc from "playcanvas";
import { canvasTexture, loadGreyTexture, loadTexture, mkMat } from "./sceneKit";
import { EARTH_DIRECTION, type SiteKey, type SiteTerrain } from "./sites";

export interface SiteLook {
  /** Light entity pitch (90° − sun elevation) and yaw (sun azimuth, 0 = +Z). */
  sunPitch: number;
  sunYaw: number;
  sunIntensity: number;
  sunColor: [number, number, number];
  ambient: [number, number, number];
  fill: number;
  ground: [number, number, number];
}

export const SITE_LOOK: Record<SiteKey, SiteLook> = {
  nobile: {
    sunPitch: 38,
    sunYaw: 55,
    sunIntensity: 2.4,
    sunColor: [1, 0.98, 0.95],
    ambient: [0.22, 0.23, 0.27],
    fill: 0.6,
    ground: [0.7, 0.7, 0.72],
  },
  mouton: {
    sunPitch: 70,
    sunYaw: -40,
    sunIntensity: 2.7,
    sunColor: [1, 0.97, 0.92],
    ambient: [0.24, 0.24, 0.28],
    fill: 0.55,
    ground: [0.74, 0.73, 0.72],
  },
  malapert: {
    sunPitch: 72,
    sunYaw: 60,
    sunIntensity: 2.6,
    sunColor: [1, 0.98, 0.95],
    ambient: [0.23, 0.24, 0.29],
    fill: 0.55,
    ground: [0.68, 0.69, 0.72],
  },
  cabeus: {
    sunPitch: 76,
    sunYaw: -50,
    sunIntensity: 2.8,
    sunColor: [1, 0.96, 0.9],
    ambient: [0.2, 0.21, 0.26],
    fill: 0.45,
    ground: [0.66, 0.67, 0.7],
  },
};

/** Physics stops here; the mesh keeps going so the horizon never shows an edge. */
export const PLAY_RADIUS = 540;
const RIM_R = 590;
const HORIZON_R = 1800;

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Ground height for drawing: exact inside the play area, distant highlands or lowlands beyond. */
export function renderHeight(t: SiteTerrain, x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d <= RIM_R) return t.height(x, z);
  const a = Math.atan2(z, x);
  const rim = t.height(Math.cos(a) * RIM_R, Math.sin(a) * RIM_R);
  let far: number;
  if (t.key === "mouton") {
    // Looking down off the mesa onto rolling lowlands, with distant massifs on the horizon
    far = -150 + 10 * Math.sin(a * 6 + d * 0.01) + 6 * Math.sin(a * 17);
    for (const m of t.mountains) {
      const dm = Math.hypot(x - m.x, z - m.z);
      if (dm < m.w) far = Math.max(far, -150 + m.h * (1 - (dm / m.w) ** 2) ** 2);
    }
    const ridge =
      40 + 45 * Math.sin(a * 3 + 0.4) + 25 * Math.sin(a * 7 + 1.1) + 12 * Math.sin(a * 13);
    far = Math.max(far, -150 + (ridge + 150) * smooth((d - 1100) / 500));
  } else {
    far =
      70 +
      40 * Math.sin(a * 5 + 1) +
      22 * Math.sin(a * 11 + 2) +
      10 * Math.sin(a * 23 + d * 0.004) +
      (d - RIM_R) * 0.03;
  }
  return rim + (far - rim) * smooth((d - RIM_R) / 300);
}

function albedo(t: SiteTerrain, x: number, z: number, ny: number) {
  let c =
    0.82 +
    0.16 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) +
    0.07 * Math.sin(x * 0.037 + z * 0.029) +
    0.05 * Math.sin(x * 0.083 - z * 0.071);
  // Fresh regolith shows on steep slopes
  c *= 1 + (1 - ny) * 0.5;
  return Math.max(0, Math.min(1, c));
}

/**
 * Light mask for ground the Sun never reaches: only lamps flagged affectLightmapped light it, so
 * a permanently shadowed crater stays dark from the rim yet lights up normally under headlights.
 */
export const SUNLESS_MASK = pc.MASK_AFFECT_LIGHTMAPPED;

/** Polar grid: fine rings around camp, coarse rings out to the horizon. */
export function buildTerrain(app: pc.Application, t: SiteTerrain, look: SiteLook, low: boolean) {
  const segs = low ? 256 : 512;
  const radii: number[] = [];
  for (let r = 0; r < HORIZON_R;) {
    let step = r < 420 ? Math.min(4.8, 1.2 + r * 0.012) : r < 620 ? 4.8 : 4.8 + (r - 620) * 0.06;
    if (low) step *= 1.35;
    r = Math.min(HORIZON_R, r + step);
    radii.push(r);
  }
  const rings = radii.length;
  const n = 1 + rings * segs;
  const positions = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  positions[1] = t.height(0, 0);
  let v = 1;
  for (let i = 0; i < rings; i++) {
    const r = radii[i]!;
    for (let j = 0; j < segs; j++, v++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      positions[v * 3] = x;
      positions[v * 3 + 1] = renderHeight(t, x, z);
      positions[v * 3 + 2] = z;
      uvs[v * 2] = x;
      uvs[v * 2 + 1] = z;
    }
  }
  const idx = (i: number, j: number) => 1 + i * segs + (j % segs);
  const indices: number[] = [];
  for (let j = 0; j < segs; j++) indices.push(0, idx(0, j + 1), idx(0, j));
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segs; j++) {
      const p00 = idx(i, j),
        p01 = idx(i, j + 1),
        p10 = idx(i + 1, j),
        p11 = idx(i + 1, j + 1);
      indices.push(p00, p01, p10, p01, p11, p10);
    }
  const normals = pc.calculateNormals(positions, indices);
  const tangents = pc.calculateTangents(positions, normals, uvs, indices);
  const shade = new Float32Array(n);
  const colors = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++) {
    const x = positions[k * 3]!,
      z = positions[k * 3 + 2]!;
    shade[k] = t.shadow(x, z);
    const far = Math.hypot(x, z) > RIM_R ? 0.88 : 1;
    const c = albedo(t, x, z, normals[k * 3 + 1] ?? 1) * far;
    colors[k * 4] = Math.round(c * 255);
    colors[k * 4 + 1] = Math.round(c * 252);
    colors[k * 4 + 2] = Math.round(Math.min(1, c * 1.03) * 255);
    colors[k * 4 + 3] = 255;
  }

  // Shadowed triangles become a separate sunless mesh; the sunlit side darkens toward its edge
  const sunlit: number[] = [];
  const sunless: number[] = [];
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f]!,
      b = indices[f + 1]!,
      c = indices[f + 2]!;
    ((shade[a]! + shade[b]! + shade[c]!) / 3 >= 0.5 ? sunless : sunlit).push(a, b, c);
  }
  const litColors = colors.slice();
  for (let k = 0; k < n; k++) {
    const dim = 1 - 0.85 * Math.min(1, shade[k]! * 1.6);
    for (let ch = 0; ch < 3; ch++) litColors[k * 4 + ch] = Math.round(litColors[k * 4 + ch]! * dim);
  }
  const makeMesh = (tris: number[], cols: Uint8Array) => {
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, uvs);
    mesh.setVertexStream(pc.SEMANTIC_TANGENT, tangents, 4);
    mesh.setColors32(cols);
    mesh.setIndices(tris);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  };

  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(look.ground[0], look.ground[1], look.ground[2]);
  mat.diffuseVertexColor = true;
  mat.diffuseVertexColorChannel = "rgb";
  mat.useMetalness = true;
  mat.metalness = 0;
  mat.gloss = 0.22;
  mat.update();
  // Tiling sizes are deliberately unrelated so the grazing polar sun never shows repeat stripes
  const tiling = new pc.Vec2(1 / 9.3, 1 / 9.3);
  loadGreyTexture(app, "/textures/moon_regolith_diff.jpg", 2.2, (tex) => {
    mat.diffuseMap = tex;
    mat.diffuseMapTiling = tiling;
    mat.update();
  });
  loadTexture(app, "/textures/moon_regolith_nor.jpg", false, (tex) => {
    mat.normalMap = tex;
    mat.normalMapTiling = new pc.Vec2(1 / 17, 1 / 17);
    mat.bumpiness = 0.9;
    mat.normalDetailMap = tex;
    mat.normalDetailMapTiling = new pc.Vec2(17 / 3.3, 17 / 3.3);
    mat.normalDetailMapBumpiness = 0.7;
    mat.update();
  });
  loadTexture(app, "/textures/moon_regolith_rough.jpg", false, (tex) => {
    mat.glossMap = tex;
    mat.glossMapTiling = tiling;
    mat.glossInvert = true;
    // Dusty regolith barely reflects; strong specular reads as wet asphalt under lamps
    mat.gloss = 0.35;
    mat.useMetalnessSpecularColor = true;
    mat.specularityFactor = 0.4;
    mat.update();
  });

  const meshInstances = [new pc.MeshInstance(makeMesh(sunlit, litColors), mat)];
  if (sunless.length) meshInstances.push(new pc.MeshInstance(makeMesh(sunless, colors), mat));
  const e = new pc.Entity("LunarTerrain");
  e.addComponent("render", { meshInstances, castShadows: false, receiveShadows: true });
  // After addComponent: assigning meshInstances resets every mask to dynamic-only
  if (sunless.length) meshInstances[1]!.mask = SUNLESS_MASK;
  app.root.addChild(e);
  return e;
}

function radialSprite(device: pc.GraphicsDevice, stops: [number, string][]) {
  return canvasTexture(
    device,
    256,
    (ctx, n) => {
      const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
    },
    { repeat: false },
  );
}

function spriteMat(tex: pc.Texture, intensity: number) {
  const m = new pc.StandardMaterial();
  m.useLighting = false;
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissiveMap = tex;
  m.emissive = new pc.Color(1, 1, 1);
  m.emissiveIntensity = intensity;
  m.opacityMap = tex;
  m.opacityMapChannel = "a";
  m.blendType = pc.BLEND_ADDITIVEALPHA;
  m.depthWrite = false;
  m.cull = pc.CULLFACE_NONE;
  m.useFog = false;
  m.update();
  return m;
}

/** Equirectangular starfield with a Milky Way band, generated once per world. */
function starTexture(device: pc.GraphicsDevice, low: boolean) {
  const w = low ? 2048 : 4096;
  return canvasTexture(
    device,
    w,
    (ctx) => {
      const h = w / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const band = (u: number) => h * (0.5 + 0.24 * Math.sin(u * Math.PI * 2 + 0.6));
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 260; k++) {
        const u = Math.random();
        const x = u * w,
          y = band(u) + gauss() * h * 0.03;
        const r = h * (0.025 + Math.random() * 0.04);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(200,200,215,0.025)");
        g.addColorStop(1, "rgba(200,200,215,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let k = 0; k < (low ? 7000 : 16000); k++) {
        const u = Math.random();
        const a = 0.05 + Math.random() * 0.22;
        ctx.fillStyle = `rgba(230,228,240,${a})`;
        ctx.fillRect(u * w, band(u) + gauss() * h * 0.04, 1, 1);
      }
      ctx.globalCompositeOperation = "source-over";
      const tints = ["255,255,255", "200,220,255", "255,235,210", "255,210,190"];
      for (let i = 0; i < (low ? 2600 : 5200); i++) {
        const b = Math.random() ** 3;
        const x = Math.random() * w,
          y = Math.random() * h;
        ctx.fillStyle = `rgba(${tints[i % tints.length]},${0.35 + b * 0.65})`;
        const s = b > 0.85 ? 2.2 : b > 0.5 ? 1.5 : 1;
        ctx.fillRect(x, y, s, s);
        if (b > 0.93) {
          ctx.fillStyle = `rgba(${tints[i % tints.length]},0.25)`;
          ctx.fillRect(x - 3, y + s / 2 - 0.5, 6 + s, 1);
          ctx.fillRect(x + s / 2 - 0.5, y - 3, 1, 6 + s);
        }
      }
    },
    { repeat: false, height: w / 2 },
  );
}

export interface SkyRig {
  update(cam: pc.Vec3, dt: number): void;
  earthDir: pc.Vec3;
}

/** Sky dome, Sun disc + glare, and a sunlit Earth that all stay at "infinity" around the camera. */
export function buildSky(
  app: pc.Application,
  key: SiteKey,
  light: pc.Entity,
  low: boolean,
): SkyRig {
  const device = app.graphicsDevice;
  const skyMat = new pc.StandardMaterial();
  skyMat.useLighting = false;
  skyMat.diffuse = new pc.Color(0, 0, 0);
  skyMat.emissiveMap = starTexture(device, low);
  skyMat.emissive = new pc.Color(1, 1, 1);
  skyMat.emissiveIntensity = 0.9;
  skyMat.cull = pc.CULLFACE_FRONT;
  skyMat.depthWrite = false;
  skyMat.useFog = false;
  skyMat.update();
  const sky = new pc.Entity("Sky");
  sky.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false });
  sky.render!.material = skyMat;
  sky.setLocalScale(6000, 6000, 6000);
  app.root.addChild(sky);

  const sunCore = new pc.Entity("SunCore");
  sunCore.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false });
  sunCore.render!.material = mkMat(1, 0.97, 0.9, { emissive: 9, fog: false });
  sunCore.setLocalScale(34, 34, 34);
  app.root.addChild(sunCore);
  const glare = new pc.Entity("SunGlare");
  glare.addComponent("render", { type: "plane", castShadows: false, receiveShadows: false });
  glare.render!.material = spriteMat(
    radialSprite(device, [
      [0, "rgba(255,252,245,1)"],
      [0.05, "rgba(255,250,240,0.85)"],
      [0.12, "rgba(255,246,232,0.35)"],
      [0.3, "rgba(255,240,220,0.08)"],
      [0.6, "rgba(255,240,220,0.02)"],
      [1, "rgba(255,240,220,0)"],
    ]),
    1.6,
  );
  glare.setLocalScale(420, 1, 420);
  app.root.addChild(glare);

  const earthDirDef = EARTH_DIRECTION[key];
  const earthDir = new pc.Vec3(
    Math.sin(earthDirDef.yaw) * Math.cos(earthDirDef.pitch),
    Math.sin(earthDirDef.pitch),
    Math.cos(earthDirDef.yaw) * Math.cos(earthDirDef.pitch),
  );
  const earthMat = new pc.StandardMaterial();
  earthMat.diffuse = new pc.Color(0.16, 0.3, 0.62);
  earthMat.useMetalness = true;
  earthMat.metalness = 0;
  earthMat.gloss = 0.15;
  earthMat.useFog = false;
  earthMat.emissive = new pc.Color(0.01, 0.015, 0.03);
  earthMat.update();
  // Sunlit blue haze over the day side, like the atmosphere seen in Apollo Earthrise photos
  const airMat = new pc.StandardMaterial();
  airMat.diffuse = new pc.Color(0.3, 0.5, 1);
  airMat.useMetalness = true;
  airMat.metalness = 0;
  airMat.gloss = 0;
  airMat.opacity = 0.75;
  airMat.blendType = pc.BLEND_ADDITIVEALPHA;
  airMat.depthWrite = false;
  airMat.useFog = false;
  airMat.update();
  loadTexture(app, "/textures/earth_blue_marble.jpg", true, (tex) => {
    tex.addressU = pc.ADDRESS_REPEAT;
    tex.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
    earthMat.diffuse = new pc.Color(1, 1, 1);
    earthMat.diffuseMap = tex;
    earthMat.update();
  });
  const earth = new pc.Entity("Earth");
  earth.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false });
  earth.render!.material = earthMat;
  // Only the Sun lights Earth (Skybox layer), so its night side stays dark and shows a phase
  earth.render!.layers = [pc.LAYERID_SKYBOX];
  earth.setLocalScale(64, 64, 64);
  earth.setLocalEulerAngles(18, 0, 0);
  app.root.addChild(earth);
  const air = new pc.Entity("EarthAtmosphere");
  air.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false });
  air.render!.material = airMat;
  air.render!.layers = [pc.LAYERID_SKYBOX];
  air.setLocalScale(65.5, 65.5, 65.5);
  app.root.addChild(air);
  // Faint limb glow; the disc covers its centre (Earth edge sits at ~0.62 of the sprite radius)
  const halo = new pc.Entity("EarthHalo");
  halo.addComponent("render", { type: "plane", castShadows: false, receiveShadows: false });
  halo.render!.material = spriteMat(
    radialSprite(device, [
      [0, "rgba(110,170,255,0.18)"],
      [0.6, "rgba(110,170,255,0.18)"],
      [0.66, "rgba(110,170,255,0.08)"],
      [0.8, "rgba(110,170,255,0.02)"],
      [1, "rgba(110,170,255,0)"],
    ]),
    0.8,
  );
  halo.setLocalScale(104, 1, 104);
  app.root.addChild(halo);
  light.light!.layers = [pc.LAYERID_WORLD, pc.LAYERID_SKYBOX];

  const tmp = new pc.Vec3();
  let spin = 0;
  const billboard = (e: pc.Entity, cam: pc.Vec3) => {
    e.lookAt(cam);
    e.rotateLocal(-90, 0, 0);
  };
  return {
    earthDir,
    update(cam, dt) {
      sky.setPosition(cam);
      const up = light.up;
      tmp.copy(up).mulScalar(1150).add(cam);
      sunCore.setPosition(tmp);
      tmp.copy(up).mulScalar(1140).add(cam);
      glare.setPosition(tmp);
      billboard(glare, cam);
      tmp.copy(earthDir).mulScalar(900).add(cam);
      earth.setPosition(tmp);
      air.setPosition(tmp);
      spin = (spin + dt * 1.5) % 360;
      earth.setLocalEulerAngles(18, spin, 0);
      tmp.copy(earthDir).mulScalar(905).add(cam);
      halo.setPosition(tmp);
      billboard(halo, cam);
    },
  };
}
