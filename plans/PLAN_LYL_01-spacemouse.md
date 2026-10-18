# PLAN_LYL_01 — SpaceMouse (NDOF) support

**Status (2026-10-18):** **built and working** — tried by Adrian in Firefox with his SpaceMouse through 3DxWare:
motion, Layerling commands on buttons, and zoom right up to the model (after the zoom fix below). Committed on
branch `spacemouse` and merged into `my-mod` (Adrian's OK, 2026-10-18). Type check clean; 20 unit tests pass; full suite passes
except `useRememberedFlag.test.ts`, which fails the same way on the untouched code (Node 26).

**Not done / open:**
- Running the fork on Adrian's own server: it runs the upstream image; an image built from `my-mod` is needed
  (Adrian, 2026-10-18: yes, plan it — next plan).
- Upstream PR to henmedia/layerling — Adrian's call.
- Not tried (Adrian will test the flat view and Chrome himself): the flat (O) view and the sketch with the cap; a Chrome page served from the LAN (Chrome may ask for
  "local network access" before it lets the page reach 127.51.68.120).
- Known limits: roll is dropped (the view keeps up at the top); labels with a number ("Show 3 hidden") refresh
  only on a mode or language change; no command icons sent to 3DxWare; no guide page.

## Goal

A 3Dconnexion SpaceMouse moves the view in Layerling: all six motions of the cap in the 3D view, pan and zoom
in a 2D sketch, and the buttons do view commands. Asked for by Adrian, 2026-10-18 (first mod of his fork).

## Decisions (Adrian, 2026-10-18)

- Device: SpaceMouse Pro or Enterprise on Windows, 3DxWare driver installed.
- Read it with **WebHID** (Chrome and Edge only; Firefox and Safari have no WebHID). No 3Dconnexion SDK: its JS
  library is not open source and Layerling is AGPL.
- WebHID needs a secure page, so Adrian put his Layerling behind HTTPS (2026-10-18). (Later moot: the 3DxWare
  route below needs no HTTPS.)
- Motion: a setting for "move the object" (default, like 3DxWare) and "move the camera" (all directions reversed).

## Design

- `apps/web/src/lib/spaceMouse.ts` — pure code, unit tested: device filter, reading the HID reports
  (report 1 = move, 6 or 12 bytes; report 2 = turn; report 3 = button bits), the button-to-command table,
  the settings and their storage, and the step a frame takes from the cap's position.
- `apps/web/src/lib/spaceMouseDevice.ts` — the browser side: `navigator.hid`, reconnects a device granted
  before, keeps the latest cap position, sends button presses, and a React hook for the settings page.
  Motion stops when the window loses focus or the tab is hidden.
- 3D view (`WorkplaneViewport.tsx`): each animation frame turns the cap position into pan, zoom (toward the
  pivot; the pivot first moves to the depth of what is in the middle of the screen, as the wheel does), spin
  around the vertical and tilt. Roll is ignored: the view keeps "up" up, like the rest of the app. No motion
  while the camera controls are switched off (a drag in progress) or a sketch is open.
- Sketch (`SketchWorkspace.tsx`): left/right and up/down pan, push/pull zooms.
- Buttons (Pro bit numbers): Menu (0) opens the SpaceMouse settings, Fit (1) = F, T (2) top, R (4) right,
  F (5) front, 1 (12) home view, 2 (13) flat/perspective, 3 (14) left, 4 (15) back, rotation lock (26)
  toggles turning off. Esc, Alt, Shift, Ctrl and roll are left to 3DxWare, which sends them as keys.
- Settings: a new "SpaceMouse" section in the workspace settings: connect button, status, speed, object/camera
  mode, turning on/off, invert each of the five used axes, and a live readout of the axes and buttons
  (to check the axis directions and the Enterprise's buttons).
- Words in English and every language marked complete.

## Open

- Axis signs follow spacenavd's notes on the raw HID data; checked only on a real device. The invert toggles
  cover a wrong sign.
- Whether Chrome gets the reports with 3DxWare running on Windows. If not, the fallback is 3DxWare's local
  WebSocket (navlib) — a much bigger job.
- The Enterprise's extra buttons may use another report; the live readout will show it.
- 3DxWare's own profile for Chrome may also scroll or zoom the page; it may need turning off for Chrome.
- Not done: a guide page, remapping buttons, upstream PR (Adrian's call).

## Firefox (Adrian, 2026-10-18)

Adrian uses Firefox, which has no WebHID. A Firefox add-on cannot read HID either; it would need a helper
program through native messaging. Unconfirmed forum report (search snippet, the forum blocks fetches): WebHID gets
no input while 3DxWare runs, which would also hit Chrome on his PC. Next step: probe page
`.scratch/probe/index.html` (served on http://localhost:3006 with caching off) tests the Gamepad API, WebHID and
3DxWare's local server (`wss://127.51.68.120:8181`, the route Onshape uses) in his real browsers. The chosen
route depends on what it shows.

### Probe 1 result (Adrian, Firefox 158, 3DxWare on, 2026-10-18)

- Gamepad API: one pad `beef-046d-Unknown Gamepad`, all axes 0 while the cap moved: not usable.
- WebHID: not in Firefox (as expected). Chrome not tried yet.
- 3DxWare server: `https://127.51.68.120:8181/version` answers "Server version: 1.5.0.21893"; Firefox accepted
  its certificate. The probe's WebSocket at `/3dconnexion` failed: wrong path (see below), or an origin check.

### The 3DxWare web protocol (read from spacenav-ws 0.1.5, GPL-3, github.com/rmstorm/spacenav-ws, which copies it for Onshape on Linux)

- `GET https://127.51.68.120:8181/3dconnexion/nlproxy` → `{"port": ..., "version": ...}`. On Adrian's PC (3DxWare 1.5.0.21893) it says **port 8182**: the socket is not on 8181. CORS lets a localhost page read it.
- WebSocket `wss://127.51.68.120:<port from nlproxy>/` (path `/`), subprotocol `wamp`, WAMP v1 JSON arrays:
  0 WELCOME `[0, session, 1, ident]`, 1 PREFIX `[1, prefix, uri]`, 2 CALL `[2, id, uri, ...args]`,
  3 CALLRESULT `[3, id, result]`, 4 CALLERROR, 5 SUBSCRIBE `[5, topic]`, 8 EVENT `[8, topic, payload]`.
- Client: PREFIX `3dx_rpc` = `wss://127.51.68.120/3dconnexion#`, `3dconnexion` = `wss://127.51.68.120/3dconnexion`;
  CALL `3dx_rpc:create` `"3dconnexion:3dmouse"`, version → `{connexion: "mouse0"}`; CALL `3dx_rpc:create`
  `"3dconnexion:3dcontroller"`, `"mouse0"`, `{name, version, ...}` → `{instance: "controller0"}`;
  SUBSCRIBE `3dconnexion:3dcontroller/controller0`; CALL `3dx_rpc:update` `"controller0"`, `{focus: true}`.
- Server → client: EVENT on the controller topic carrying a CALL `[2, id, "self:read", "", prop]` or
  `[2, id, "self:update", "", prop, value]`; the client answers with CALLRESULT `[3, id, value]`.
- Properties seen: `view.affine` (camera-to-world, 16 numbers, translation in elements 12-14, like three.js
  `matrixWorld.elements`), `view.perspective`, `view.extents`, `view.target`, `view.constructionPlane`,
  `model.extents` (6 numbers, min then max), `selection.empty`, `selection.extents`, `hit.lookat`, `views.front`,
  `motion`. The real driver likely reads more (navlib: `view.fov`, `view.frustum`, `pivot.*`, `hit.*`,
  `coordinateSystem`, `commands.*`, `transaction`, `frame.*`).
- So 3DxWare does the motion maths itself; the page only hands over and takes back its camera.

### Probe 2 result and the real handshake (2026-10-18)

- With port 8182 the socket opened (`wamp`), WELCOME `"Nl-Proxy v1.5.0.21893"`, and `3dx_rpc:create 3dconnexion:3dmouse`
  answered `{connexion: <id>}`. A localhost page is accepted: no origin block. The controller create then got no answer.
- 3Dconnexion's own library (`3dconnexion.cjs` v0.8.0, "3Dconnexion SDK" licence, found in public GitHub copies of the
  SDK, e.g. glass9/3DxDemos) does it this way:
  PREFIX `3dx_rpc`, `3dconnexion` **and `self` = `location.href`**; mouse create with version `"0.8.0"`; controller
  create with `{version: 0.8, name, rowMajorOrder: false}` (a number, no other fields); SUBSCRIBE
  `3dconnexion:3dcontroller/<instance>`; focus with CALL `3dx_rpc:update` `"3dconnexion:3dcontroller/<instance>"`, `{focus}`.
  Server calls arrive as EVENT payload `[2, id, "self:read"|"self:update", _, prop, value]`: the property is at index 4,
  the value at 5. Unknown property → `[4, id, method + "#generic", prop + " unknown property"]`.
  Buttons: `events.keyPress`/`keyRelease` (V3DK_MENU 0x1e, V3DK_FIT 0x1f) and `commands.activeCommand` for an app's
  exported command tree (`commands.tree`, `commands.activeSet`).
- Default matrices are column-major (three.js `elements` order). Its manual is marked "3Dconnexion Internal Only
  (Confidential)" although it sits in public repos: use it only to understand the protocol, write our own client,
  and do not ship 3Dconnexion's files in the fork.

### Probe 3 result: motion works in Firefox (Adrian, 2026-10-18)

- Full handshake OK: controller `{instance: <number>}`, focus update answered `{}`.
- Moving the cap (no buttons pressed) made 3DxWare write `motion`, `pivot.visible`, `pivot.position`, `hit.lookfrom`,
  `hit.direction`, `hit.aperture`, `hit.selectionOnly`, `settings.changed`, numbered `transaction` begin/end pairs, and
  per frame `view.affine` (column-major camera-to-world) plus `view.target`. So 3DxWare does the motion and the page
  only has to read and write its camera.
- **Buttons not tested yet.** That 3DxWare handles Fit and the view buttons itself comes from its library and manual,
  not from a test.
- The page was plain HTTP on localhost: this route needs no HTTPS on Layerling's side.

### Buttons and Layerling commands (Adrian, 2026-10-18)

- 3DxWare's settings app lists **Layerling** as its own application (from the controller's `name`), not Firefox.
  Its button panel showed the buttons doing what they were already set to do (opening programs).
- Wanted: Layerling's own functions in that panel, to map to buttons. The protocol does this: CALL `3dx_rpc:update`
  on the controller with `{commands: {activeSet: "Default", tree}}`; tree = `{nodes: [ActionSet]}`, nodes
  `{id, label, type, nodes}` with type 0 = action set (button bank; id "Default" hides its label), 1 = category,
  2 = action `{id, label, description, type: 2}`. A mapped button press arrives as server write
  `commands.activeCommand` = the action id. Optional icons through the `images` property (not tried).
- Probe 4 (nl.html) now sends six sample commands (View: Fit, Home, Flat/normal; Edit: Undo, Redo, Duplicate).
  Result: the six commands **show up in 3DxWare's button panel** under Layerling (Adrian, 2026-10-18; first try failed
  only because of a syntax error in the probe). **Button press back to the page works:** mapped buttons arrived as
  `commands.activeCommand` = `"LYL_DUPLICATE"` and `"LYL_HOME"`, each followed by `""` (the release). Focus changes
  make 3DxWare write `settings.changed` (a counter). Whole route proven in Firefox, 2026-10-18.

## Decision: rebuild on 3DxWare's server (Adrian, 2026-10-18)

- **Remove the WebHID code.** One route: 3DxWare's local server, every browser, 3DxWare's own settings. Without
  3DxWare (Linux) spacenav-ws stands in for it.
- **Commands offered to 3DxWare's button panel: View, Edit, Tools and Shapes** (Claude picks the commands in each;
  Adrian trims later).

