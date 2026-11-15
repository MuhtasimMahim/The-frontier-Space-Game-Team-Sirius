import { describe, it, expect } from "vitest";
import {
  buildEventSchedule,
  chargeStep,
  damagedMaxSpeed,
  canStartBoost,
  shouldNotifyOverflow,
  missionExpired,
  holdStep,
  crystalScale,
  addHallEntry,
  remainingStarterPanels,
  canDeployPanelToday,
  canUseHabitatAirlock,
  canRefillOxygen,
  projectRadarBlip,
} from "@/frontier/game/rules";

describe("design-doc rules", () => {
  it("event schedule is repeatable and stays inside the mission", () => {
    const a = buildEventSchedule(7),
      b = buildEventSchedule(7);
    expect(a).toEqual(b);
    expect(a[0]).toEqual({ day: 12, kind: "storm" });
    expect(a[1]?.kind).toBe("meteor");
    expect(a.every((e) => e.day <= 84)).toBe(true);
  });
  it("charging is 1:1 and limited by base energy", () => {
    expect(chargeStep(2, 1, 10, 50, 100)).toBe(2);
    expect(chargeStep(2, 1, 10, 50, 0.5)).toBe(0.5);
    expect(chargeStep(2, 1, 49.5, 50, 100)).toBe(0.5);
  });
  it("each damage hit removes 10% top speed", () => {
    expect(damagedMaxSpeed(18, 0)).toBe(18);
    expect(damagedMaxSpeed(18, 2)).toBeCloseTo(14.4);
  });
  it("booster needs 20% battery and no cooldown", () => {
    expect(canStartBoost(9, 50, 0, 0.2)).toBe(false);
    expect(canStartBoost(10, 50, 0, 0.2)).toBe(true);
    expect(canStartBoost(50, 50, 1, 0.2)).toBe(false);
  });
  it("energy overflow warns first time then every 5 days", () => {
    expect(shouldNotifyOverflow(3, -1)).toBe(true);
    expect(shouldNotifyOverflow(7, 3)).toBe(false);
    expect(shouldNotifyOverflow(8, 3)).toBe(true);
  });
  it("mission ends on day 90 itself", () => {
    expect(missionExpired(89, 90)).toBe(false);
    expect(missionExpired(90, 90)).toBe(true);
  });
  it("hold progress fills over the hold time and resets on release", () => {
    expect(holdStep(0, 1, 2, true)).toBe(0.5);
    expect(holdStep(0.9, 1, 2, true)).toBe(1);
    expect(holdStep(0.5, 0.1, 2, false)).toBe(0);
  });
  it("ice crystals shrink to 35% before vanishing", () => {
    expect(crystalScale(55, 55)).toBe(1);
    expect(crystalScale(1, 1000)).toBeCloseTo(0.35, 2);
    expect(crystalScale(0, 55)).toBe(0);
  });
  it("hall of fame keeps the 5 fastest wins and reports rank", () => {
    const list = [40, 45, 50, 55, 60].map((d) => ({ days: d, site: "s", date: "" }));
    expect(addHallEntry(list, { days: 42, site: "x", date: "" }).rank).toBe(2);
    const r = addHallEntry(list, { days: 70, site: "x", date: "" });
    expect(r.rank).toBe(0);
    expect(r.list).toHaveLength(5);
  });

  it("tracks remaining starter panels across days and enforces daily cap", () => {
    expect(remainingStarterPanels(0)).toBe(3);
    expect(remainingStarterPanels(2)).toBe(1);
    expect(remainingStarterPanels(5)).toBe(0);
    expect(canDeployPanelToday(2, 3, 25, 3)).toBe(false);
    expect(canDeployPanelToday(2, 0, 25, 3)).toBe(true);
    expect(canDeployPanelToday(25, 0, 25, 3)).toBe(false);
  });

  it("seals airlock oxygen refill when Habitat A is damaged or closed", () => {
    expect(canUseHabitatAirlock("active", true)).toBe(true);
    expect(canUseHabitatAirlock("active", false)).toBe(false);
    expect(canUseHabitatAirlock("damaged", true)).toBe(false);

    // Before Habitat A is built, Lander shelters the astronaut
    expect(
      canRefillOxygen({
        habitatStatus: "available",
        airlockOpen: false,
        atHabitatDoor: false,
        nearLander: true,
        inRover: false,
        roverPowered: true,
      }),
    ).toBe(true);

    // Once Habitat A is damaged, neither the sealed airlock nor exterior Lander refills O2
    expect(
      canRefillOxygen({
        habitatStatus: "damaged",
        airlockOpen: true,
        atHabitatDoor: true,
        nearLander: true,
        inRover: false,
        roverPowered: true,
      }),
    ).toBe(false);

    // Rover only refills O2 while powered
    expect(
      canRefillOxygen({
        habitatStatus: "damaged",
        airlockOpen: false,
        atHabitatDoor: false,
        nearLander: false,
        inRover: true,
        roverPowered: false,
      }),
    ).toBe(false);
    expect(
      canRefillOxygen({
        habitatStatus: "damaged",
        airlockOpen: false,
        atHabitatDoor: false,
        nearLander: false,
        inRover: true,
        roverPowered: true,
      }),
    ).toBe(true);
  });

  it("projects radar blips relative to camera forward heading", () => {
    // Rover facing +Z (heading 0): target at (0, 110) is dead ahead -> x = 0, y < 0 (top / FWD)
    const ahead = projectRadarBlip(0, 0, 0, 110, 0);
    expect(ahead.x).toBeCloseTo(0, 5);
    expect(ahead.y).toBeCloseTo(-40, 5);

    // Walking camera facing -Z (heading PI): target at (0, -110) is dead ahead -> y < 0
    const walkAhead = projectRadarBlip(0, 0, 0, -110, Math.PI);
    expect(walkAhead.x).toBeCloseTo(0, 5);
    expect(walkAhead.y).toBeCloseTo(-40, 5);

    // Turning rover 90 deg right (D key -> steer -1 -> heading -PI/2, facing -X): target at (0, 110) moves left (x < 0)
    const afterRightTurn = projectRadarBlip(0, 0, 0, 110, -Math.PI / 2);
    expect(afterRightTurn.x).toBeCloseTo(-40, 5);
    expect(afterRightTurn.y).toBeCloseTo(0, 5);

    // Turning rover 90 deg left (A key -> steer +1 -> heading +PI/2, facing +X): target at (0, 110) moves right (x > 0)
    const afterLeftTurn = projectRadarBlip(0, 0, 0, 110, Math.PI / 2);
    expect(afterLeftTurn.x).toBeCloseTo(40, 5);
    expect(afterLeftTurn.y).toBeCloseTo(0, 5);
  });
});
