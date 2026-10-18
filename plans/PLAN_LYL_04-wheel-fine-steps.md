# PLAN_LYL_04 — Mouse wheel for fine steps: in number fields and while dragging a handle

**Status (2026-10-18):** **built and tested on branch `wheel-steps`** (Adrian: "Build 3 and 4, seperate
branches"), cut from `main` (upstream 1.91.0); 5 commits, not merged into `my-mod`, not pushed. Type check clean;
unit tests pass apart from the known `useRememberedFlag` failure under Node 26 (`guide.test.ts` timed out once under
load and passes alone); `tests/unit/wheelValueStep.test.ts` grew from 5 to 13 tests. Tried in headless Chromium on
the dev server: a sketch line being drawn grows 0.01 mm a notch (68.00 -> 68.03) and 0.1 mm with Shift (-> 68.23);
Z held + wheel zooms and the line stays in progress; a box's height handle dragged to 33.00 then 5 notches -> 33.05,
kept on release; a Properties field 20.00 -> 22.00 with two notches (Auto step).

What was built: the wheel in every clicked number field (length fields use the set step); the wheel during sketch
drags (point, line, selection, frame handles, turning, pictures) and while drawing a line or measurement, with
Z+wheel zooming; the wheel during 3D size, height, lift and turn handles and body drags; settings under
Measurement > Mouse wheel (field step Auto, drag 0.01 mm, turn 0.1°); English guide text and an unreleased What's
New entry.

**Changed from the plan (made while building):**
- Upstream 1.90/1.91 already has a shared `useWheelField` hook for the Edge, Split and Section panels. Those and the
  Properties panel keep their own handlers and take the length step setting; every other number field gets the
  wheel from one window listener (`lib/wheelAnyField.ts`). Length fields are marked `data-wheel-step="length"`,
  chosen by their labels; the ruler's "duplicate" box is the least certain one.
- Z+wheel zooms only in the sketch. In 3D the wheel never zooms while a handle or a body is held.
- Shift while dragging still also does what it did before (axis lock, keep proportions, 15° turns), so Shift for
  0.1 mm steps during a drag triggers those too.

**Not done / open:**
- Adrian to try it himself, especially the Ctrl/Alt steps, the 3D turn handle and the on-screen size boxes.
- Merge into `my-mod` - Adrian's OK (see "Both plans together" below).
- Upstream PR - Adrian's call. English text only in every language file for now.

**Both plans together:** `axis-lock` and `wheel-steps` both change `SketchWorkspace.tsx`, the sketch guide page and
`docs/whatsNew-unreleased.json`, so merging the second one will stop on conflicts there (a trial merge, 2026-10-18).
Both are built on upstream 1.91.0 while `my-mod` is on 1.89.0 with the SpaceMouse work, so merging either into
`my-mod` also brings the upstream update in. `npm install` is needed after (1.91 adds `qrcode-generator`).

## Goal

Asked for by Adrian, 2026-10-18, after Blender:
1. **Number fields:** click into any field that takes a number, turn the wheel, and the number goes up or down.
2. **Dragging a handle** (sketch or 3D sizes): while the handle is held, each wheel notch makes the length or
   distance a tiny bit longer or shorter (e.g. 0.01 mm), so the exact measure is easy to hit.
3. A setting for how big a wheel step is, for both.

## What Layerling already has (found 2026-10-18)

- **The wheel already works in the Properties panel's number fields** (upstream #226,
  `ShapeInspector.tsx` ~3975, `lib/wheelValueStep.ts`). Only after the field is clicked, so the panel still
  scrolls under a passing pointer. One notch = 1 mm on a long range, 0.1 on a short one, 1/16 in inches;
  **Shift ×10, Ctrl ×0.1, Alt ×0.01**. The value stays selected, so typing replaces it.
- No other number field has it: the on-screen size boxes in 3D (`TransformOverlay.tsx`,
  `MoveDimensionOverlay.tsx`), the sketch's boxes (`SketchWorkspace.tsx`, ~9 fields), the side panels
  (Edge modifier, Split, Mesh simplify, Icon tag), Workspace settings (~9 fields) and a few in
  `LayerlingEditor.tsx` / `WorkplaneViewport.tsx`.
- While dragging, the wheel zooms: the sketch (`handleWheel`, `SketchWorkspace.tsx` ~1294) and the 3D view
  (`onCameraWheel`).