## Build design (2026-10-18)

- `lib/navlib.ts` — our own WAMP v1 client for 3DxWare (no 3Dconnexion code): handshake, calls, answering the
  server's reads and writes through a "navigation model", button commands. Unit tested with a fake socket.
- `lib/spaceMouseConnection.ts` — finds the port (`/3dconnexion/nlproxy`), opens the socket, retries on window focus
  (at most every 30 s), tells 3DxWare about focus, holds the active view's model (sketch over 3D view), sends the
  command tree (sets "Default" = 3D editor, "Sketch"), passes button commands on, status + on/off setting.
- `lib/navlibCamera.ts` — the 3D view's model on a three.js camera. Property rules from the 3DconnexionJS manual:
  `view.affine` camera-to-world, column-major (= `matrixWorld.elements`); `view.fov` vertical, radians;
  `view.frustum` `[l, r, b, t, near, far]` at the near plane; `view.extents` ortho box in view coords
  `[l, b, -far, r, t, far]` (written to zoom an ortho view); `view.target`; `model.extents`/`selection.extents`
  `[min, max]` world; `coordinateSystem` and `views.front` identity (Layerling: y up, front camera on +z, like the
  navlib); `hit.lookfrom/direction/aperture/selectionOnly` then read `hit.lookat` (nearest hit or null);
  `pointer.position` on the near plane; `pivot.position`/`pivot.visible` (show a pivot marker); `transaction`
  >0 begin, 0 end; `motion` true/false; `view.rotatable` false = pan and zoom only, used for the sketch.
