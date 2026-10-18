import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { navlibCommandTree, NavlibSession, navlibSocketUrl, parseNavlibInfo, type NavlibModel } from "@/lib/navlib";
import { createNavlibCameraModel, type NavlibCameraHost } from "@/lib/navlibCamera";
import { createNavlibSketchModel } from "@/lib/navlibSketch";
import { isSpaceMouseViewCommand, parseSpaceMouseSettings, viewCommandFace } from "@/lib/spaceMouse";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A session wired to a list of sent messages, as the 3DxWare server would see them. */
function sessionWith(model: NavlibModel | null = null) {
  const sent: unknown[][] = [];
  const events = {
    send: (message: unknown[]) => { sent.push(message); },
    model: () => model,
    ready: vi.fn(),
    command: vi.fn(),
    failed: vi.fn(),
  };
  const session = new NavlibSession("Layerling", "http://localhost:3000/", events);
  const reply = (message: unknown[]) => session.handle(JSON.stringify(message));
  return { session, sent, events, reply };
}

/** Runs the handshake as 3DxWare 1.5 answered it on a real machine. */
async function connected(model: NavlibModel | null = null) {
  const wired = sessionWith(model);
  wired.reply([0, "session", 1, "Nl-Proxy v1.5.0.21893"]);
  await flush();
  const mouseCall = wired.sent.find((message) => message[0] === 2)!;
  wired.reply([3, mouseCall[1], { connexion: "mouse-1" }]);
  await flush();
  const controllerCall = wired.sent.filter((message) => message[0] === 2)[1];
  wired.reply([3, controllerCall[1], { instance: 236857590423 }]);
  await flush();
  return { ...wired, mouseCall, controllerCall };
}

describe("3DxWare's info page", () => {
  it("gives the socket's port, which need not be the info page's", () => {
    expect(parseNavlibInfo('{ "port" : 8182, "version" : "1.5.0.21893" }')).toEqual({ port: 8182, version: "1.5.0.21893" });
    expect(navlibSocketUrl(8182)).toBe("wss://127.51.68.120:8182/");
  });
  it("refuses anything else", () => {
    expect(parseNavlibInfo("<html>")).toBeNull();
    expect(parseNavlibInfo('{"port": "8182"}')).toBeNull();
    expect(parseNavlibInfo('{"port": 70000}')).toBeNull();
  });
});

describe("NavlibSession", () => {
  it("names the prefixes, then creates the mouse and the controller as 3DconnexionJS 0.8 does", async () => {
    const { sent, events, mouseCall, controllerCall } = await connected();
    expect(sent.slice(0, 3)).toEqual([
      [1, "3dx_rpc", "wss://127.51.68.120/3dconnexion#"],
      [1, "3dconnexion", "wss://127.51.68.120/3dconnexion"],
      [1, "self", "http://localhost:3000/"],
    ]);
    expect(mouseCall.slice(2)).toEqual(["3dx_rpc:create", "3dconnexion:3dmouse", "0.8.0"]);
    // A version as a number and nothing more: a richer controller was never answered.
    expect(controllerCall.slice(2)).toEqual(["3dx_rpc:create", "3dconnexion:3dcontroller", "mouse-1", { version: 0.8, name: "Layerling", rowMajorOrder: false }]);
    expect(sent.at(-1)).toEqual([5, "3dconnexion:3dcontroller/236857590423"]);
    expect(events.ready).toHaveBeenCalledTimes(1);
  });

  it("sends updates to its controller", async () => {
    const { session, sent } = await connected();
    void session.update({ focus: true });
    expect(sent.at(-1)?.slice(2)).toEqual(["3dx_rpc:update", "3dconnexion:3dcontroller/236857590423", { focus: true }]);
  });

  it("answers 3DxWare's reads and writes from the view's model", async () => {
    const model: NavlibModel = {
      read: (property) => (property === "view.perspective" ? true : property === "hit.lookat" ? null : undefined),
      write: (property) => property === "motion",
    };
    const { sent, reply } = await connected(model);
    const topic = "wss://127.51.68.120/3dconnexion3dcontroller/236857590423";
    reply([8, topic, [2, "r1", "self:read", "", "view.perspective"]]);
    reply([8, topic, [2, "r2", "self:read", "", "hit.lookat"]]);
    reply([8, topic, [2, "r3", "self:read", "", "nonsense"]]);
    reply([8, topic, [2, "w1", "self:update", "", "motion", true]]);
    reply([8, topic, [2, "w2", "self:update", "", "nonsense", 1]]);
    expect(sent.slice(-5)).toEqual([
      [3, "r1", true],
      [3, "r2", null],
      [4, "r3", "self:read#generic", "nonsense unknown property"],
      [3, "w1", null],
      [4, "w2", "self:update#generic", "nonsense unknown property"],
    ]);
  });

  it("passes a button's command on, but not its release", async () => {
    const { events, reply, sent } = await connected();
    reply([8, "topic", [2, "c1", "self:update", "", "commands.activeCommand", "LYL_DUPLICATE"]]);
    reply([8, "topic", [2, "c2", "self:update", "", "commands.activeCommand", ""]]);
    expect(events.command).toHaveBeenCalledTimes(1);
    expect(events.command).toHaveBeenCalledWith("LYL_DUPLICATE");
    expect(sent.slice(-2)).toEqual([[3, "c1", null], [3, "c2", null]]);
  });

  it("still answers the frame notes when no view is open", async () => {
    const { reply, sent } = await connected(null);
    reply([8, "topic", [2, "t1", "self:update", "", "transaction", 1]]);
    reply([8, "topic", [2, "t2", "self:read", "", "view.affine"]]);
    expect(sent.slice(-2)).toEqual([[3, "t1", null], [4, "t2", "self:read#generic", "view.affine no view"]]);
  });

  it("reports a failed handshake", async () => {
    const { reply, sent, events } = sessionWith();
    reply([0, "session", 1, "server"]);
    await flush();
    reply([4, sent.find((message) => message[0] === 2)![1], "error", "no device"]);
    await flush();
    expect(events.failed).toHaveBeenCalledTimes(1);
    expect(events.ready).not.toHaveBeenCalled();
  });
});

