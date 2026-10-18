import { describe, expect, it } from "vitest";
import { anyFieldWheelStep, steppedFieldText } from "@/lib/wheelAnyField";
import {
  DEFAULT_WHEEL_DRAG_STEP,
  frameHandleOutward,
  lengthFieldWheelStep,
  normalizeWheelStep,
  pointCarriedAlong,
  pointTurnedAbout,
  setWheelSettings,
  wheelBaseStep,
  wheelLengthFieldStep,
  wheelNextValue,
  wheelNudgeAfterTurn,
  wheelTurn,
  wheelValueFactor,
} from "@/lib/wheelValueStep";
import { DEFAULT_WORKPLANE_WORKSPACE, normalizeWorkspaceSettings } from "@/lib/workplaneSettings";

describe("the mouse wheel in a number field (#226)", () => {
  it("reads the turn from deltaX when Shift makes a Mac report it sideways", () => {
    expect(wheelTurn({ deltaX: 0, deltaY: -100 })).toBe(-100);
    expect(wheelTurn({ deltaX: 0, deltaY: 100, shiftKey: true })).toBe(100);
    expect(wheelTurn({ deltaX: -60, deltaY: 0, shiftKey: true })).toBe(-60);
    // A sideways turn without Shift (a trackpad) is not a notch of this field.
    expect(wheelTurn({ deltaX: -60, deltaY: 0 })).toBe(0);
  });

  it("takes a coarse step with no key and finer or coarser ones with the keys", () => {
    expect(wheelValueFactor({})).toBe(1);
    expect(wheelValueFactor({ shift: true })).toBe(10);
    expect(wheelValueFactor({ ctrl: true })).toBe(0.1);
    expect(wheelValueFactor({ alt: true })).toBe(0.01);
    // Alt is the finest, whatever else is held.
    expect(wheelValueFactor({ alt: true, shift: true })).toBe(0.01);
  });

  it("steps a whole unit on a long range, a tenth on a short one, and sixteenths for inches", () => {
    expect(wheelBaseStep(0.5, 500, 0.01)).toBe(1);
    expect(wheelBaseStep(0, 360, 0.01)).toBe(1);
    expect(wheelBaseStep(0, 5, 0.01)).toBe(0.1);
    expect(wheelBaseStep(0, 1, 0.01)).toBe(0.01);
    expect(wheelBaseStep(3, 64, 1)).toBe(1);
    expect(wheelBaseStep(0.5, 500, 0.01, true)).toBe(1 / 16);
  });

  it("never steps finer than the field's own step", () => {
    expect(wheelBaseStep(0, 1, 0.25)).toBe(0.25);
  });

  it("adds the notches without float noise", () => {
    expect(wheelNextValue(24.5, 1, 1, {})).toBe(25.5);
    expect(wheelNextValue(24.5, -1, 1, { shift: true })).toBe(14.5);
    expect(wheelNextValue(32.9, -1, 1, { alt: true })).toBe(32.89);
    let value = 0;
    for (let index = 0; index < 10; index += 1) value = wheelNextValue(value, 1, 1, { ctrl: true });
    expect(value).toBe(1);
  });
});

describe("the wheel's steps from the settings", () => {
  it("starts at Auto for fields, 0.01 mm while dragging and 0.1 degrees while turning", () => {
    expect(DEFAULT_WORKPLANE_WORKSPACE.wheelFieldStep).toBe(0);
    expect(DEFAULT_WORKPLANE_WORKSPACE.wheelDragStep).toBe(0.01);
    expect(DEFAULT_WORKPLANE_WORKSPACE.wheelTurnStep).toBe(0.1);
  });

  it("keeps saved steps positive and sensible, and gives older settings the defaults", () => {
    expect(normalizeWorkspaceSettings({}).wheelDragStep).toBe(DEFAULT_WHEEL_DRAG_STEP);
    expect(normalizeWorkspaceSettings({ wheelDragStep: 0.05, wheelFieldStep: 0.5, wheelTurnStep: 1 })).toMatchObject({ wheelDragStep: 0.05, wheelFieldStep: 0.5, wheelTurnStep: 1 });
    expect(normalizeWheelStep(-1, 0.01)).toBe(0.0001);
    expect(normalizeWheelStep(-1, 0.5, true)).toBe(0);
    expect(normalizeWheelStep("x", 0.01)).toBe(0.01);
    expect(normalizeWheelStep(5000, 0.01)).toBe(1000);
  });

  it("uses the set length step in a length field, in the unit the field shows", () => {
    expect(wheelLengthFieldStep(1, 0)).toBe(1);
    expect(wheelLengthFieldStep(1, 0.05)).toBe(0.05);
    expect(wheelLengthFieldStep(1 / 16, 25.4, 25.4)).toBe(1);
    setWheelSettings({ fieldStep: 0.2, dragStep: 0.01, turnStep: 0.1, millimetersPerUnit: 1 });
    expect(lengthFieldWheelStep(1)).toBe(0.2);
    setWheelSettings({ fieldStep: 0, dragStep: 0.01, turnStep: 0.1, millimetersPerUnit: 1 });
    expect(lengthFieldWheelStep(1)).toBe(1);
  });
});

