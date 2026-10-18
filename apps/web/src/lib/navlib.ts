/**
 * A 3Dconnexion SpaceMouse, through the 3DxWare driver's local server: the way Onshape does it, and it works in
 * every browser. 3DxWare does the moving itself, with the user's own speed, axes and buttons; the page answers its
 * questions about the camera and the model and takes the camera it hands back. This file is the protocol, without
 * the browser: `spaceMouseConnection.ts` opens the socket.
 *
 * The server speaks WAMP version 1 (JSON arrays) on a secure socket on the loopback address below. The port comes
 * from an info page. The page names prefixes, creates a "3D mouse" and a "3D controller" for its view, and listens
 * on the controller's topic, where 3DxWare's reads and writes of properties arrive as calls inside events.
 */

export const NAVLIB_HOST = "127.51.68.120";
export const NAVLIB_INFO_URL = `https://${NAVLIB_HOST}:8181/3dconnexion/nlproxy`;
/** The version of the client protocol the page speaks; the server answers older clients differently. */
export const NAVLIB_CLIENT_VERSION = "0.8.0";

export function navlibSocketUrl(port: number): string {
  return `wss://${NAVLIB_HOST}:${port}/`;
}

/** The socket's port from the info page, `{ "port" : 8182, "version" : "1.5.0.21893" }`. */
export function parseNavlibInfo(text: string): { port: number; version: string | null } | null {
  try {
    const parsed = JSON.parse(text) as { port?: unknown; version?: unknown };
    if (typeof parsed.port !== "number" || !Number.isInteger(parsed.port) || parsed.port <= 0 || parsed.port > 65535) return null;
    return { port: parsed.port, version: typeof parsed.version === "string" ? parsed.version : null };
  } catch {
    return null;
  }
}

const WELCOME = 0;
const PREFIX = 1;
const CALL = 2;
const CALL_RESULT = 3;
const CALL_ERROR = 4;
const SUBSCRIBE = 5;
const EVENT = 8;

const RPC_PREFIX_URI = `wss://${NAVLIB_HOST}/3dconnexion#`;
const RESOURCE_PREFIX_URI = `wss://${NAVLIB_HOST}/3dconnexion`;

/**
 * What a view answers. `read` gives `undefined` for a property the view does not know, and `null` is a real
 * answer ("nothing", say no hit). `write` gives false for a property it does not know.
 */
export type NavlibModel = {
  read(property: string): unknown;
  write(property: string, value: unknown): boolean;
};

/** One entry of 3DxWare's button panel. The id comes back when a button set to it is pressed. */
export type NavlibAction = { id: string; label: string; description?: string };
export type NavlibCategory = { id: string; label: string; actions: NavlibAction[] };
/** A bank of buttons; the one with the id "Default" shows no label of its own. */
export type NavlibActionSet = { id: string; label: string; categories: NavlibCategory[] };

const ACTION_SET_NODE = 0;
const CATEGORY_NODE = 1;
const ACTION_NODE = 2;

/** The tree 3DxWare's button panel reads: banks, groups, commands. */
export function navlibCommandTree(sets: readonly NavlibActionSet[]) {
  return {
    nodes: sets.map((set) => ({
      id: set.id,
      label: set.label,
      type: ACTION_SET_NODE,
      nodes: set.categories.filter((category) => category.actions.length).map((category) => ({
        id: category.id,
        label: category.label,
        type: CATEGORY_NODE,
        nodes: category.actions.map((action) => ({ id: action.id, label: action.label, description: action.description ?? "", type: ACTION_NODE })),
      })),
    })),
  };
}

export type NavlibSessionEvents = {
  send(message: unknown[]): void;
  /** The view 3DxWare is moving now, or null when none is open. */
  model(): NavlibModel | null;
  /** The controller is there: focus and commands can be sent. */
  ready(): void;
  /** A button set to one of the page's commands went down. */
  command(id: string): void;
  failed(reason: string): void;
};

type Pending = { resolve: (value: unknown) => void; reject: (reason: string) => void };

/**
 * One connection's conversation. It starts when the server's welcome arrives and is ready once the controller
 * exists. `handle` takes every message from the socket.
 */
