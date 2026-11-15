// Per-site terrain and camp layout shared by rendering, physics, and tests (pure TS, no PlayCanvas).

export type SiteKey = "nobile" | "mouton" | "malapert" | "cabeus";

export interface Point {
  x: number;
  z: number;
}

/** Same camp core at every site so docking, airlock, and rescue rules work everywhere. */
export const DOCK: Point = { x: 10, z: 0 };
export const RECOVERY_CONSOLE: Point = { x: 3, z: 8 };
export const HAB_DOOR: Point = { x: 20, z: -2 };
export const LANDER_POS: Point = { x: 0, z: -18 };
export const ORIENT_CONSOLE: Point = { x: 0, z: -9 };
export const SOLAR_TRACKER: Point = { x: -12, z: -12 };
export const SOLAR_FIELD = { x: -16, z: -3, radius: 22 };
export const HABITAT_A: Point = { x: 20, z: -10 };
/** Camp structures sit at y = 0, so the ground is exactly level inside this radius. */
export const CAMP_PLATEAU_RADIUS = 50;
export const CAMP_FLAT_RADIUS = 115;

export interface DistantMountain {
  x: number;
  z: number;
  h: number;
  w: number;
  yaw: number;
}

export interface SiteTerrain {
  key: SiteKey;
  /** Ground height used by drawing and physics alike. */
  height: (x: number, z: number) => number;
  /** 0 = sunlit, 1 = deep permanent shadow. */
  shadow: (x: number, z: number) => number;
  mountains: DistantMountain[];
  /** Where cone mountains sit relative to the local ground (plateau sites look down on them). */
  mountainBase: (m: DistantMountain) => number;
}

export interface Peak {
  x: number;
  z: number;
  h: number;
  s: number;
}

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
}

export const MOUTON_KNOLL: Peak = { x: 110, z: 170, h: 9, s: 45 };
export const MALAPERT_SUMMIT: Peak = { x: -60, z: -300, h: 72, s: 165 };
export const CABEUS_PSR = { x: 0, z: 270, r: 160, depth: 48 };

const MALAPERT_SHOULDERS: Peak[] = [
  { x: 210, z: -400, h: 48, s: 120 },
  { x: -300, z: -180, h: 38, s: 105 },
  { x: 330, z: 150, h: 30, s: 120 },
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

const gauss = (x: number, z: number, p: Peak) =>
  p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (p.s * p.s));

/** Bowl with a soft raised rim; max wall slope ≈ depth·π / (2r). */
function bowl(x: number, z: number, c: Crater) {
  const d = Math.hypot(x - c.x, z - c.z);
  if (d > c.r * 1.4) return 0;
  const inside = d < c.r ? -c.depth * (0.5 + 0.5 * Math.cos((Math.PI * d) / c.r)) : 0;
  const rimW = c.r * 0.22;
  return inside + c.depth * 0.18 * Math.exp(-(((d - c.r) / rimW) ** 2));
}

function flattenCamp(h: number, x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d >= CAMP_FLAT_RADIUS) return h;
  if (d <= CAMP_PLATEAU_RADIUS) return 0;
  const t = (d - CAMP_PLATEAU_RADIUS) / (CAMP_FLAT_RADIUS - CAMP_PLATEAU_RADIUS);
  return h * t * t * (3 - 2 * t);
}

/** Shallow craters scattered away from the camp and the chapter routes. */
function scatterCraters(seed: number, count: number, keepClear: Point[][], maxR = 34): Crater[] {
  const rand = mulberry32(seed);
  const out: Crater[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const ang = rand() * Math.PI * 2;
    const dist = 70 + rand() * 360;
    const c: Crater = {
      x: Math.cos(ang) * dist,
      z: Math.sin(ang) * dist,
      r: 10 + rand() * (maxR - 10),
      depth: 0,
    };
    c.depth = c.r * (0.08 + rand() * 0.05);
    const blocked = keepClear.some((route) => {
      for (let i = 0; i < route.length - 1; i++) {
        if (distToSegment(c, route[i]!, route[i + 1]!) < c.r * 1.5 + 12) return true;
      }
      return (
        route.length === 1 && Math.hypot(c.x - route[0]!.x, c.z - route[0]!.z) < c.r * 1.5 + 12
      );
    });
    if (!blocked) out.push(c);
  }
  return out;
}

