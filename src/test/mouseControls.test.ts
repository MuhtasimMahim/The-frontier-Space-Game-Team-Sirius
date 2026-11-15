import { describe, it, expect } from "vitest";
import { projectRadarBlip } from "@/frontier/game/rules";

describe("GTA-style camera-relative movement math", () => {
  function getMoveVector(camYaw: number, fwd: number, str: number) {
    const camForwardX = -Math.sin(camYaw);
    const camForwardZ = -Math.cos(camYaw);
    const camRightX = Math.cos(camYaw);
    const camRightZ = -Math.sin(camYaw);

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
    return { x: moveX, z: moveZ };
  }

  it("moves North when pressing W facing North (camYaw = 0)", () => {
    const move = getMoveVector(0, 1, 0); // W
    expect(move.x).toBeCloseTo(0, 5);
    expect(move.z).toBeCloseTo(-1, 5);
  });

  it("moves South when pressing S facing North (camYaw = 0)", () => {
    const move = getMoveVector(0, -1, 0); // S
    expect(move.x).toBeCloseTo(0, 5);
    expect(move.z).toBeCloseTo(1, 5);
  });

  it("moves West when pressing A facing North (camYaw = 0)", () => {
    const move = getMoveVector(0, 0, -1); // A
    expect(move.x).toBeCloseTo(-1, 5);
    expect(move.z).toBeCloseTo(0, 5);
  });

  it("moves East when pressing D facing North (camYaw = 0)", () => {
    const move = getMoveVector(0, 0, 1); // D
    expect(move.x).toBeCloseTo(1, 5);
    expect(move.z).toBeCloseTo(0, 5);
  });

  it("moves in the camera look direction when camera is turned 90 deg (East)", () => {
    // camYaw = -Math.PI / 2 means looking toward +X (East)
    const moveW = getMoveVector(-Math.PI / 2, 1, 0); // W
    expect(moveW.x).toBeCloseTo(1, 5); // forward is East
    expect(moveW.z).toBeCloseTo(0, 5);

    const moveS = getMoveVector(-Math.PI / 2, -1, 0); // S
    expect(moveS.x).toBeCloseTo(-1, 5); // backward is West
    expect(moveS.z).toBeCloseTo(0, 5);

    const moveA = getMoveVector(-Math.PI / 2, 0, -1); // A (strafe left)
    expect(moveA.x).toBeCloseTo(0, 5);
    expect(moveA.z).toBeCloseTo(-1, 5); // left is North

    const moveD = getMoveVector(-Math.PI / 2, 0, 1); // D (strafe right)
    expect(moveD.x).toBeCloseTo(0, 5);
    expect(moveD.z).toBeCloseTo(1, 5); // right is South
  });

  it("normalizes diagonal movement so walking diagonally is not faster", () => {
    const moveWD = getMoveVector(0, 1, 1); // W + D
    const speed = Math.hypot(moveWD.x, moveWD.z);
    expect(speed).toBeCloseTo(1.0, 5);
    expect(moveWD.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(moveWD.z).toBeCloseTo(-Math.SQRT1_2, 4);
  });
});

describe("Radar camera heading alignment", () => {
  it("projects target straight ahead onto top of radar screen (-y, ▲ FWD)", () => {
    // When camYaw = 0, camera faces North (-z), cameraHeading = Math.PI
    // Target is 50m North: origin (0, 0), target (0, -50)
    const blipNorth = projectRadarBlip(0, 0, 0, -50, Math.PI);
    expect(blipNorth.x).toBeCloseTo(0, 3);
    expect(blipNorth.y).toBeLessThan(0); // -y is top of radar

    // When camera turns East (camYaw = -Math.PI / 2, cameraHeading = Math.PI / 2)
    // Target is 50m East: origin (0, 0), target (50, 0)
    // Since target is straight ahead in camera view, it should STILL appear at the top of the radar!
    const blipEast = projectRadarBlip(0, 0, 50, 0, Math.PI / 2);
    expect(blipEast.x).toBeCloseTo(0, 3);
    expect(blipEast.y).toBeLessThan(0); // -y is top of radar (▲ FWD)
  });
});