describe("navlibCommandTree", () => {
  it("builds banks, groups and commands as the button panel reads them, leaving empty groups out", () => {
    const tree = navlibCommandTree([{
      id: "Default",
      label: "Layerling",
      categories: [
        { id: "cat-view", label: "View", actions: [{ id: "view-fit", label: "Fit view" }] },
        { id: "cat-empty", label: "Nothing", actions: [] },
      ],
    }]);
    expect(tree).toEqual({ nodes: [{ id: "Default", label: "Layerling", type: 0, nodes: [
      { id: "cat-view", label: "View", type: 1, nodes: [{ id: "view-fit", label: "Fit view", description: "", type: 2 }] },
    ] }] });
  });
});

describe("view commands", () => {
  it("knows its own ids and the faces they turn to", () => {
    expect(isSpaceMouseViewCommand("view-top")).toBe(true);
    expect(isSpaceMouseViewCommand("view-fit")).toBe(true);
    expect(isSpaceMouseViewCommand("duplicate")).toBe(false);
    expect(viewCommandFace("view-top")).toBe("top");
    expect(viewCommandFace("view-fit")).toBeNull();
  });
  it("is on unless switched off", () => {
    expect(parseSpaceMouseSettings(null)).toEqual({ enabled: true });
    expect(parseSpaceMouseSettings({ enabled: false })).toEqual({ enabled: false });
  });
});

function cameraHost(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 6000)) {
  camera.position.set(0, 0, 300);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const target = new THREE.Vector3();
  const host: NavlibCameraHost & { pivot: THREE.Vector3 | null } = {
    pivot: null,
    camera: () => camera,
    target: () => target,
    zoomRange: () => ({ min: 0.01, max: 100 }),
    minDistance: () => 3,
    modelBox: () => new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 20, 10)),
    selectionBox: () => null,
    hitTest: (origin, direction) => (direction.z < 0 ? origin.clone().addScaledVector(direction, origin.z) : null),
    pointer: () => null,
    changed: vi.fn(),
    showPivot: (position) => { host.pivot = position; },
    moving: vi.fn(),
  };
  return { camera, target, host, model: createNavlibCameraModel(host) };
}

