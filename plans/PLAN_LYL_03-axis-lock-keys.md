# PLAN_LYL_03 — Lock a drag to one axis with the X, Y and Z keys

**Status (2026-10-18):** **building** on branch `axis-lock` (Adrian: "Build 3 and 4, seperate branches").

## Goal

While drawing or dragging, a tap on X, Y or Z holds the move to that axis, as in Blender. Asked for by Adrian,
2026-10-18:
- Sketch: a line drawn from a point should be able to go exactly level; today the grid snap can leave it at a
  slight angle.
- 3D tape measure: to measure the height of a part, click its corner and then lock to Z, so the second point
  goes straight up or down to the plate instead of catching whatever face is under the pointer. Same when
  dragging an end of a measurement that is already there.

## What Layerling already has (found 2026-10-18)

- Sketch, **Shift while drawing** (line, smooth curve, bezier, sketch measure): the new line turns to the nearest
  15°, so level and upright are among the choices (`constrainDrawing` -> `constrainToAngle`,
  `SketchWorkspace.tsx` ~1013, `lib/sketchPolar.ts`). The What's New list announced it; Adrian may not know it.
- Sketch, **Shift while dragging** a point, a line or a selection: the move stays on whichever axis it follows
  more (`constrainToAxis`, `lib/sketchSelection.ts:97`).
- 3D, **Shift while dragging a body**: the move stays on X or Y of the plate (`dragAxisLock`,
  `WorkplaneViewport.tsx` ~12423).
- 3D tape measure: **no lock at all.** A point catches, in order: tape points, reference points, tape lines,
  the model (corner, edge, face), then the plate on the grid (`resolveTapeCandidate`, `WorkplaneViewport.tsx`
  ~5076). Dragging a tape end uses the same catch.
- Plain X, Y and Z keys are not used anywhere (only Ctrl+X/Y/Z: cut, redo, undo), so they are free.
- Names the user sees: X = width, Y = depth, Z = height. Inside the code the 3D view's height is `y` and the
  plate's depth is `z`; the sketch's two axes are `x` and `z`, shown as X and Y.

## Design (proposed)

**The keys.** While a line or measurement is being drawn (after the first click) or a drag is held:
- Tap X, Y or Z: lock to that axis. Tap the same key again: unlock. Tap another: switch.
- The lock ends when the point is placed or the drag lets go, so the next line starts free.
- Shift keeps working as it does now. A key lock wins over Shift.
- In a sketch, Z does nothing (the sketch is flat).

**What you see.** A thin line along the locked axis through the start point, in the axis colour Layerling
already uses, and a small badge: "Locked to Z — press Z to free".

**Sketch.** The new point keeps the start point's other coordinate exactly: lock X and the line is level, lock Y
and it is upright. The length still snaps to the grid (and to corners of bodies shown underneath, along the
axis). Covers line, smooth curve, bezier and the sketch measure tool while drawing, and dragging points, lines
and selections.

**3D tape measure.** The second point is held on the line through the first point along the axis:
- Whatever the pointer would catch now (a corner, an edge, a face, the plate) gives only its position along
  the axis. Point at the plate anywhere and the end lands at plate height, straight above or below the corner;
  point at another part's top corner and it lands at that height.
- Over empty space, the end goes to the point on the axis nearest the pointer, on the grid.
- Dragging an existing end: the lock line runs through where that end started.
- The measurement shown is the straight distance, which is then the height (or width or depth) itself.

**Code.**
- `lib/axisLock.ts` (new, pure, unit tested): which key means which axis, toggling, and the two maths helpers
  (keep one coordinate of a sketch point; nearest point on a 3D axis to a pointer ray, and a caught point's
  position along an axis).
- `SketchWorkspace.tsx`: a lock state, the key listener next to the Shift one (~1410), applied where
  `constrainDrawing` and `constrainToAxis` are applied now.
- `WorkplaneViewport.tsx`: a lock state for tape mode, the key listener with the others (~8670), applied at the
  end of `resolveTapeCandidate` when a start point is set or an end is being dragged; the axis line and badge
  drawn with the tape overlay.
- Help text: the tape tool's help, the sketch guide entries, and a What's New line. English first; the other
  14 languages get the English text unless Adrian wants translations.

## Decisions (Adrian, 2026-10-18)

1. Body drags in 3D take X and Y too (same as Shift, but chosen). Z (lifting a body while dragging) is left out.
2. Tap to lock, tap the same key again to free, as in Blender.
3. New help text in English only for now; the other 14 languages get the English text.

## Steps

1. `lib/axisLock.ts` and its tests.
2. Sketch: keys, lock, badge, axis line.
3. 3D tape: keys, lock while placing and while dragging an end, axis line, badge.
4. Body drags: X and Y.
5. Help text and What's New.
6. Type check, unit tests, then try it in the dev server (headless Chromium for the 3D view) and hand it to
   Adrian to try.

Branch `axis-lock` cut from `my-mod`, merged into `my-mod` on Adrian's OK.
