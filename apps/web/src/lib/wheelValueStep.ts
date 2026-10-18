/**
 * What a turn of the mouse wheel adds to a number field that has the keyboard focus (#226): one step of the
 * field, ten times as much with Shift, a tenth with Ctrl and a hundredth with Alt - coarse with no key, finer
 * towards the keys that sit next to each other at the corner of the keyboard.
 */
export function wheelValueFactor(keys: { shift?: boolean; ctrl?: boolean; alt?: boolean }): number {
  if (keys.alt) return 0.01;
  if (keys.ctrl) return 0.1;
  if (keys.shift) return 10;
  return 1;
}

/**
 * How far the wheel turned, as the browser reports it. With Shift held, macOS turns a vertical wheel into a
 * sideways one and reports the turn as deltaX with deltaY at 0, so the notch has to be read from deltaX then
 * (#226: Shift did nothing on a Mac while Ctrl and Alt worked).
 */
export function wheelTurn(event: { deltaX: number; deltaY: number; shiftKey?: boolean }): number {
  if (event.deltaY !== 0) return event.deltaY;
  return event.shiftKey ? event.deltaX : 0;
}

/**
 * The step of one wheel notch for a field whose slider runs from `min` to `max` in steps of `sliderStep`, in the
 * units the field shows: a whole unit on a long range (millimetres, degrees), a tenth on a short one, never finer
 * than the field's own step. An inch field steps in sixteenths.
 */
export function wheelBaseStep(min: number, max: number, sliderStep: number, inches = false): number {
  if (inches) return 1 / 16;
  const span = Math.abs(max - min);
  const natural = span >= 20 ? 1 : span >= 2 ? 0.1 : 0.01;
  return Math.max(Number.isFinite(sliderStep) && sliderStep > 0 ? sliderStep : 0, natural);
}

/** The value after `notches` wheel notches (positive up), without the float noise of repeated addition. */
export function wheelNextValue(current: number, notches: number, baseStep: number, keys: { shift?: boolean; ctrl?: boolean; alt?: boolean }): number {
  const next = current + notches * baseStep * wheelValueFactor(keys);
  return Math.round(next * 1e6) / 1e6;
}

/** A wheel notch while dragging: 0.01 mm, so the exact measure is easy to hit; Shift makes it 0.1 mm. */
export const DEFAULT_WHEEL_DRAG_STEP = 0.01;
/** A wheel notch while turning, in degrees. */
export const DEFAULT_WHEEL_TURN_STEP = 0.1;
const MIN_WHEEL_STEP = 0.0001;
const MAX_WHEEL_STEP = 1000;

/** A saved wheel step: a positive number within reason, or 0 (Auto) where that is allowed. */
export function normalizeWheelStep(value: unknown, fallback: number, allowAuto = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (allowAuto && value <= 0) return 0;
  return Math.min(MAX_WHEEL_STEP, Math.max(MIN_WHEEL_STEP, value));
}

/**
 * The step of one notch in a length field: the step set in the workspace settings, in the field's unit
 * (`millimetersPerUnit` millimetres each), or the field's own when that setting is Auto (0).
 */
export function wheelLengthFieldStep(autoStep: number, settingMm: number, millimetersPerUnit = 1): number {
  if (!(settingMm > 0)) return autoStep;
  return settingMm / (millimetersPerUnit > 0 ? millimetersPerUnit : 1);
}

export type WheelSettings = {
  /** Length fields, in millimetres; 0 is Auto. */
  fieldStep: number;
  /** Dragging and drawing, in millimetres. */
  dragStep: number;
  /** Turning, in degrees. */
  turnStep: number;
  /** Millimetres in one unit the fields show. */
  millimetersPerUnit: number;
};

// The workspace's steps, kept here like the length unit is, so every field and drag reads the same ones.
let wheelSettings: WheelSettings = { fieldStep: 0, dragStep: DEFAULT_WHEEL_DRAG_STEP, turnStep: DEFAULT_WHEEL_TURN_STEP, millimetersPerUnit: 1 };

export function setWheelSettings(next: WheelSettings) {
  wheelSettings = next;
}

export function currentWheelSettings(): WheelSettings {
  return wheelSettings;
}

/** The step of one notch in a length field shown in the workspace unit: the set step, or `autoStep` on Auto. */
export function lengthFieldWheelStep(autoStep: number): number {
  return wheelLengthFieldStep(autoStep, wheelSettings.fieldStep, wheelSettings.millimetersPerUnit);
}

/** What the wheel has added to a drag after one more notch (up adds, down takes away), scaled by the keys as in a field. */
export function wheelNudgeAfterTurn(nudge: number, turn: number, step: number, keys: { shift?: boolean; ctrl?: boolean; alt?: boolean }): number {
  if (turn === 0) return nudge;
  return wheelNextValue(nudge, turn < 0 ? 1 : -1, step, keys);
}

type PlanePoint = { x: number; z: number };

/** `point` carried `amount` further along the way from `origin` to it; standing on `origin`, along X. */
export function pointCarriedAlong(origin: PlanePoint, point: PlanePoint, amount: number): PlanePoint {
  if (amount === 0) return point;
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const length = Math.hypot(dx, dz);
  const ux = length > 1e-9 ? dx / length : 1;
  const uz = length > 1e-9 ? dz / length : 0;
  return { x: point.x + ux * amount, z: point.z + uz * amount };
}

/** `point` turned `degrees` about `pivot`, in the plane of the sketch. */
export function pointTurnedAbout(pivot: PlanePoint, point: PlanePoint, degrees: number): PlanePoint {
  if (degrees === 0) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  return { x: pivot.x + dx * cos - dz * sin, z: pivot.z + dx * sin + dz * cos };
}

/** Which way a frame handle pushes its edges out: east and south are plus, west and north minus. */
export function frameHandleOutward(handle: string): PlanePoint {
  return {
    x: handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0,
    z: handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0,
  };
}