- Roll is dropped: the camera keeps y up (OrbitControls), so the target is kept on the camera's line of sight.
- Commands: the toolbar's palette list (Ctrl+K) goes to 3DxWare grouped as in the toolbar, minus the per-design
  object entries; plus a View group (fit, home, flat/normal, six views). A press runs the palette entry if enabled.

## First test in Layerling (Adrian, 2026-10-18)

- **It works** in Firefox through 3DxWare.
- Quirk found: zooming in stopped at a fixed point, "almost like the borders of the design grid". Cause: with no
  `view.target` from 3DxWare the orbit target was carried forward with the camera, ran off the plate, and
  `constrainCamera`'s plate limit on the target pulled the camera back. Fixed in `navlibCamera.ts`: the target
  stays at its depth (so the camera comes closer); near it, it moves on to the surface ahead (hit test, as the
  wheel does); right at a surface the camera stops at the view's closest distance. Two unit tests added.
  **Retried by Adrian: success.**

## Simplify Mesh window (Adrian, 2026-10-18)

- Found by Adrian on the server: the cap did nothing in Simplify Mesh's side-by-side compare. That panel draws both
  halves with one camera of its own. Fixed: while it is open it registers that camera with 3DxWare (the last view
  registered is moved), so the cap turns both halves together; closing it gives the cap back to the workplane.
  Hit tests and model box use the original mesh; no pivot marker there. Other renderers checked: the revolve
  preview is a still picture with no controls, and `myShapeThumbnail` draws icons off-screen, so neither needs it.
  Committed 35bbde58, merged into my-mod, image built and running on the server. Waits on Adrian to try it.