function mountainRing(
  seed: number,
  count: number,
  minDist: number,
  spread: number,
  hMin: number,
  hRange: number,
) {
  const rand = mulberry32(seed);
  const out: DistantMountain[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand() * 0.1;
    const dist = minDist + rand() * spread;
    out.push({
      x: Math.cos(ang) * dist,
      z: Math.sin(ang) * dist,
      h: hMin + rand() * hRange,
      w: 50 + rand() * 70,
      yaw: rand() * 360,
    });
  }
  return out;
}

/** Raised rim at the map edge so drivers meet hills instead of falling off the world. */
function edgeRidge(x: number, z: number, mountains: DistantMountain[]) {
  const edge = Math.hypot(x, z);
  let ridge =
    edge > 380
      ? Math.pow((edge - 380) / 220, 2) * 60 * (0.6 + 0.4 * Math.sin(Math.atan2(z, x) * 7))
      : 0;
  // Broad, rounded massifs: old impact-eroded lunar mountains have ~30-40° flanks, no sharp peaks
  const g = Math.min(1, Math.max(0, (edge - 380) / 110));
  const gate = g * g * (3 - 2 * g);
  if (gate > 0)
    for (const m of mountains) {
      const d = Math.hypot(x - m.x, z - m.z),
        r = Math.max(m.w * 0.9, m.h * 1.5);
      if (d < r) {
        const t = 1 - (d / r) ** 2;
        const rough =
          0.8 +
          0.11 * Math.sin(x * 0.045 + z * 0.031 + m.yaw) +
          0.06 * Math.sin(z * 0.11 - x * 0.07) +
          0.03 * Math.sin(x * 0.23 + z * 0.19);
        ridge = Math.max(ridge, m.h * 0.8 * t * t * gate * rough);
      }
    }
  return ridge;
}

const noShadow = () => 0;

/** Routes each story site keeps free of random craters (camp → objectives). */
export const SITE_ROUTES: Record<Exclude<SiteKey, "nobile">, Point[][]> = {
  mouton: [
    [
      { x: 0, z: 0 },
      { x: -170, z: -60 },
    ],
    [
      { x: 0, z: 0 },
      { x: 150, z: -150 },
    ],
    [
      { x: 0, z: 0 },
      { x: MOUTON_KNOLL.x, z: MOUTON_KNOLL.z },
    ],
    [
      { x: -170, z: -60 },
      { x: 150, z: -150 },
      { x: MOUTON_KNOLL.x, z: MOUTON_KNOLL.z },
    ],
  ],
  malapert: [
    [
      { x: 0, z: 0 },
      { x: MALAPERT_SUMMIT.x, z: MALAPERT_SUMMIT.z },
    ],
  ],
  cabeus: [
    [
      { x: 0, z: 0 },
      { x: 40, z: 96 },
      { x: -60, z: 84 },
      { x: 0, z: 0 },
    ],
    [
      { x: 0, z: 0 },
      { x: CABEUS_PSR.x, z: CABEUS_PSR.z },
    ],
  ],
};

