# Public deployment

The application is ready to package as one Node.js web service serving both the game and API at one public URL. No player accounts, client secrets, or separate frontend endpoint are needed.

## Render

The included `render.yaml` defines a shared Free Key Value instance and a Docker web service with `/health` as its health check. It uses the Free plan for preview without committing to a paid subscription. Render documents that Free services can restart at any time and sleep after 15 minutes without inbound traffic; Free is not the final reliability acceptance target. See https://render.com/docs/free and https://render.com/docs/web-services.

1. Publish this source to a Git repository under the owner's account.
2. Sign in to Render and connect that repository using a Blueprint, or create a Docker Web Service from the repository.
3. Use one instance, port 3000, and health path `/health`. Set backend-only REDIS_URL to a Key Value instance in the same region. The Blueprint wires this automatically.
4. Deploy, open the resulting HTTPS `onrender.com` URL, and verify `/health`.
5. Run the public multiplayer checks in `ACCEPTANCE.md` before calling the build accepted.

An always-on paid instance is the suggested final deployment configuration, subject to the owner's explicit budget approval. This package does not purchase or provision a paid service. Shared Key Value transactions now preserve rooms, player sessions and authoritative simulation across application restarts and serialize multiple replicas. Free Key Value has no disk persistence: a restart of the storage service itself can still erase rooms. Paid storage requires separate budget approval.

## Docker

```
docker build -t critical-failure .
docker run --rm -p 3000:3000 critical-failure
```

The container runs as the unprivileged `node` user. The image contains the game runtime and public assets, with no development credentials. Render successfully built and ran the Docker image; Docker is not installed locally.

## Proxy requirements

Use HTTPS. Preserve Authorization headers. Disable proxy response buffering for `/api/events` and permit long-lived streaming responses. The stream sends a heartbeat every 5 seconds and browser clients retry dropped connections. Do not put the API behind a static-only host. The `/health` response includes nonsecret build, process and storage diagnostics.

## Current protections and limits

Opaque bearer session credentials, per-station projections, server-side action validation, exact queued command execution, cross-origin mutation rejection, bounded request bodies, per-address action limits, per-session stream limits, slow-client disconnects and expired-room cleanup are implemented. No room/admin state injection endpoint exists. Simulation acceleration is available only as an imported server factory test option and cannot be selected over HTTP.

## Publishing status

The source is published at https://github.com/AlexanderTh3Greatest/Critical-Failure on `main`. GitHub and Render integrations are connected. The owner confirmed the Render workspace “The Shop” and its Free plan for initial public testing. The service is `srv-db43pn3bc2fs73agm0fg`, in Virginia, at https://critical-failure.onrender.com, with automatic deployment from `main`. The local folder is not a Git checkout; source publication currently uses the connected GitHub API. Check current deploy status before assuming the URL is live.

Run `node scripts/public-smoke.mjs https://critical-failure.onrender.com` to verify four hosted clients, private station projections, FT-201A false-flow behavior, the full communication sequence, real pump-stop damage, standby recovery and reconnect. This creates a disposable test room and takes approximately 40 seconds. It does not replace the mandatory four-physical-device test.

## Room join regression

Run `node scripts/room-join-regression.mjs https://critical-failure.onrender.com`. Separate clients use independent credentials, join a normalized room code, and verify synchronized live rosters and readiness. Server logs record room creation, normalized join attempts and committed membership without nicknames or credentials. `node --test` also verifies restart recovery and cross-instance synchronization using a shared-store fixture.