describe("the wheel while dragging or drawing", () => {
  it("adds a step a notch, up for longer, and the keys scale it as in a field", () => {
    expect(wheelNudgeAfterTurn(0, -100, 0.01, {})).toBe(0.01);
    expect(wheelNudgeAfterTurn(0.01, 100, 0.01, {})).toBe(0);
    expect(wheelNudgeAfterTurn(0, -100, 0.01, { shift: true })).toBe(0.1);
    expect(wheelNudgeAfterTurn(0.3, 0, 0.01, {})).toBe(0.3);
    let nudge = 0;
    for (let index = 0; index < 7; index += 1) nudge = wheelNudgeAfterTurn(nudge, -1, 0.01, {});
    expect(nudge).toBe(0.07);
  });

  it("carries a point further along its drag, or along X when it has not moved", () => {
    expect(pointCarriedAlong({ x: 0, z: 0 }, { x: 10, z: 0 }, 0.01)).toEqual({ x: 10.01, z: 0 });
    const diagonal = pointCarriedAlong({ x: 0, z: 0 }, { x: 3, z: 4 }, 5);
    expect(diagonal.x).toBeCloseTo(6);
    expect(diagonal.z).toBeCloseTo(8);
    expect(pointCarriedAlong({ x: 2, z: 2 }, { x: 2, z: 2 }, 1)).toEqual({ x: 3, z: 2 });
    expect(pointCarriedAlong({ x: 0, z: 0 }, { x: 5, z: 0 }, -1)).toEqual({ x: 4, z: 0 });
  });

  it("turns a point about the pivot and pushes a frame handle out from its edges", () => {
    const turned = pointTurnedAbout({ x: 0, z: 0 }, { x: 10, z: 0 }, 90);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.z).toBeCloseTo(10);
    expect(frameHandleOutward("e")).toEqual({ x: 1, z: 0 });
    expect(frameHandleOutward("nw")).toEqual({ x: -1, z: -1 });
    expect(frameHandleOutward("s")).toEqual({ x: 0, z: 1 });
  });
});

describe("the wheel in any other number field", () => {
  it("takes the length step, a whole unit, a marked step or none", () => {
    setWheelSettings({ fieldStep: 0, dragStep: 0.01, turnStep: 0.1, millimetersPerUnit: 1 });
    expect(anyFieldWheelStep("length", undefined, 1)).toBe(1);
    expect(anyFieldWheelStep("length", undefined, 25.4)).toBe(1 / 16);
    expect(anyFieldWheelStep("100", undefined, 1)).toBe(100);
    expect(anyFieldWheelStep("off", undefined, 1)).toBeNull();
    expect(anyFieldWheelStep(undefined, "10000", 1)).toBe(10000);
    expect(anyFieldWheelStep(undefined, "0.01", 1)).toBe(1);
    expect(anyFieldWheelStep(undefined, undefined, 1)).toBe(1);
  });

  it("steps the text in the field and keeps its decimal comma", () => {
    expect(steppedFieldText("12.5", 1, 1, {})).toBe("13.5");
    expect(steppedFieldText("12,5", -1, 1, { ctrl: true })).toBe("12,4");
    expect(steppedFieldText("0.5", -1, 1, {})).toBe("-0.5");
    expect(steppedFieldText("3", -1, 1, {}, 1, 10)).toBe("2");
    expect(steppedFieldText("1", -1, 1, {}, 1, 10)).toBe("1");
    expect(steppedFieldText("abc", 1, 1, {})).toBeNull();
    expect(steppedFieldText("1/2", 1, 1 / 16, {})).toBe("0.5625");
  });
});
