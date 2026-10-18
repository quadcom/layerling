import * as THREE from "three";
import type { NavlibModel } from "@/lib/navlib";

/**
 * The 3D view as 3DxWare sees it (see `navlib.ts`): the camera, the model's box, the selection's box and hit
 * testing, in the world's own coordinates. Layerling and 3DxWare agree on them: y up, and the front camera looks
 * down -z, so the coordinate system and the front view are both the identity.
 *
 * 3DxWare hands back whole camera matrices. The view keeps its up at the top (the orbit controls do), so a roll
 * of the cap is dropped, and the orbit target is kept on the camera's line of sight: at the depth 3DxWare names
 * as its target, or else at the depth the old target lies at, so a push forward comes closer to it. Once that is
 * nearly as close as the view may come, the target moves on to what lies ahead, as the wheel does: the zoom goes
 * right up to the model. Carrying the target along instead ran it off the plate, and the plate's limit on the
 * target then held the camera back. While a view button holds the view to its side, 3DxWare only pans and zooms.
 */
export type NavlibCameraHost = {
  camera(): THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /** The orbit target; moved in place. */
  target(): THREE.Vector3;
  zoomRange(): { min: number; max: number };
  /** How close the normal view may come to its target. */
  minDistance(): number;
  /** The view is held to one side: 3DxWare may pan and zoom it, not turn it. */
  locked?(): boolean;
  modelBox(): THREE.Box3 | null;
  selectionBox(): THREE.Box3 | null;
  /** The nearest point of the model (or of the selection) on a ray, or null. */
  hitTest(origin: THREE.Vector3, direction: THREE.Vector3, selectionOnly: boolean): THREE.Vector3 | null;
  /** Where the mouse pointer is, from -1 to 1 across the view, or null when it is not over it. */
  pointer(): { x: number; y: number } | null;
  /** The camera or the target changed. */
  changed(): void;
  /** 3DxWare's pivot marker: where, or null to hide it. */
  showPivot(position: THREE.Vector3 | null): void;
  /** 3DxWare starts or stops moving the view. */
  moving(active: boolean): void;
};

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const PLANE_UP = Object.freeze([0, 1, 0, 0]);

const boxArray = (box: THREE.Box3) => [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];

function isVector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isMatrix(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 16 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

/** How close to straight down or straight up the view may tilt, as `layerlingOrbitView` allows. */
const TILT_LIMIT = 1e-3;

/**
 * The line of sight 3DxWare's camera must keep to, or null when it is fine as it is. Tilted past straight down
 * (or up), 3DxWare's camera ends up upside down, and keeping up at the top would then spin the view round to the
 * other side. The mouse stops at the top; so does the cap: the view stays just short of it, facing the way it did.
 */
function limitTilt(before: THREE.Vector3, after: THREE.Vector3, rotation: THREE.Quaternion): THREE.Vector3 | null {
  const level = (vector: THREE.Vector3) => new THREE.Vector3(vector.x, 0, vector.z);
  const headingBefore = level(before);
  const headingAfter = level(after);
  // Upside down, past the top: it faces back the way it came. A roll alone leaves the line of sight where it was.
  const over = Math.abs(after.y) > 0.5 && after.y * before.y > 0 && headingAfter.dot(headingBefore) < 0;
  const steepest = Math.cos(TILT_LIMIT);
  if (!over && Math.abs(after.y) <= steepest) return null;
  // Facing the way it did; straight down or up has no heading of its own, but the top of the picture has.
  let heading = over ? headingBefore : headingAfter;
  if (heading.lengthSq() < 1e-12) {
    const up = level(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation));
    heading = after.y < 0 ? up : up.negate();
  }
  if (heading.lengthSq() < 1e-12) heading = headingBefore.lengthSq() > 1e-12 ? headingBefore : new THREE.Vector3(0, 0, -1);
  heading.normalize().multiplyScalar(Math.sin(TILT_LIMIT));
  return heading.setY(Math.sign(after.y || before.y || -1) * steepest);
}