## Two issues from Adrian's try (2026-10-18)

1. **Standard views don't stay locked.** A view button (Top, Front, Left...) only jumps the camera there; the next
   touch of the cap turns the view away again (Bambu Studio does the same). That makes lining parts up hard.
   Wanted: a view that stays put until he lets it go. Possible hook: navlib's `view.rotatable` (false = 3DxWare
   should not turn the view), plus dropping any turn in `applyAffine` while locked (pan and zoom still work).
   How the lock is released is Adrian's call (asked 2026-10-18).
2. **The cap tilts over the top.** With the mouse, tilting to look straight down stops at the top. With the cap,
   it goes past the top and the whole view spins round, so you come down on the back. Cause: `applyAffine`
   (`apps/web/src/lib/navlibCamera.ts`) takes 3DxWare's camera as is, then `lookAt` with "up" at the top flips it
   once the camera is upside down. Fix: stop the tilt just short of straight down or up, as the orbit controls do.

**Adrian's answers on the lock (2026-10-18):** it must work for everyone, not only SpaceMouse users: a view
button locks turning for the mouse too. **Esc** leaves the lock (the SpaceMouse's Esc button sends Esc through
3DxWare, so it does too). Show a small lock badge by the view cube while locked.

**Upstream PRs (Adrian, 2026-10-18):** he wants to send this work to henmedia/layerling as PRs. Proposed: one PR
for SpaceMouse support (`spacemouse` + `spacemouse-simplify` + `orbit-fix`, squashed onto the latest
`upstream/main`, without `plans/` and without the fork-image workflow), and the view lock as a second PR.
Upstream was 40 commits ahead of `main` on 2026-10-18. Waits on his OK before anything is pushed or opened.
Order (Adrian, 2026-10-18): build and finish the view lock first, on branch `view-lock`; once it works, push both PRs.
The lock PR changes SpaceMouse code that is not upstream yet, so `view-lock` is built on top of `orbit-fix` and
its PR goes up after (or stacked on) the SpaceMouse PR.

