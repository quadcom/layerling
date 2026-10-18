import type { NavlibModel } from "@/lib/navlib";
import { SKETCH_MANUAL_MAX_ZOOM, SKETCH_MIN_ZOOM, type SketchView } from "@/lib/sketchPointerControls";

/**
 * The sketch plate as 3DxWare sees it: a flat view that does not turn, so the cap only slides and zooms it.
 * Its world is the screen's: x to the right as on the plate, y up, which is the plate's -z. The camera hangs over
 * the middle of the view (the view's pan) and looks straight down; the visible height is the zoom.
 */
export type NavlibSketchHost = {
  /** The view as it is now, also right after a write that React has not drawn yet. */
  view(): SketchView;
  setView(next: SketchView): void;
  /** Half the visible width and height in plate units, or null before the plate is on the screen. */
  visibleHalf(): { width: number; height: number } | null;
  plate(): { width: number; depth: number };
  /** The plate point under the mouse pointer, or null. */
  pointer(): { x: number; z: number } | null;
};

const CAMERA_HEIGHT = 1000;
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createNavlibSketchModel(host: NavlibSketchHost): NavlibModel {
  const hit = { from: [0, 0, CAMERA_HEIGHT], direction: [0, 0, -1] };

  const plateBox = () => {
    const { width, depth } = host.plate();
    return [-width / 2, -depth / 2, -1, width / 2, depth / 2, 1];
  };

  const read = (property: string): unknown => {
    const view = host.view();
    switch (property) {
      case "view.affine":
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, view.pan.x, -view.pan.z, CAMERA_HEIGHT, 1];
      case "view.perspective":
      case "view.rotatable":
      case "pivot.user":
        return false;
      case "view.extents": {
        const half = host.visibleHalf() ?? { width: host.plate().width / 2, height: host.plate().depth / 2 };
        return [-half.width, -half.height, -2 * CAMERA_HEIGHT, half.width, half.height, 2 * CAMERA_HEIGHT];
      }
      case "view.target":
      case "pivot.position":
        return [view.pan.x, -view.pan.z, 0];
      case "view.constructionPlane":
        return [0, 0, 1, 0];
      case "view.fov":
        return 0.66;
      case "view.frustum":
      case "model.floorPlane":
        return null;
      case "coordinateSystem":
      case "views.front":
      case "selection.affine":
        return [...IDENTITY];
      case "model.extents":
      case "selection.extents":
        return plateBox();
      case "model.unitsToMeters":
        return 0.001;
      case "selection.empty":
        return true;
      case "hit.lookat": {
        // Where the ray meets the plate.
        const [fx, fy, fz] = hit.from;
        const [dx, dy, dz] = hit.direction;
        if (Math.abs(dz) < 1e-9) return null;
        const along = -fz / dz;
        return along >= 0 ? [fx + dx * along, fy + dy * along, 0] : null;
      }
      case "pointer.position": {
        const at = host.pointer();
        return at ? [at.x, -at.z, CAMERA_HEIGHT] : [view.pan.x, -view.pan.z, CAMERA_HEIGHT];
      }
      case "frame.timingSource":
        return 0;
      case "frame.time":
        return performance.now();
      default:
        return undefined;
    }
  };

  const write = (property: string, value: unknown): boolean => {
    const numbers = Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? value as number[] : null;
    switch (property) {
      case "view.affine": {
        if (!numbers || numbers.length !== 16) return true;
        const view = host.view();
        const { width, depth } = host.plate();
        host.setView({ ...view, pan: { x: clamp(numbers[12], -width / 2, width / 2), z: clamp(-numbers[13], -depth / 2, depth / 2) } });
        return true;
      }
      case "view.extents": {
        const half = host.visibleHalf();
        if (!numbers || numbers.length !== 6 || !half) return true;
        const nextHalfHeight = (numbers[4] - numbers[1]) / 2;
        if (!(nextHalfHeight > 0)) return true;
        const view = host.view();
        host.setView({ ...view, zoom: clamp(view.zoom * (half.height / nextHalfHeight), SKETCH_MIN_ZOOM, SKETCH_MANUAL_MAX_ZOOM) });
        return true;
      }
      case "hit.lookfrom":
        if (numbers && numbers.length >= 3) hit.from = numbers.slice(0, 3);
        return true;
      case "hit.direction":
        if (numbers && numbers.length >= 3) hit.direction = numbers.slice(0, 3);
        return true;
      case "view.target":
      case "view.fov":
      case "pivot.position":
      case "pivot.visible":
      case "hit.aperture":
      case "hit.selectionOnly":
      case "selection.affine":
      case "settings.changed":
      case "events.keyPress":
      case "events.keyRelease":
      case "transaction":
      case "motion":
        return true;
      default:
        return false;
    }
  };

  return { read, write };
}
