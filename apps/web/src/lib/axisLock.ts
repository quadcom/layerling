/**
 * Locking a drag to one axis with the X, Y and Z keys, as in Blender: a tap locks, the same key again lets go,
 * another key switches. The names are the ones the user sees - X is the width, Y the depth, Z the height.
 */

export type AxisLock = "x" | "y" | "z";

type PlanePoint = { x: number; z: number };
type SpacePoint = { x: number; y: number; z: number };

/** The axis a key stands for, or null. A sketch is flat, so Z only counts where `withHeight` is set. */
export function axisLockForKey(key: string, withHeight: boolean): AxisLock | null {
  const lower = key.toLowerCase();
  if (lower === "x" || lower === "y") return lower;
  return withHeight && lower === "z" ? "z" : null;
}

/** The lock after a tap of `pressed`: the same axis again lets go. */
export function toggleAxisLock(current: AxisLock | null, pressed: AxisLock): AxisLock | null {
  return current === pressed ? null : pressed;
}

/**
 * A sketch point held on the axis through `origin`: locked to X the line stays level, locked to Y upright.
 * The sketch keeps its depth in z, shown as Y.
 */
export function lockSketchPoint(origin: PlanePoint, point: PlanePoint, axis: AxisLock): PlanePoint {
  return axis === "x" ? { x: point.x, z: origin.z } : { x: origin.x, z: point.z };
}

/**
 * The world direction of an axis in the 3D view, where the height is y and the plate's depth is z.
 * The sign does not matter for a lock line.
 */
export function axisLockDirection(axis: AxisLock): SpacePoint {
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "y") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

const dot = (a: SpacePoint, b: SpacePoint) => a.x * b.x + a.y * b.y + a.z * b.z;

/** How far along the axis line (through `origin`, unit `direction`) a point lies: its foot on the line. */
export function distanceAlongAxis(origin: SpacePoint, direction: SpacePoint, point: SpacePoint): number {
  return dot({ x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z }, direction);
}

/**
 * Where on the axis line the pointer's ray passes closest, as a distance along it; null when the ray runs
 * along the axis (looking straight down it), where every point is as close as any other.
 */
export function axisDistanceNearestRay(origin: SpacePoint, direction: SpacePoint, rayOrigin: SpacePoint, rayDirection: SpacePoint): number | null {
  const b = dot(direction, rayDirection);
  const c = dot(rayDirection, rayDirection);
  const denominator = c - b * b;
  if (Math.abs(denominator) < 1e-6 * c) return null;
  const offset = { x: origin.x - rayOrigin.x, y: origin.y - rayOrigin.y, z: origin.z - rayOrigin.z };
  return (b * dot(rayDirection, offset) - c * dot(direction, offset)) / denominator;
}

/**
 * A distance along the axis moved so the point lands on the grid (`step`): the point's own coordinate on that
 * axis is rounded, not the distance, so the plate (height 0) and the grid lines stay in reach from any start.
 */
export function snapAxisDistance(origin: SpacePoint, direction: SpacePoint, distance: number, step: number): number {
  if (!(step > 0)) return distance;
  const start = dot(origin, direction);
  return Math.round((start + distance) / step) * step - start;
}

/** The point `distance` along the axis line from `origin`. */
export function pointOnAxis(origin: SpacePoint, direction: SpacePoint, distance: number): SpacePoint {
  return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
}