### View lock: built on `view-lock` (2026-10-18), not yet tried by Adrian

- A view button, keys 1–6 or a SpaceMouse view command locks turning (`lockView` in `WorkplaneViewport.tsx`):
  the orbit controls' `enableRotate` goes off, and 3DxWare is told `view.rotatable` = false; any turn it still
  sends is taken back about its pivot (`navlibCamera.ts`), so the cap only pans and zooms. F (fit) keeps the lock.
- Let go by: Esc (a capture-phase listener that runs before the editor's, so the selection stays; a drag in
  progress still takes Esc first), the house button, a view cube edge or corner, a drag on the view cube, the
  badge, or the MCP orbit tool. Another view button moves the lock to that side.
- Badge: a round lock button right of the view cube (`.view-lock-badge`, light and dark); words `view.unlock` in
  en, de, fr, nl, cs, ru, sl. Graphite theme rebuilt.
- Tests: 2 new unit tests (held view only pans and zooms; a held top view keeps its heading). Type check clean;
  full suite passes except the known `useRememberedFlag` failures.
- Not checked in a browser: the browser tool can't open the 3D editor (no WebGL). Waits on Adrian to try it in
  Firefox: mouse orbit locked after Top/Front, Esc and badge unlock, cap pans/zooms but doesn't turn while locked.
- Open: Esc unlocks before it puts down a tool or leaves a mode (tape, section, workplane); say if that is wrong.
  No guide page or shortcuts-list entry yet.

### Adrian's try of the lock (2026-10-18): lock works; three findings

1. **3DxWare's own Top/Right/Front buttons** moved the view but did not lock it (his remapped buttons to
   Layerling's view commands did). Now: a camera 3DxWare sets exactly square to a side, from a view that was not
   already that side, is taken as Layerling's view button for that side (`squareView`), so it locks too.
2. **The orbit fix did not work.** The flip near straight down was not the camera passing over the top: there a
   twist moves the line of sight sideways across the top, and turning "up" back to the top made that a big swing
   of the heading, frame by frame. Now (`mouseLikeTurn` in `navlibCamera.ts`) the cap turns the view as the mouse
   does: the twist spins round the vertical, the tilt changes the angle and stops just short of straight down or
   up, roll is dropped; 3DxWare's pan and zoom are kept as they were on the screen. A test shows the old code
   drifting off; the new one holds. This replaces the `orbit-fix` commit's approach; the SpaceMouse PR should
   carry the new code.
3. **Zoom stops short in a locked view.** Cause not proven. Tried: 3DxWare is no longer told the view can't turn
   (`view.rotatable` stays true; the lock takes the turn back itself). Asked Adrian whether it was the cap or the
   wheel, and whether it still happens.

**Adrian's retest (2026-10-18):** the orbit fix works (the cap stops at the top). The lock is not yet what he
wants: Front and Right still show perspective (parallax), so they are not straight-on 2D views. Next: a view
button also switches to the flat (orthographic) view while locked; letting go puts back the view he had.
Built: `lockView` switches a perspective view to flat as it locks and back as it lets go; pressing O by hand while
locked means letting go leaves the projection alone. Waits on Adrian's try. Watch: the flat view zooms by its own
zoom range (`orthographicZoomRange`), which may be where a zoom now stops.