- Handles in 3D: `scale` (4 corners, 4 side middles), `height`, `lift`, `rotate`; plus dragging the body
  itself to move it. In the sketch: dragging a point, a line, a selection, a selection's frame handle
  (`resize-selection`), turning a selection or an image.

## Design (proposed)

**Number fields (all of them).**
- One shared piece (`useWheelNumberField`) built from the Properties panel's code, so every field acts the same:
  the wheel works only after a click into the field, Shift/Ctrl/Alt multiply as now, the value stays selected.
- The Properties panel moves onto it too, so there is one way, not two.
- Fields that take a length use the length step from the setting below; angles and plain counts keep the
  field's own step (1° or 1 on a long range, 0.1 on a short one).

**While dragging a handle.**
- Each notch moves what is being dragged by one step: wheel up = longer / further, wheel down = shorter /
  back. Shift/Ctrl/Alt multiply here too.
- The wheel does not zoom while a handle is held; it zooms again once you let go.
- What a notch changes:

  | Being dragged | A notch changes |
  |---|---|
  | 3D side handle | that one size |
  | 3D corner handle | both sizes it holds, each by one step |
  | 3D height handle | the height |
  | 3D lift handle | the distance off the plate |
  | 3D body (moving it) | the position, along the axis it is moving on more |
  | 3D turn handle | the angle, by the angle step |
  | Sketch point, line or selection | the position, along the direction it has been dragged |
  | Sketch frame handle | the size that handle sets |
  | Sketch turning | the angle |

- The size label shown during the drag updates with each notch, so you see the exact value.
- The wheel's change rides on top of where the pointer is and is kept until you let go, even if the pointer
  moves again (Adrian, 2026-10-18).

**While drawing a sketch line** (line, smooth curve, bezier, sketch measure; after the first click, before the
next): a notch makes the line being drawn longer or shorter by one step, along its own direction, and is kept
until the next click. **Holding Z while turning the wheel zooms** there instead (Adrian, 2026-10-18, in place of
Shift), and the drawing stays active, so you can zoom in for precise placing. Shift, Ctrl and Alt keep their
step meaning (×10, ×0.1, ×0.01) while drawing too. Plain Z is free in the sketch. Plan 03 uses a *tap* of Z for
the height lock in 3D; a tap with no wheel turn in between is told apart from Z held while the wheel turns, so
the two can live together if Z-zoom is ever wanted in 3D.

**The setting.** In Workspace settings, a small "Mouse wheel" group:
- *Step in number fields (length):* Auto (today's 1 mm / 0.1 mm) or a number.
- *Step while dragging (length):* default **0.01 mm**.
- *Step while turning:* default 0.1°.
- Shown and typed in the unit the workspace uses (mm or in). Saved with the other workspace settings.

**Code.**
- `lib/wheelValueStep.ts`: grows the step settings and the "what does one notch add during a drag" maths
  (unit tested).
- `components/workplane/useWheelNumberField.ts` (new): the shared field behaviour.
- `SketchWorkspace.tsx` and `WorkplaneViewport.tsx`: during a drag, the wheel adds to a running offset that
  the drag applies after its own snapping.
- `WorkspaceSettingsModal.tsx`, `types/layerling.ts`: the three settings.
- Help text and a What's New line, English only for now (same as plan 03).

## Decisions (Adrian, 2026-10-18)

1. Step while dragging defaults to **0.01 mm**; Shift makes it 0.1 mm.
2. The wheel's change is **kept** until you let go, even if the mouse moves again.
3. **Yes**, the wheel also lengthens a sketch line while it is being drawn; **Z held + wheel zooms** there,
   keeping the drawing active (first said Shift, then changed to Z).

## Steps

1. Step maths and settings in `lib/wheelValueStep.ts`, with tests.
2. `useWheelNumberField`; move the Properties panel onto it; add it to every other number field.
3. Settings group in Workspace settings.
4. Sketch: wheel during drags and while drawing a line (Z held + wheel zooms there).
5. 3D: wheel during handle and body drags.
6. Help text and What's New.
7. Type check, unit tests, try it in the dev server (headless Chromium for 3D), hand to Adrian.

Branch `wheel-steps` cut from `main` (Adrian, 2026-10-18: feature branches come from `main` so each can go upstream as a PR), merged into `my-mod` on Adrian's OK.