export function createNavlibCameraModel(host: NavlibCameraHost): NavlibModel {
  const hit = { from: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), selectionOnly: false };
  let pendingTarget: THREE.Vector3 | null = null;
  let pivot: THREE.Vector3 | null = null;

  const fallbackBox = () => new THREE.Box3(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 50, 50));

  const read = (property: string): unknown => {
    const camera = host.camera();
    switch (property) {
      case "view.affine":
        camera.updateMatrixWorld();
        return Array.from(camera.matrixWorld.elements);
      case "view.perspective":
        return camera instanceof THREE.PerspectiveCamera;
      case "view.fov":
        return camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.getEffectiveFOV()) : THREE.MathUtils.degToRad(38);
      case "view.frustum": {
        if (!(camera instanceof THREE.PerspectiveCamera)) return null;
        const halfHeight = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
        const halfWidth = halfHeight * camera.aspect;
        return [-halfWidth, halfWidth, -halfHeight, halfHeight, camera.near, camera.far];
      }
      case "view.extents": {
        if (camera instanceof THREE.OrthographicCamera) {
          const halfWidth = (camera.right - camera.left) / (2 * camera.zoom);
          const halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
          return [-halfWidth, -halfHeight, -camera.far, halfWidth, halfHeight, camera.far];
        }
        // What the normal view shows at the target's depth.
        const depth = camera.position.distanceTo(host.target());
        const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
        return [-halfHeight * camera.aspect, -halfHeight, -camera.far, halfHeight * camera.aspect, halfHeight, camera.far];
      }
      case "view.target":
        return host.target().toArray();
      case "view.rotatable":
        return !host.locked?.();
      case "view.constructionPlane":
      case "model.floorPlane":
        return [...PLANE_UP];
      case "model.extents":
        return boxArray(host.modelBox() ?? fallbackBox());
      case "model.unitsToMeters":
        return 0.001;
      case "coordinateSystem":
      case "views.front":
      case "selection.affine":
        return [...IDENTITY];
      case "selection.empty":
        return !host.selectionBox();
      case "selection.extents":
        return boxArray(host.selectionBox() ?? host.modelBox() ?? fallbackBox());
      case "pivot.position":
        return (pivot ?? host.target()).toArray();
      case "pivot.user":
        return false;
      case "hit.lookat": {
        const point = host.hitTest(hit.from.clone(), hit.direction.clone().normalize(), hit.selectionOnly);
        return point ? point.toArray() : null;
      }
      case "pointer.position": {
        const at = host.pointer() ?? { x: 0, y: 0 };
        camera.updateMatrixWorld();
        return new THREE.Vector3(at.x, at.y, -1).unproject(camera).toArray();
      }
      case "frame.timingSource":
        return 0;
      case "frame.time":
        return performance.now();
      default:
        return undefined;
    }
  };

  const applyAffine = (matrix: number[]) => {
    const camera = host.camera();
    const target = host.target();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    new THREE.Matrix4().fromArray(matrix).decompose(position, rotation, new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
    // A view held to one side keeps its turn: 3DxWare's is taken back about its pivot, its pan and zoom stay.
    const held = host.locked?.() ? camera.quaternion.clone() : null;
    const limited = held ? null : limitTilt(camera.getWorldDirection(new THREE.Vector3()), forward, rotation);
    if (held) {
      const back = held.clone().multiply(rotation.clone().invert());
      const about = pivot ?? target;
      position.sub(about).applyQuaternion(back).add(about);
      forward.set(0, 0, -1).applyQuaternion(held);
    } else if (limited) {
      // The turn back to the limit goes round the pivot 3DxWare turned about, so what it turned about stays put.
      const back = new THREE.Quaternion().setFromUnitVectors(forward, limited);
      const about = pivot ?? target;
      position.sub(about).applyQuaternion(back).add(about);
      forward.copy(limited);
    }
    const depthOf = (point: THREE.Vector3) => point.clone().sub(position).dot(forward);
    const closest = host.minDistance();
    let depth = pendingTarget && depthOf(pendingTarget) > 1e-6 ? depthOf(pendingTarget) : depthOf(target);
    if (!(depth > closest * 1.5)) {
      // Nearly at the target, or past it: aim at what lies further ahead. Right at a surface the camera stops
      // there; with nothing ahead at all the target goes along, as before.
      const ahead = host.hitTest(position.clone(), forward.clone(), false);
      const aheadDepth = ahead ? depthOf(ahead) : 0;
      if (aheadDepth > closest * 1.5) depth = aheadDepth;
      else if (ahead) depth = Math.max(depth, closest);
      else depth = Math.max(camera.position.distanceTo(target), closest);
    }
    target.copy(position).addScaledVector(forward, depth);
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    // Straight down or up has no heading of its own for lookAt to find: a held top view keeps the one it has.
    if (held) camera.quaternion.copy(held);
    else camera.lookAt(target);
    camera.updateMatrixWorld();
    host.changed();
  };

  const write = (property: string, value: unknown): boolean => {
    switch (property) {
      case "view.affine":
        if (isMatrix(value)) applyAffine(value);
        return true;
      case "view.target":
        if (isVector(value)) pendingTarget = new THREE.Vector3(value[0], value[1], value[2]);
        return true;
      case "view.extents": {
        const camera = host.camera();
        if (camera instanceof THREE.OrthographicCamera && Array.isArray(value) && value.length === 6) {
          const halfHeight = (Number(value[4]) - Number(value[1])) / 2;
          if (halfHeight > 0) {
            const range = host.zoomRange();
            camera.zoom = THREE.MathUtils.clamp((camera.top - camera.bottom) / (2 * halfHeight), range.min, range.max);
            camera.updateProjectionMatrix();
            host.changed();
          }
        }
        return true;
      }
      case "view.fov":
        // The field of view stays the app's own; 3DxWare zooms a normal view by moving the camera.
        return true;
      case "pivot.position":
        if (isVector(value)) pivot = new THREE.Vector3(value[0], value[1], value[2]);
        return true;
      case "pivot.visible":
        host.showPivot(value === true ? (pivot ?? host.target()).clone() : null);
        return true;
      case "hit.lookfrom":
        if (isVector(value)) hit.from.set(value[0], value[1], value[2]);
        return true;
      case "hit.direction":
        if (isVector(value)) hit.direction.set(value[0], value[1], value[2]);
        return true;
      case "hit.selectionOnly":
        hit.selectionOnly = value === true;
        return true;
      case "hit.aperture":
      case "selection.affine":
      case "settings.changed":
      case "events.keyPress":
      case "events.keyRelease":
        return true;
      case "transaction":
        // A new frame begins: a target from the last one no longer counts.
        if (typeof value === "number" && value > 0) pendingTarget = null;
        return true;
      case "motion":
        if (value !== true) pendingTarget = null;
        host.moving(value === true);
        return true;
      default:
        return false;
    }
  };

  return { read, write };
}