export function makeSiteTerrain(key: SiteKey, opts: { iceCraters?: Point[] } = {}): SiteTerrain {
  if (key === "nobile") {
    const mountains = mountainRing(4401, 46, 470, 90, 30, 70);
    const ice = opts.iceCraters ?? [];
    const base = (x: number, z: number) => {
      let h = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 2.2;
      h += Math.sin(x * 0.005 + 1.2) * Math.cos(z * 0.005) * 5.5;
      for (const c of ice) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < 35) h -= Math.cos((d / 35) * (Math.PI / 2)) * 6.5;
      }
      return flattenCamp(h, x, z);
    };
    return {
      key,
      height: (x, z) => base(x, z) + edgeRidge(x, z, mountains),
      shadow: noShadow,
      mountains,
      mountainBase: (m) => base(m.x, m.z),
    };
  }

  if (key === "mouton") {
    // Flat-topped mesa: a wide sunlit plateau that falls away past ~430 m.
    const craters = scatterCraters(7302, 22, SITE_ROUTES.mouton);
    const mountains = mountainRing(7303, 30, 760, 260, 60, 140);
    const height = (x: number, z: number) => {
      let h = Math.sin(x * 0.018) * Math.cos(z * 0.021) * 1.5;
      h += Math.sin(x * 0.006 + 0.7) * Math.cos(z * 0.005 + 0.3) * 3;
      h += gauss(x, z, MOUTON_KNOLL);
      for (const c of craters) h += bowl(x, z, c);
      const d = Math.hypot(x, z);
      if (d > 430) h -= ((d - 430) / 170) ** 2 * 90;
      return flattenCamp(h, x, z);
    };
    return { key, height, shadow: noShadow, mountains, mountainBase: () => -150 };
  }

  if (key === "malapert") {
    const craters = scatterCraters(5501, 18, SITE_ROUTES.malapert);
    const mountains = mountainRing(5502, 40, 480, 90, 50, 90);
    const base = (x: number, z: number) => {
      let h = Math.sin(x * 0.015) * Math.cos(z * 0.017) * 2;
      h += Math.sin(x * 0.005 + 2) * Math.cos(z * 0.006 + 1) * 4;
      h += gauss(x, z, MALAPERT_SUMMIT);
      for (const p of MALAPERT_SHOULDERS) h += gauss(x, z, p);
      for (const c of craters) h += bowl(x, z, c);
      return flattenCamp(h, x, z);
    };
    return {
      key,
      height: (x, z) => base(x, z) + edgeRidge(x, z, mountains),
      shadow: noShadow,
      mountains,
      mountainBase: (m) => base(m.x, m.z),
    };
  }

  // cabeus: camp on the sunlit rim above a deep permanently shadowed crater
  const craters = scatterCraters(9901, 16, SITE_ROUTES.cabeus).filter(
    (c) => Math.hypot(c.x - CABEUS_PSR.x, c.z - CABEUS_PSR.z) > CABEUS_PSR.r + c.r + 20,
  );
  const mountains = mountainRing(9902, 44, 470, 100, 35, 80);
  const psr: Crater = {
    x: CABEUS_PSR.x,
    z: CABEUS_PSR.z,
    r: CABEUS_PSR.r,
    depth: CABEUS_PSR.depth,
  };
  const base = (x: number, z: number) => {
    let h = Math.sin(x * 0.02) * Math.cos(z * 0.018) * 1.8;
    h += Math.sin(x * 0.006 + 0.4) * Math.cos(z * 0.005 + 1.1) * 3;
    h += bowl(x, z, psr);
    for (const c of craters) h += bowl(x, z, c);
    return flattenCamp(h, x, z);
  };
  const shadow = (x: number, z: number) => {
    const d = Math.hypot(x - CABEUS_PSR.x, z - CABEUS_PSR.z);
    const inner = CABEUS_PSR.r * 0.78,
      outer = CABEUS_PSR.r + 12;
    if (d <= inner) return 1;
    if (d >= outer) return 0;
    const t = (outer - d) / (outer - inner);
    return t * t * (3 - 2 * t);
  };
  return {
    key,
    height: (x, z) => base(x, z) + edgeRidge(x, z, mountains),
    shadow,
    mountains,
    mountainBase: (m) => base(m.x, m.z),
  };
}

/** Steepest rise or fall (rise/run) sampled along a straight drive from a to b. */
export function maxRouteSlope(
  height: (x: number, z: number) => number,
  a: Point,
  b: Point,
  step = 2,
) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-6) return 0;
  const n = Math.max(1, Math.ceil(len / step));
  let prev = height(a.x, a.z);
  let worst = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const h = height(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    worst = Math.max(worst, Math.abs(h - prev) / (len / n));
    prev = h;
  }
  return worst;
}

/**
 * Direction to Earth seen from each site (yaw like the player heading: 0 = +Z). From the south
 * pole Earth hangs only a few degrees up; at Malapert it sits just above the massif's summit.
 */
export const EARTH_DIRECTION: Record<SiteKey, { yaw: number; pitch: number }> = {
  nobile: { yaw: Math.atan2(-250, -900), pitch: 0.13 },
  mouton: { yaw: Math.atan2(-420, -800), pitch: 0.11 },
  malapert: { yaw: Math.atan2(-190, -600), pitch: 0.14 },
  cabeus: { yaw: Math.atan2(300, -820), pitch: 0.1 },
};

export function siteKeyForMode(mode: string): SiteKey {
  if (mode === "chapter2") return "mouton";
  if (mode === "chapter3") return "malapert";
  if (mode === "chapter4") return "cabeus";
  return "nobile";
}
