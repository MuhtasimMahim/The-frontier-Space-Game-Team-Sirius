import { describe, it, expect } from "vitest";
import type { BaseState } from "@/frontier/game/network";
import {
  initialBases,
  dailyFlow,
  canBuild,
  networkUnlocked,
  warnLeadDays,
  allRunning,
  nextStreak,
  networkWon,
  NETWORK,
} from "@/frontier/game/network";

const withBuilt = (n: Partial<Record<string, number>>, led = false) =>
  initialBases().map((b) => ({ ...b, built: n[b.id] ?? 0, led: b.id === "FOOD" && led }));

describe("four-base network", () => {
  it("unlocks after a working habitat and 3 panels", () => {
    expect(networkUnlocked(false, 5)).toBe(false);
    expect(networkUnlocked(true, 2)).toBe(false);
    expect(networkUnlocked(true, 3)).toBe(true);
  });
  it("building needs the next facility cost", () => {
    const b = initialBases()[1] as BaseState; // POWER airlock 30E 10W
    expect(canBuild(b, 29, 50)).toBe(false);
    expect(canBuild(b, 30, 10)).toBe(true);
    expect(canBuild({ ...b, built: 3 }, 999, 999)).toBe(false);
  });
  it("power tower only feeds other bases once the energy-pack hopper exists", () => {
    expect(dailyFlow(withBuilt({ POWER: 2 }), 0).energyDelta).toBe(0);
    expect(dailyFlow(withBuilt({ POWER: 3 }), 0).energyDelta).toBe(NETWORK.POWER_TOWER_OUTPUT - 2);
  });
  it("bases go offline when upkeep cannot be paid", () => {
    const f = dailyFlow(withBuilt({ FOOD: 3, COMM: 1 }), 3);
    expect(f.online["FOOD"] !== f.online["COMM"]).toBe(true);
  });
  it("LED lighting gives +1 food for 3 more energy", () => {
    const off = dailyFlow(withBuilt({ FOOD: 3 }), 50),
      on = dailyFlow(withBuilt({ FOOD: 3 }, true), 50);
    expect(on.food - off.food).toBe(1);
    expect(off.energyDelta - on.energyDelta).toBe(3);
  });
  it("aligned comm antenna adds 2 days of storm warning", () => {
    const b = withBuilt({ COMM: 2 });
    b[0]!.online = true;
    expect(warnLeadDays(b, 2)).toBe(4);
    expect(warnLeadDays(withBuilt({}), 2)).toBe(2);
  });
  it("win needs all four complete and online for 5 days in a row", () => {
    const b = withBuilt({ COMM: 3, POWER: 3, FOOD: 3, EXPLORE: 3 });
    const all = { COMM: true, POWER: true, FOOD: true, EXPLORE: true };
    expect(allRunning(b, all)).toBe(true);
    expect(allRunning(b, { ...all, FOOD: false })).toBe(false);
    expect(nextStreak(4, false)).toBe(0);
    expect(networkWon(4)).toBe(false);
    expect(networkWon(5)).toBe(true);
  });
});