export class NavlibSession {
  private readonly pending = new Map<string, Pending>();
  private counter = 0;
  private controller: string | null = null;

  constructor(
    private readonly appName: string,
    private readonly selfUri: string,
    private readonly events: NavlibSessionEvents,
  ) {}

  get ready(): boolean {
    return this.controller !== null;
  }

  handle(raw: string) {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(message)) return;
    const [type] = message;
    if (type === WELCOME) {
      void this.start();
    } else if (type === CALL_RESULT) {
      this.settle(String(message[1]), (pending) => pending.resolve(message[2]));
    } else if (type === CALL_ERROR) {
      this.settle(String(message[1]), (pending) => pending.reject(`${String(message[2])} ${String(message[3] ?? "")}`.trim()));
    } else if (type === EVENT && Array.isArray(message[2]) && message[2][0] === CALL) {
      this.answer(message[2] as unknown[]);
    }
  }

  /** Changes properties of the controller: `{ focus: true }`, `{ commands: { tree, activeSet } }`. */
  update(value: Record<string, unknown>): Promise<unknown> {
    if (!this.controller) return Promise.reject("not ready");
    return this.call("3dx_rpc:update", this.controllerUri(), value);
  }

  /** The socket is gone: every call still waiting fails. */
  close() {
    this.controller = null;
    this.pending.forEach((pending) => pending.reject("closed"));
    this.pending.clear();
  }

  private controllerUri() {
    return `3dconnexion:3dcontroller/${this.controller}`;
  }

  private async start() {
    this.events.send([PREFIX, "3dx_rpc", RPC_PREFIX_URI]);
    this.events.send([PREFIX, "3dconnexion", RESOURCE_PREFIX_URI]);
    this.events.send([PREFIX, "self", this.selfUri]);
    try {
      const mouse = await this.call("3dx_rpc:create", "3dconnexion:3dmouse", NAVLIB_CLIENT_VERSION) as { connexion?: unknown } | null;
      if (!mouse || mouse.connexion === undefined) throw "no 3D mouse";
      // The version is a number here, and nothing else may be in it: the server did not answer a richer one.
      const controller = await this.call("3dx_rpc:create", "3dconnexion:3dcontroller", mouse.connexion, {
        version: Number.parseFloat(NAVLIB_CLIENT_VERSION),
        name: this.appName,
        rowMajorOrder: false,
      }) as { instance?: unknown } | null;
      if (!controller || controller.instance === undefined) throw "no controller";
      this.controller = String(controller.instance);
      this.events.send([SUBSCRIBE, this.controllerUri()]);
      this.events.ready();
    } catch (reason) {
      this.events.failed(String(reason));
    }
  }

  private call(uri: string, ...args: unknown[]): Promise<unknown> {
    this.counter += 1;
    const id = `lyl${this.counter}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.events.send([CALL, id, uri, ...args]);
    });
  }

  private settle(id: string, run: (pending: Pending) => void) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    run(pending);
  }

  /** A read or write from 3DxWare: `[2, id, "self:read" | "self:update", _, property, value]`. */
  private answer(call: unknown[]) {
    const id = call[1];
    const method = String(call[2]);
    const property = String(call[4]);
    const refuse = (why: string) => this.events.send([CALL_ERROR, id, `${method}#generic`, `${property} ${why}`]);
    if (method.endsWith(":update")) {
      const value = call[5];
      if (property === "commands.activeCommand") {
        // The press, then an empty one when the button is let go.
        if (typeof value === "string" && value) this.events.command(value);
        this.events.send([CALL_RESULT, id, null]);
        return;
      }
      const model = this.events.model();
      // Without a view the frame and setting notes still need an answer, or 3DxWare waits for one.
      if (model ? model.write(property, value) : true) this.events.send([CALL_RESULT, id, null]);
      else refuse("unknown property");
    } else if (method.endsWith(":read")) {
      const model = this.events.model();
      const value = model ? model.read(property) : undefined;
      if (value === undefined) refuse(model ? "unknown property" : "no view");
      else this.events.send([CALL_RESULT, id, value]);
    } else {
      refuse("unknown procedure");
    }
  }
}
