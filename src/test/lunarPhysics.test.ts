import { describe, it, expect } from "vitest";
import {
  MOON_GRAVITY,
  ASTRONAUT,
  makeAstronaut,
  stepAstronaut,
  makeRover,
  stepRover,
} from "@/frontier/game/lunarPhysics";

const flat = () => 0;

describe("lunar physics", () => {
  it("uses one-sixth Earth gravity (1.62 m/s²)", () => {
    expect(MOON_GRAVITY).toBe(1.62);
  });

  it("a standing jump peaks near v²/2g and lands after ~2v/g", () => {
    const a = makeAstronaut(0, 0, flat);
    stepAstronaut(a, { x: 0, z: 0 }, true, 0.01, flat);
    let peak = 0,
      t = 0.01;
    while (!a.grounded && t < 20) {
      stepAstronaut(a, { x: 0, z: 0 }, false, 0.01, flat);
      peak = Math.max(peak, a.y);
      t += 0.01;
    }
    const v = ASTRONAUT.JUMP_SPEED;
    expect(peak).toBeCloseTo((v * v) / (2 * MOON_GRAVITY), 0);
    expect(t).toBeGreaterThan((2 * v) / MOON_GRAVITY - 0.1);
    expect(t).toBeLessThan((2 * v) / MOON_GRAVITY + 0.1);
  });

  it("astronaut never exceeds walk speed", () => {
    const a = makeAstronaut(0, 0, flat);
    for (let i = 0; i < 500; i++) stepAstronaut(a, { x: 1, z: 0 }, false, 0.02, flat);
    expect(Math.hypot(a.vx, a.vz)).toBeLessThanOrEqual(ASTRONAUT.WALK_SPEED + 1e-6);
  });

  it("rover leaves the ground over a sharp drop and falls under lunar gravity", () => {
    const cliff = (x: number, z: number) => (z > 20 ? -6 : 0);
    const r = makeRover(0, 0, 0, cliff);
    let airborne = false;
    for (let i = 0; i < 400; i++) {
      stepRover(r, { throttle: 1, steer: 0, boost: 1 }, 18, 0.02, cliff);
      if (!r.grounded) airborne = true;
    }
    expect(airborne).toBe(true);
  });

  it("rover is stopped by an obstacle and reports the impact", () => {
    const r = makeRover(0, 0, 0, flat);
    r.vz = 15;
    const impact = stepRover(r, { throttle: 1, steer: 0, boost: 1 }, 18, 0.05, flat, [
      { x: 0, z: 3, r: 1 },
    ]);
    expect(impact).toBeGreaterThan(9);
    expect(r.z).toBeLessThan(3);
  });
});

import { makeAstronaut as mkA, stepAstronaut as stepA } from "@/frontier/game/lunarPhysics";
describe("WASD responsiveness", () => {
  it("holding W for 1s moves the astronaut at least 3 m forward", () => {
    const a = mkA(0, 0, () => 0);
    for (let i = 0; i < 60; i++) stepA(a, { x: 0, z: -1 }, false, 1 / 60, () => 0);
    expect(a.z).toBeLessThan(-3);
  });
});

import { roverGroundPose, makeRover as mkR, stepRover as stR } from "@/frontier/game/lunarPhysics";
describe("rover ground alignment", () => {
  it("pitches nose-up when driving uphill", () => {
    const p = roverGroundPose(0, 0, 0, (x, z) => z * 0.3); // heading 0 faces +z
    expect(p.pitch).toBeCloseTo(Math.atan(0.3), 3);
    expect(p.roll).toBeCloseTo(0, 3);
  });
  it("rolls right-side-up on a slope rising to its right", () => {
    const p = roverGroundPose(0, 0, 0, (x) => x * 0.2);
    expect(p.roll).toBeCloseTo(Math.atan(0.2), 3);
  });
  it("settles onto a sloped surface when parked", () => {
    const h = (x: number, z: number) => z * 0.25;
    const r = mkR(0, 0, 0, h);
    for (let i = 0; i < 120; i++) stR(r, { throttle: 0, steer: 0, boost: 1 }, 0, 1 / 60, h);
    expect(r.pitch).toBeCloseTo(Math.atan(0.25), 2);
  });
  it("reports a bump when dropped onto the ground", () => {
    const h = () => 0;
    const r = mkR(0, 0, 0, h);
    r.y = 6;
    r.grounded = false;
    let max = 0;
    for (let i = 0; i < 300; i++) {
      stR(r, { throttle: 0, steer: 0, boost: 1 }, 0, 1 / 60, h);
      max = Math.max(max, r.bump || 0);
    }
    expect(max).toBeGreaterThan(2);
  });
});

import { driveSpeed, REVERSE_RATIO } from "@/frontier/game/lunarPhysics";
describe("rover drivetrain", () => {
  it("S brakes a forward-moving rover to a stop before reversing", () => {
    const v = driveSpeed(5, -1, 12, 1, 0.1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(5);
  });
  it("reverse is capped at 40% of top speed", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = driveSpeed(v, -1, 12, 1, 0.05);
    expect(v).toBeCloseTo(-12 * REVERSE_RATIO, 5);
  });
  it("reversing over gentle ripples never reports a crash bump", () => {
    const h = (x: number, z: number) => Math.sin(z * 0.8) * 0.3;
    const r = mkR(0, 0, 0, h);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      stR(r, { throttle: -1, steer: 0.5, boost: 1 }, 12, 1 / 60, h);
      max = Math.max(max, r.bump || 0);
    }
    expect(max).toBeLessThan(2);
    expect(r.flipped).toBe(false);
  });
  it("climbing a slope is slower than driving on flat ground", () => {
    const up = (x: number, z: number) => z * 0.3,
      flat0 = () => 0;
    const a = mkR(0, 0, 0, up),
      b = mkR(0, 0, 0, flat0);
    for (let i = 0; i < 300; i++) {
      stR(a, { throttle: 1, steer: 0, boost: 1 }, 12, 1 / 60, up);
      stR(b, { throttle: 1, steer: 0, boost: 1 }, 12, 1 / 60, flat0);
    }
    expect(a.z).toBeLessThan(b.z);
  });
});
