# PLAN_LYL_02 — Run the fork on Adrian's server

**Status (2026-10-18):** **built and running.** `docker-my-mod.yml` built and published
`ghcr.io/quadcom/layerling:my-mod` (run 39145250295, success). The package was public from the start (an anonymous
pull works), so step 2 needed nothing. The server's stack now runs that image, built from `my-mod` commit
`d1aa6549`; Layerling started cleanly and its HTTPS address answers. **Not tested by Adrian yet** at his address:
the SpaceMouse there, the flat (O) view and Chrome (he tests them himself).

## Goal

Adrian's server runs an image built from `my-mod` instead of the upstream `ghcr.io/henmedia/layerling:latest`, and
gets a new one whenever `my-mod` changes.

## Facts

- `.github/workflows/docker.yml` (upstream's) publishes `ghcr.io/${{ github.repository }}`, so on the fork it would
  be `ghcr.io/quadcom/layerling`. It runs only on a published GitHub release or by hand for a release tag, builds
  amd64 and arm64 on native runners, and copies to Docker Hub only when those secrets exist (they do not on the fork).
- GitHub Actions is enabled on the fork.
- The server's stack and how to change it: see the session memory `layerling-stack` and the homelab skill (not
  written here: the repo is public).

## Steps

1. Add a workflow of our own, `.github/workflows/docker-my-mod.yml`, so upstream's file stays untouched and
   upstream merges stay clean: on push to `my-mod` (and by hand), build `docker/Dockerfile` for amd64 only (the
   server's platform; arm64 doubles the time for nothing), push `ghcr.io/quadcom/layerling:my-mod` and
   `:my-mod-<short sha>`.
2. Set the ghcr package public after its first push (Adrian's choice), so the server needs no token.
3. Point the stack's image at `ghcr.io/quadcom/layerling:my-mod` and recreate it (homelab skill). The automatic
   updater then follows `my-mod`.
4. Check: the page opens at his HTTPS address, Settings → SpaceMouse says connected.

## Decisions (Adrian, 2026-10-18)

- The ghcr package is **public**: the server pulls it without a token.
- The app's "new version" notice **stays**, announcing upstream releases to merge into `my-mod`.

## Open

- Adrian tests the flat (O) view and Chrome himself (2026-10-18), once the server runs the fork.
- Chrome may ask for "local network access" before a page from the LAN may reach 3DxWare at 127.51.68.120
  (Firefox did not ask from localhost). Check on the server address.
