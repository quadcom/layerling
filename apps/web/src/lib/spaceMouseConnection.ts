import { useSyncExternalStore } from "react";
import { NAVLIB_INFO_URL, navlibCommandTree, NavlibSession, navlibSocketUrl, parseNavlibInfo, type NavlibActionSet, type NavlibModel } from "@/lib/navlib";
import { DEFAULT_SPACEMOUSE_SETTINGS, parseSpaceMouseSettings, SPACEMOUSE_STORAGE_KEY, type SpaceMouseSettings } from "@/lib/spaceMouse";

/*
 * The browser side of the SpaceMouse: finds 3DxWare's local server, keeps one connection open while the page is
 * up, and tells 3DxWare whether Layerling is the window in front. A view that can be moved registers its
 * navigation model; the last one registered is moved (a sketch opened over the 3D view). Without 3DxWare the page
 * asks again only when its window comes to the front, at most every half minute, so nothing piles up.
 */

const APP_NAME = "Layerling";
const RETRY_GAP_MS = 30_000;

export type SpaceMouseState = "off" | "searching" | "connected" | "notFound";

export type SpaceMouseStatus = {
  state: SpaceMouseState;
  /** The 3DxWare server's version, once it answered. */
  serverVersion: string | null;
  error: string | null;
};

const SERVER_STATUS: SpaceMouseStatus = { state: "off", serverVersion: null, error: null };

let status: SpaceMouseStatus = SERVER_STATUS;
const statusListeners = new Set<() => void>();
let started = false;
let socket: WebSocket | null = null;
let session: NavlibSession | null = null;
let lastAttempt = -Infinity;
let connecting = false;
const models: NavlibModel[] = [];
const commandListeners = new Set<(id: string) => void>();
const commandSets = new Map<string, NavlibActionSet>();
let activeSet: string | null = null;
let sentCommands = "";

function setStatus(patch: Partial<SpaceMouseStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((listener) => listener());
}

function sendFocus() {
  if (session?.ready) session.update({ focus: document.hasFocus() && !document.hidden }).catch(() => undefined);
}

/** Sends the button panel's commands when they changed since the last time this connection sent them. */
function sendCommands() {
  if (!session?.ready || !commandSets.size) return;
  const sets = [...commandSets.values()];
  const signature = JSON.stringify([sets, activeSet]);
  if (signature === sentCommands) return;
  sentCommands = signature;
  session.update({ commands: { activeSet: activeSet ?? sets[0].id, tree: navlibCommandTree(sets) } }).catch(() => { sentCommands = ""; });
}

function closeConnection() {
  session?.close();
  session = null;
  sentCommands = "";
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  socket = null;
}

async function connect() {
  if (connecting || !currentSpaceMouseSettings().enabled || socket || typeof WebSocket === "undefined") return;
  connecting = true;
  try {
    await openConnection();
  } finally {
    connecting = false;
  }
}

async function openConnection() {
  lastAttempt = performance.now();
  setStatus({ state: "searching", error: null });
  let info: ReturnType<typeof parseNavlibInfo> = null;
  try {
    const response = await fetch(NAVLIB_INFO_URL, { cache: "no-store", headers: { Accept: "application/json" } });
    info = response.ok ? parseNavlibInfo(await response.text()) : null;
  } catch {
    info = null;
  }
  if (!info || !currentSpaceMouseSettings().enabled || socket) {
    if (!socket) setStatus({ state: currentSpaceMouseSettings().enabled ? "notFound" : "off" });
    return;
  }
  setStatus({ serverVersion: info.version });
  const opened = new WebSocket(navlibSocketUrl(info.port), ["wamp"]);
  socket = opened;
  session = new NavlibSession(APP_NAME, window.location.href, {
    send: (message) => { if (opened.readyState === WebSocket.OPEN) opened.send(JSON.stringify(message)); },
    model: () => models[models.length - 1] ?? null,
    ready: () => {
      setStatus({ state: "connected", error: null });
      sendFocus();
      sendCommands();
    },
    command: (id) => commandListeners.forEach((listener) => listener(id)),
    failed: (reason) => {
      setStatus({ error: reason });
      closeConnection();
      setStatus({ state: "notFound" });
    },
  });
  const current = session;
  opened.onmessage = (event) => current.handle(String(event.data));
  opened.onclose = () => {
    if (socket !== opened) return;
    closeConnection();
    setStatus({ state: currentSpaceMouseSettings().enabled ? "notFound" : "off" });
  };
}

function retrySoon() {
  if (!socket && currentSpaceMouseSettings().enabled && performance.now() - lastAttempt >= RETRY_GAP_MS) void connect();
}

/** Looks for 3DxWare once, and again whenever the window comes to the front. Safe to call often. */
export function startSpaceMouse() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("focus", () => {
    sendFocus();
    retrySoon();
  });
  window.addEventListener("blur", sendFocus);
  document.addEventListener("visibilitychange", sendFocus);
  void connect();
}

/** Looks again now, from the settings' button. */
export function retrySpaceMouse() {
  closeConnection();
  void connect();
}

/** Makes a view the one 3DxWare moves, until the returned function takes it back. */
export function registerSpaceMouseView(model: NavlibModel): () => void {
  models.push(model);
  return () => {
    const index = models.lastIndexOf(model);
    if (index >= 0) models.splice(index, 1);
  };
}

export function onSpaceMouseCommand(listener: (id: string) => void): () => void {
  commandListeners.add(listener);
  return () => { commandListeners.delete(listener); };
}

/**
 * Offers a bank of commands to 3DxWare's button panel and makes it the active one. Banks offered before stay in
 * the panel, so the buttons set for the 3D editor are still there after a sketch.
 */
export function offerSpaceMouseCommands(set: NavlibActionSet) {
  commandSets.set(set.id, set);
  activeSet = set.id;
  sendCommands();
}

export function useSpaceMouseStatus(): SpaceMouseStatus {
  return useSyncExternalStore(
    (listener) => { statusListeners.add(listener); return () => { statusListeners.delete(listener); }; },
    () => status,
    () => SERVER_STATUS,
  );
}

let settings: SpaceMouseSettings | null = null;
const settingsListeners = new Set<() => void>();

export function currentSpaceMouseSettings(): SpaceMouseSettings {
  if (settings) return settings;
  if (typeof window === "undefined") return DEFAULT_SPACEMOUSE_SETTINGS;
  try {
    settings = parseSpaceMouseSettings(JSON.parse(window.localStorage.getItem(SPACEMOUSE_STORAGE_KEY) ?? "null"));
  } catch {
    settings = parseSpaceMouseSettings(null);
  }
  return settings;
}

export function setSpaceMouseSettings(patch: Partial<SpaceMouseSettings>) {
  settings = parseSpaceMouseSettings({ ...currentSpaceMouseSettings(), ...patch });
  try {
    window.localStorage.setItem(SPACEMOUSE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the setting holds until the page is closed.
  }
  settingsListeners.forEach((listener) => listener());
  if (settings.enabled) {
    void connect();
  } else {
    closeConnection();
    setStatus({ state: "off", error: null });
  }
}

export function useSpaceMouseSettings(): SpaceMouseSettings {
  return useSyncExternalStore(
    (listener) => { settingsListeners.add(listener); return () => { settingsListeners.delete(listener); }; },
    currentSpaceMouseSettings,
    () => DEFAULT_SPACEMOUSE_SETTINGS,
  );
}
