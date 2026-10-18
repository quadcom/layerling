/**
 * The SpaceMouse settings and the view commands Layerling offers 3DxWare's button panel. The connection is in
 * `spaceMouseConnection.ts`, the protocol in `navlib.ts`.
 */

import type { ViewCubeFace } from "@/lib/viewCubeDrag";

export type SpaceMouseSettings = {
  /** Off, the page does not look for 3DxWare at all. */
  enabled: boolean;
};

export const DEFAULT_SPACEMOUSE_SETTINGS: SpaceMouseSettings = { enabled: true };

export const SPACEMOUSE_STORAGE_KEY = "layerling.spaceMouse";

export function parseSpaceMouseSettings(raw: unknown): SpaceMouseSettings {
  const candidate = raw && typeof raw === "object" ? raw as Partial<Record<keyof SpaceMouseSettings, unknown>> : {};
  return { enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : DEFAULT_SPACEMOUSE_SETTINGS.enabled };
}

/** The button banks: the 3D editor, and the sketch, which has commands of its own. */
export const SPACEMOUSE_SET_EDITOR = "Default";
export const SPACEMOUSE_SET_SKETCH = "Sketch";

/** Commands of the view itself, which the toolbar does not have; the views answer them. */
export const SPACEMOUSE_VIEW_FACES: readonly ViewCubeFace[] = ["front", "back", "left", "right", "top", "bottom"];

export type SpaceMouseViewCommand = "view-fit" | "view-home" | "view-projection" | `view-${ViewCubeFace}`;

export function isSpaceMouseViewCommand(id: string): id is SpaceMouseViewCommand {
  return id === "view-fit" || id === "view-home" || id === "view-projection"
    || SPACEMOUSE_VIEW_FACES.some((face) => id === `view-${face}`);
}

/** The view face a command turns to, or null for the others. */
export function viewCommandFace(id: SpaceMouseViewCommand): ViewCubeFace | null {
  const face = id.slice("view-".length);
  return (SPACEMOUSE_VIEW_FACES as readonly string[]).includes(face) ? face as ViewCubeFace : null;
}
