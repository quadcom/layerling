import { parseMeasurementInput } from "@/lib/measurementUnits";
import { selectWholeValue } from "@/lib/numberField";
import { currentWheelSettings, lengthFieldWheelStep, wheelNextValue, wheelTurn } from "@/lib/wheelValueStep";

type WheelKeys = { shift?: boolean; ctrl?: boolean; alt?: boolean };

/**
 * The step of one notch for a field without a wheel of its own. `data-wheel-step` says what it holds: "length"
 * takes the step from the settings (or a whole unit, a sixteenth for inches, on Auto), "off" keeps the wheel out,
 * a number is the step. Without it, a number field with a whole step takes that step, anything else a whole unit.
 */
export function anyFieldWheelStep(marker: string | undefined, stepAttribute: string | undefined, millimetersPerUnit: number): number | null {
  if (marker === "off") return null;
  if (marker === "length") return lengthFieldWheelStep(Math.abs(millimetersPerUnit - 25.4) < 1e-9 ? 1 / 16 : 1);
  const marked = marker === undefined ? Number.NaN : Number(marker);
  if (Number.isFinite(marked) && marked > 0) return marked;
  const step = stepAttribute === undefined ? Number.NaN : Number(stepAttribute);
  return Number.isFinite(step) && step >= 1 ? step : 1;
}

/** The text of a field after a notch, or null when what is in it is not a number. A comma stays a comma. */
export function steppedFieldText(text: string, notches: number, step: number, keys: WheelKeys, min?: number, max?: number): string | null {
  const current = parseMeasurementInput(text);
  if (!Number.isFinite(current)) return null;
  let next = wheelNextValue(current, notches, step, keys);
  if (min !== undefined && Number.isFinite(min)) next = Math.max(min, next);
  if (max !== undefined && Number.isFinite(max)) next = Math.min(max, next);
  const shown = String(next === 0 ? 0 : next);
  return text.includes(",") && !text.includes(".") ? shown.replace(".", ",") : shown;
}

function wheelableField(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return null;
  if (target.ownerDocument.activeElement !== target) return null;
  if (target.dataset.wheelStep !== undefined) return target;
  if (target.type === "number") return target;
  return target.type === "text" && (target.inputMode === "decimal" || target.inputMode === "numeric") ? target : null;
}

/**
 * The mouse wheel in every number field that has no wheel of its own: once clicked into, the number goes up or down
 * a step, ten with Shift, a tenth with Ctrl and a hundredth with Alt, as in the fields of the properties. Fields with
 * their own wheel handle it first and stop it; this listener is on the window, so it hears the turn last. The new
 * text goes in as if it were typed, so the field's own change handler takes it, and stays selected so typing replaces it.
 */
export function installWheelForNumberFields(win: Window): () => void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented) return;
    const input = wheelableField(event.target);
    const turn = wheelTurn(event);
    if (!input || turn === 0) return;
    const step = anyFieldWheelStep(input.dataset.wheelStep, input.step || undefined, currentWheelSettings().millimetersPerUnit);
    if (step === null) return;
    const numeric = input.type === "number";
    const next = steppedFieldText(
      input.value,
      turn < 0 ? 1 : -1,
      step,
      { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey },
      numeric && input.min !== "" ? Number(input.min) : undefined,
      numeric && input.max !== "" ? Number(input.max) : undefined,
    );
    if (next === null) return;
    event.preventDefault();
    if (valueSetter) valueSetter.call(input, next);
    else input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    win.requestAnimationFrame(() => {
      if (input.ownerDocument.activeElement === input) selectWholeValue(input);
    });
  };
  win.addEventListener("wheel", onWheel, { passive: false });
  return () => win.removeEventListener("wheel", onWheel);
}
