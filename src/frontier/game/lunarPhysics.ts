// Pure lunar physics: no React, no PlayCanvas. The 3D world only draws these bodies.

export const MOON_GRAVITY = 1.62; // m/s², one-sixth of Earth

export const ASTRONAUT = {
  WALK_SPEED: 6.5, // max horizontal speed on foot
  GROUND_ACCEL: 6, // velocity-blend rate per second toward target // low traction: suits slip on regolith
  GROUND_FRICTION: 3, // per-second velocity decay when no input
  AIR_CONTROL: 0.5, // fraction of ground accel available in the air
  JUMP_SPEED: 3.4, // ~3.6 m high, ~4.2 s airtime under lunar gravity
  HOP_SPEED: 0.7, // bunny-hop gait while moving
  RADIUS: 0.6,
};

export const ROVER_PHYS = {
  ACCEL: 7,
  BRAKE: 12,
  TURN_RATE: 1.6, // rad/s at full grip
  DRAG: 0.25,
  GRIP: 2.5, // lateral slip correction per second (low = drifts)
  WHEELBASE: 1.6, // half length
  TRACK: 1.9, // half width
  RIDE_HEIGHT: 0.75,
  SPRING: 28,
  DAMPING: 5,
  TIP_ANGLE: 0.95, // rad (~55°) before the rover rolls over
  RADIUS: 2.6,
  CRASH_SPEED: 9, // impact speed that damages the rover
};

export type HeightFn = (x: number, z: number) => number;
export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface Astronaut {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  heading: number;
}

export interface Rover {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  pitch: number;
  roll: number;
  grounded: boolean;
  flipped: boolean;
  /** vertical impact speed from touchdown / bump-stop this step (m/s) */
  bump?: number;
}

export function makeAstronaut(x: number, z: number, h: HeightFn): Astronaut {
  return { x, y: h(x, z), z, vx: 0, vy: 0, vz: 0, grounded: true, heading: 0 };
}

export function makeRover(x: number, z: number, heading: number, h: HeightFn): Rover {
  return {
    x,
    y: h(x, z) + ROVER_PHYS.RIDE_HEIGHT,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading,
    pitch: 0,
    roll: 0,
    grounded: true,
    flipped: false,
  };
}

/** Pushes a circle out of obstacles; returns the speed of the hardest impact. */
export function resolveObstacles(
  b: { x: number; z: number; vx: number; vz: number },
  radius: number,
  obstacles: Obstacle[],
) {
  let impact = 0;
  for (const o of obstacles) {
    const dx = b.x - o.x,
      dz = b.z - o.z;
    const d = Math.hypot(dx, dz),
      min = o.r + radius;
    if (d < min && d > 1e-6) {
      const nx = dx / d,
        nz = dz / d;
      b.x = o.x + nx * min;
      b.z = o.z + nz * min;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        b.vx -= vn * nx * 1.3;
        b.vz -= vn * nz * 1.3; // small bounce
      }
    }
  }
  return impact;
}

/** input: move = desired direction (world, unit or zero); jump pressed this frame. */
export function stepAstronaut(
  a: Astronaut,
  move: { x: number; z: number },
  jump: boolean,
  dt: number,
  h: HeightFn,
  obstacles: Obstacle[] = [],
) {
  dt = Math.min(dt, 0.05);
  const P = ASTRONAUT;
  const moving = move.x !== 0 || move.z !== 0;
  // Steer velocity toward the desired direction: responsive W/A/S/D, with a
  // little slip on regolith and reduced (not zero) control mid-hop.
  const rate = (a.grounded ? P.GROUND_ACCEL : P.GROUND_ACCEL * P.AIR_CONTROL) * dt;
  const tx = moving ? move.x * P.WALK_SPEED : a.vx;
  const tz = moving ? move.z * P.WALK_SPEED : a.vz;
  const blend = 1 - Math.exp(-rate);
  a.vx += (tx - a.vx) * blend;
  a.vz += (tz - a.vz) * blend;
  if (!moving && a.grounded) {
    const k = Math.exp(-P.GROUND_FRICTION * dt);
    a.vx *= k;
    a.vz *= k;
  }
  if (moving) {
    const want = Math.atan2(move.x, move.z);
    let d = want - a.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.heading += d * Math.min(1, 12 * dt);
  }
  const sp = Math.hypot(a.vx, a.vz);
  if (sp > P.WALK_SPEED) {
    a.vx *= P.WALK_SPEED / sp;
    a.vz *= P.WALK_SPEED / sp;
  }

  if (a.grounded) {
    if (jump) {
      a.vy = P.JUMP_SPEED;
      a.grounded = false;
    } else if (moving && sp > 2.5) {
      a.vy = P.HOP_SPEED;
      a.grounded = false;
    }
  }

  a.vy -= MOON_GRAVITY * dt;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  a.z += a.vz * dt;
  resolveObstacles(a, P.RADIUS, obstacles);

  const g = h(a.x, a.z);
  if (a.y <= g) {
    a.y = g;
    if (a.vy < 0) a.vy = 0;
    a.grounded = true;
  } else if (a.grounded && a.y - g < 0.05) a.y = g;
  else a.grounded = false;
}

export interface RoverInput {
  throttle: number;
  steer: number;
  boost: number;
}

/** Max reverse speed as a fraction of forward top speed. */
export const REVERSE_RATIO = 0.4;

/**
 * Drivetrain: W accelerates; S brakes while rolling forward, then engages reverse
 * once stopped (and vice versa). Returns the new forward speed. Pure, testable.
 */