describe("the 3D view's model", () => {
  it("hands over the camera as a column-major camera-to-world matrix, in the navlib's own frame", () => {
    const { model } = cameraHost();
    expect(model.read("view.affine")).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 300, 1]);
    expect(model.read("coordinateSystem")).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(model.read("model.extents")).toEqual([-10, 0, -10, 10, 20, 10]);
    expect(model.read("selection.empty")).toBe(true);
    expect(model.read("view.perspective")).toBe(true);
    expect(model.read("view.fov")).toBeCloseTo(THREE.MathUtils.degToRad(38));
    expect(model.read("anything else")).toBeUndefined();
  });

  it("takes 3DxWare's camera back and keeps the target on its line of sight, as deep as 3DxWare's target", () => {
    const { model, camera, target, host } = cameraHost();
    model.write("transaction", 1);
    model.write("view.target", [5, 2, 0]);
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 2, 250, 1]);
    model.write("transaction", 0);
    expect(camera.position.toArray()).toEqual([5, 2, 250]);
    expect(target.x).toBeCloseTo(5);
    expect(target.y).toBeCloseTo(2);
    expect(target.z).toBeCloseTo(0);
    expect(host.changed).toHaveBeenCalled();
  });

  it("keeps the target where it was when 3DxWare names none, so a push forward comes closer, and the view upright when it rolls", () => {
    const { model, camera, target } = cameraHost();
    // Turned a quarter round the line of sight and 100 closer: the roll is dropped, up stays up.
    const rolled = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0, 200);
    model.write("transaction", 1);
    model.write("view.affine", rolled.toArray());
    expect(target.toArray().map((value) => Math.round(value))).toEqual([0, 0, 0]);
    expect(camera.position.z).toBe(200);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(up.y).toBeCloseTo(1);
  });

  it("stops a tilt at straight down, as the mouse does, rather than spinning round to come down on the back", () => {
    const { model, camera, target } = cameraHost();
    // Turned about the target until the camera is 10 degrees past the top, upside down.
    const tilted = (degrees: number) => {
      const turn = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degrees));
      return new THREE.Matrix4().makeTranslation(0, 0, 300).premultiply(turn).toArray();
    };
    model.write("view.affine", tilted(85));
    expect(camera.position.z).toBeGreaterThan(0);
    model.write("view.affine", tilted(100));
    const forward = camera.getWorldDirection(new THREE.Vector3());
    expect(forward.y).toBeCloseTo(-1, 5);
    // Still on the front side, looking the same way, and still round the target.
    expect(camera.position.z).toBeGreaterThan(0);
    expect(forward.z).toBeLessThan(0);
    expect(camera.position.y).toBeCloseTo(300, 0);
    expect(target.toArray().map((value) => Math.round(value) + 0)).toEqual([0, 0, 0]);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(up.z).toBeLessThan(0);
  });

  it("only pans and zooms a view held to one side: 3DxWare's turn is taken back about its pivot", () => {
    const { model, camera, target, host } = cameraHost();
    let locked = true;
    host.locked = () => locked;
    expect(model.read("view.rotatable")).toBe(true);
    // Turned 30 degrees about the target and moved 10 to the camera's right: only the move is kept.
    const turn = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(30));
    const turned = new THREE.Matrix4().makeTranslation(0, 0, 300).premultiply(turn).multiply(new THREE.Matrix4().makeTranslation(10, 0, 0));
    model.write("view.affine", turned.toArray());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    expect(forward.x).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(-1, 6);
    expect(camera.position.x).toBeCloseTo(10, 4);
    expect(camera.position.z).toBeCloseTo(300, 4);
    expect(target.z).toBeCloseTo(0, 4);
    locked = false;
    expect(model.read("view.rotatable")).toBe(true);
  });

  it("keeps a held top view's heading, which lookAt could not find", () => {
    const { model, camera, host } = cameraHost();
    camera.position.set(0, 300, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const before = camera.quaternion.clone();
    host.locked = () => true;
    model.write("view.affine", new THREE.Matrix4().compose(new THREE.Vector3(5, 300, 0), before, new THREE.Vector3(1, 1, 1)).toArray());
    expect(camera.quaternion.angleTo(before)).toBeCloseTo(0, 6);
    expect(camera.position.toArray().map((value) => Math.round(value))).toEqual([5, 300, 0]);
  });

  it("turns a twist near straight down into a spin round the vertical, not a swing over the top", () => {
    const { model, camera } = cameraHost();
    // Looking down 2 degrees off straight down, then twisted 5 degrees about the screen's up, as the cap does.
    const down = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(88));
    model.write("view.affine", new THREE.Matrix4().makeTranslation(0, 0, 300).premultiply(down).toArray());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const twist = new THREE.Quaternion().setFromAxisAngle(up, THREE.MathUtils.degToRad(5));
    const twisted = camera.quaternion.clone().premultiply(twist);
    const at = camera.position.clone().applyQuaternion(twist);
    model.write("view.affine", new THREE.Matrix4().compose(at, twisted, new THREE.Vector3(1, 1, 1)).toArray());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    // Still 2 degrees off straight down, and the heading turned by the 5 degrees of the twist, not by 68.
    expect(THREE.MathUtils.radToDeg(Math.acos(-forward.y))).toBeCloseTo(2, 4);
    expect(THREE.MathUtils.radToDeg(Math.atan2(-forward.x, -forward.z))).toBeCloseTo(5, 4);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).y).toBeCloseTo(0, 6);
  });

  it("takes 3DxWare's own Top, Front, Right... buttons as the view buttons of that side", () => {
    const { model, camera, host } = cameraHost();
    const faces: string[] = [];
    host.squareView = (face) => { faces.push(face); };
    const top = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 300, 0);
    model.write("view.affine", top.toArray());
    expect(faces).toEqual(["top"]);
    expect(camera.position.toArray()).toEqual([0, 0, 300]);
    // A pan with the cap in a view that is already square is only a pan.
    model.write("motion", true);
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 300, 1]);
    model.write("motion", false);
    // A last frame right after the motion is still part of it.
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 6, 0, 300, 1]);
    expect(faces).toEqual(["top"]);
    expect(camera.position.x).toBeCloseTo(6);
    // Away from a motion, the button of the side it is square to already is that button pressed again.
    const now = performance.now();
    vi.spyOn(performance, "now").mockReturnValue(now + 1000);
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 6, 0, 300, 1]);
    vi.restoreAllMocks();
    expect(faces).toEqual(["top", "front"]);
  });

  it("stops a tilt at straight up too", () => {
    const { model, camera } = cameraHost();
    const tilted = (degrees: number) => {
      const turn = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(degrees));
      return new THREE.Matrix4().makeTranslation(0, 0, 300).premultiply(turn).toArray();
    };
    model.write("view.affine", tilted(85));
    model.write("view.affine", tilted(95));
    const forward = camera.getWorldDirection(new THREE.Vector3());
    expect(forward.y).toBeCloseTo(1, 5);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(forward.z).toBeLessThan(0);
  });

  it("does not carry the target off when the zoom gets close: it stops at the surface ahead (the plate's limit held it back)", () => {
    const { model, target } = cameraHost();
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 3.5, 1]);
    expect(target.toArray()).toEqual([0, 0, 0]);
  });

  it("moves the target on to what lies ahead once it is passed", () => {
    const { model, target, host } = cameraHost();
    host.hitTest = (origin, direction) => origin.clone().addScaledVector(direction, 40);
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
    expect(target.toArray().map((value) => Math.round(value))).toEqual([0, 0, -50]);
  });

  it("zooms a flat view by its extents", () => {
    const flat = new THREE.OrthographicCamera(-150, 150, 100, -100, -9000, 9000);
    const { model } = cameraHost(flat);
    expect(model.read("view.perspective")).toBe(false);
    expect(model.read("view.extents")).toEqual([-150, -100, -9000, 150, 100, 9000]);
    model.write("view.extents", [-75, -50, -9000, 75, 50, 9000]);
    expect(flat.zoom).toBeCloseTo(2);
  });

  it("hit-tests along 3DxWare's ray and shows its pivot", () => {
    const { model, host } = cameraHost();
    model.write("hit.lookfrom", [3, 4, 300]);
    model.write("hit.direction", [0, 0, -1]);
    expect(model.read("hit.lookat")).toEqual([3, 4, 0]);
    model.write("hit.direction", [0, 0, 1]);
    expect(model.read("hit.lookat")).toBeNull();
    model.write("pivot.position", [1, 2, 3]);
    model.write("pivot.visible", true);
    expect(host.pivot?.toArray()).toEqual([1, 2, 3]);
    model.write("pivot.visible", false);
    expect(host.pivot).toBeNull();
  });
});

