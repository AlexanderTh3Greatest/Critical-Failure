# Public deployment

The application is ready to package as one Node.js web service serving both the game and API at one public URL. No player accounts, client secrets, or separate frontend endpoint are needed.

## Render

The included `render.yaml` defines a Docker web service with `/health` as its health check. It uses the Free plan for preview without committing to a paid subscription. Render documents that Free services can restart at any time and sleep after 15 minutes without inbound traffic; Free is not the final reliability acceptance target. See https://render.com/docs/free and https://render.com/docs/web-services.

1. Publish this source to a Git repository under the owner's account.
2. Sign in to Render and connect that repository using a Blueprint, or create a Docker Web Service from the repository.
3. Use one instance, port 3000, and health path `/health`. No application secrets are required.
4. Deploy, open the resulting HTTPS `onrender.com` URL, and verify `/health`.
5. Run the public multiplayer checks in `ACCEPTANCE.md` before calling the build accepted.

An always-on paid instance is the suggested final deployment configuration, subject to the owner's explicit budget approval. This package does not purchase or provision a paid service. Do not deploy updates during active shifts: the current in-memory room implementation does not survive restarts. For restart continuity or multiple replicas, add shared persistent authoritative state first.

## Docker

```
docker build -t critical-failure .
docker run --rm -p 3000:3000 critical-failure
```

The container runs as the unprivileged `node` user. The image contains the game runtime and public assets, with no development credentials. The Docker engine is not installed in the development environment, so this recipe still needs an actual build/run check.

## Proxy requirements

Use HTTPS. Preserve Authorization headers. Disable proxy response buffering for `/api/events` and permit long-lived streaming responses. The stream sends a heartbeat every 15 seconds and browser clients retry dropped connections. Do not put the API behind a static-only host. The `/health` response contains only an OK status.

## Current protections and limits

Opaque bearer session credentials, per-station projections, server-side action validation, exact queued command execution, cross-origin mutation rejection, bounded request bodies, per-address action limits, per-session stream limits, slow-client disconnects and expired-room cleanup are implemented. No room/admin state injection endpoint exists. Simulation acceleration is available only as an imported server factory test option and cannot be selected over HTTP.

## Publishing status

The source is published at https://github.com/AlexanderTh3Greatest/Critical-Failure on `main`. GitHub and Render integrations are connected. Render lists the workspace “The Shop”; explicit owner confirmation of that workspace is pending before service creation. A public game URL has not been created. The local folder is not a Git checkout; source publication currently uses the connected GitHub API.