export function driveSpeed(
  fwd: number,
  throttle: number,
  maxSpeed: number,
  boost: number,
  dt: number,
) {
  const P = ROVER_PHYS;
  if (throttle > 0 && fwd < -0.3) return Math.min(0, fwd + P.BRAKE * dt); // braking out of reverse
  if (throttle < 0 && fwd > 0.3) return Math.max(0, fwd - P.BRAKE * dt); // braking before reverse
  const target =
    throttle > 0 ? throttle * maxSpeed * boost : throttle < 0 ? -maxSpeed * REVERSE_RATIO : 0;
  const rate = throttle === 0 ? P.ACCEL * 0.35 : P.ACCEL; // coasting rolls down gently
  if (fwd < target) return Math.min(target, fwd + rate * dt);
  if (fwd > target) return Math.max(target, fwd - rate * dt);
  return fwd;
}

/** Returns impact speed if the rover hit something this step. */
export function stepRover(
  r: Rover,
  input: RoverInput,
  maxSpeed: number,
  dt: number,
  h: HeightFn,
  obstacles: Obstacle[] = [],
) {
  dt = Math.min(dt, 0.05);
  const P = ROVER_PHYS;
  const fx = Math.sin(r.heading),
    fz = Math.cos(r.heading);
  let fwd = r.vx * fx + r.vz * fz;
  let lat = r.vx * fz - r.vz * fx;

  if (r.grounded && !r.flipped) {
    fwd = driveSpeed(fwd, input.throttle, maxSpeed, input.boost, dt);
    // Slope gravity along the chassis: uphill slows, downhill pulls (g·sinθ)
    fwd -= MOON_GRAVITY * Math.sin(r.pitch) * dt;
    // Steering authority fades in with speed and flips smoothly through zero (no whip)
    const dir = Math.tanh(fwd / 1.5);
    const steerGrip = Math.min(1, Math.abs(fwd) / 3);
    r.heading +=
      input.steer * P.TURN_RATE * steerGrip * Math.sign(dir) * Math.min(1, Math.abs(dir) * 2) * dt;
    lat *= Math.exp(-P.GRIP * dt);
  }
  fwd *= Math.exp(-P.DRAG * dt);
  const nfx = Math.sin(r.heading),
    nfz = Math.cos(r.heading);
  r.vx = nfx * fwd + nfz * lat;
  r.vz = nfz * fwd - nfx * lat;

  r.x += r.vx * dt;
  r.z += r.vz * dt;
  const impact = resolveObstacles(r, P.RADIUS, obstacles);

  const pose = roverGroundPose(r.x, r.z, r.heading, h);
  const ground = pose.ground;

  // Progressive spring-damper: linear for ripples, cubic stiffening on big
  // compressions so it never needs a hard clamp (which caused phantom crashes).
  r.vy -= MOON_GRAVITY * dt;
  const compression = ground - r.y;
  r.bump = 0;
  if (compression > -0.15) {
    if (!r.grounded && r.vy < 0) r.bump = -r.vy; // real touchdown only
    const c = Math.max(0, compression);
    const force = P.SPRING * compression + 120 * c * c * c - P.DAMPING * r.vy;
    r.vy += force * dt;
    r.grounded = true;
  } else r.grounded = false;
  r.y += r.vy * dt;
  // Safety: never sink through the ground; terrain carries the chassis smoothly
  if (r.y < ground - 0.6) {
    if (r.vy < -3) r.bump = Math.max(r.bump, -r.vy);
    r.y = ground - 0.6;
    r.vy = Math.max(r.vy, 0);
  }

  const k = 1 - Math.exp(-(r.grounded ? 10 : 1.5) * dt);
  // Weight transfer: nose dips under braking, squats under acceleration (visual only)
  const pitchLoad = r.grounded
    ? Math.max(-0.05, Math.min(0.05, input.throttle * 0.02 * Math.sign(fwd || 1)))
    : 0;
  r.pitch += (pose.pitch + pitchLoad - r.pitch) * k;
  r.roll += (pose.roll - r.roll) * k;
  // Only real hard cornering on a slope tips it over
  const tipLoad = r.grounded ? lat * Math.abs(fwd) * 0.0006 : 0;
  if (!r.flipped && Math.abs(pose.roll + tipLoad) > P.TIP_ANGLE) {
    r.flipped = true;
    r.roll = pose.roll + tipLoad;
  }

  return impact;
}

/**
 * Fits a plane through the six wheel contact points (least squares) and
 * returns chassis height, pitch (+ = nose up) and roll (+ = right side up).
 */
export function roverGroundPose(x: number, z: number, heading: number, h: HeightFn) {
  const P = ROVER_PHYS;
  const fx = Math.sin(heading),
    fz = Math.cos(heading);
  const rx = Math.cos(heading),
    rz = -Math.sin(heading);
  let sum = 0,
    sf = 0,
    sr = 0,
    ff = 0,
    rr = 0;
  for (const a of [-P.WHEELBASE, 0, P.WHEELBASE])
    for (const b of [-P.TRACK, P.TRACK]) {
      const y = h(x + fx * a + rx * b, z + fz * a + rz * b);
      sum += y;
      sf += y * a;
      sr += y * b;
      ff += a * a;
      rr += b * b;
    }
  const slopeF = sf / ff,
    slopeR = sr / rr; // dy per metre forward / right
  return { ground: sum / 6 + P.RIDE_HEIGHT, pitch: Math.atan(slopeF), roll: Math.atan(slopeR) };
}