describe("the sketch's model", () => {
  const sketch = () => {
    let view = { zoom: 1, pan: { x: 10, z: 20 } };
    const model = createNavlibSketchModel({
      view: () => view,
      setView: (next) => { view = next; },
      visibleHalf: () => ({ width: 150 / view.zoom, height: 100 / view.zoom }),
      plate: () => ({ width: 300, depth: 200 }),
      pointer: () => null,
    });
    return { model, view: () => view };
  };

  it("is a flat view that does not turn, over the middle of the plate view", () => {
    const { model } = sketch();
    expect(model.read("view.rotatable")).toBe(false);
    expect(model.read("view.perspective")).toBe(false);
    // The plate's z runs down the screen, the navlib's y up it.
    expect(model.read("view.affine")).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, -20, 1000, 1]);
    expect(model.read("model.extents")).toEqual([-150, -100, -1, 150, 100, 1]);
  });

  it("slides and zooms the plate, inside the plate", () => {
    const { model, view } = sketch();
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, -30, 1000, 1]);
    expect(view().pan).toEqual({ x: 40, z: 30 });
    model.write("view.affine", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9999, 0, 1000, 1]);
    expect(view().pan.x).toBe(150);
    model.write("view.extents", [-75, -50, -2000, 75, 50, 2000]);
    expect(view().zoom).toBeCloseTo(2);
  });
});
