import { describe, expect, it } from "vitest";
import {
  axisDistanceNearestRay,
  axisLockDirection,
  axisLockForKey,
  distanceAlongAxis,
  lockSketchPoint,
  pointOnAxis,
  snapAxisDistance,
  toggleAxisLock,
} from "@/lib/axisLock";

describe("axis lock keys", () => {
  it("reads X and Y everywhere and Z only where there is a height", () => {
    expect(axisLockForKey("x", false)).toBe("x");
    expect(axisLockForKey("Y", false)).toBe("y");
    expect(axisLockForKey("z", false)).toBeNull();
    expect(axisLockForKey("Z", true)).toBe("z");
    expect(axisLockForKey("a", true)).toBeNull();
  });

  it("locks on a tap, lets go on the same key and switches on another", () => {
    expect(toggleAxisLock(null, "x")).toBe("x");
    expect(toggleAxisLock("x", "x")).toBeNull();
    expect(toggleAxisLock("x", "z")).toBe("z");
  });
});

describe("sketch axis lock", () => {
  it("keeps a line level on X and upright on Y", () => {
    expect(lockSketchPoint({ x: 2, z: 3 }, { x: 10, z: 3.4 }, "x")).toEqual({ x: 10, z: 3 });
    expect(lockSketchPoint({ x: 2, z: 3 }, { x: 2.4, z: -8 }, "y")).toEqual({ x: 2, z: -8 });
  });
});

describe("3D axis lock", () => {
  const corner = { x: 10, y: 7.3, z: -4 };
  const up = axisLockDirection("z");

  it("maps the names the user sees onto the view's axes", () => {
    expect(axisLockDirection("x")).toEqual({ x: 1, y: 0, z: 0 });
    expect(axisLockDirection("y")).toEqual({ x: 0, y: 0, z: 1 });
    expect(up).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("takes only the height of a point caught somewhere else", () => {
    expect(distanceAlongAxis(corner, up, { x: 40, y: 0, z: 25 })).toBeCloseTo(-7.3);
    expect(pointOnAxis(corner, up, -7.3)).toEqual({ x: 10, y: 0, z: -4 });
  });

  it("finds where a ray passes the axis closest", () => {
    // A level ray from the front, aimed 5 above the corner, crosses the upright axis there.
    const distance = axisDistanceNearestRay(corner, up, { x: 10, y: 12.3, z: 100 }, { x: 0, y: 0, z: -1 });
    expect(distance).toBeCloseTo(5);
    // A slanted ray that misses the line still gives the nearest spot on it.
    const slanted = axisDistanceNearestRay(corner, up, { x: 30, y: 7.3, z: -4 }, { x: -1, y: -1, z: 0.5 });
    // It passes nearest 16 below the corner, 8 to the side of the line.
    expect(slanted).toBeCloseTo(-16);
  });

  it("gives nothing when looking straight down the axis", () => {
    expect(axisDistanceNearestRay(corner, up, { x: 10, y: 100, z: -4 }, { x: 0, y: -1, z: 0 })).toBeNull();
  });

  it("snaps the point's own coordinate to the grid, so the plate is in reach", () => {
    // From a height of 7.3, a step of 1 lands on whole heights: down 7.3 reaches the plate.
    expect(snapAxisDistance(corner, up, -7.1, 1)).toBeCloseTo(-7.3);
    expect(snapAxisDistance(corner, up, 2.9, 1)).toBeCloseTo(2.7);
    expect(snapAxisDistance(corner, up, 2.9, 0)).toBe(2.9);
  });
});
