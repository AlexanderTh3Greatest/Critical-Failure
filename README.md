# CRITICAL FAILURE V0.1

Created & Designed by Alex Noblin

CF-01 is a fictional cooperative energy-facility game for 2–4 players. Survive a six-minute shift by comparing asymmetric station information and coordinating actions. The complete approved source of truth is preserved in `SPECIFICATION.txt`.

## Run and test

Requires Node.js 24 or newer; no dependency installation is needed.

```
node server.js
node --test
```

Open http://localhost:3000. Other devices on the same network can use the computer's LAN IP and port 3000 if its firewall allows access. `PORT` can override the listening port. The server binds to `0.0.0.0`.

Create a shift, share its room code, and join using nicknames. The host can manually assign or randomize all four stations. Every player selects READY before the host starts the countdown. Four players receive one station each. Smaller crews operate separate station tabs. No station is automated by a bot.

## Architecture and privacy

The Node server owns all rooms, timers, simulation state, commands and scores. Same-origin HTTP commands and authenticated Server-Sent Events provide bidirectional real-time interaction without external dependencies. Clients receive projections containing only their assigned stations; detailed facility state and the internal fault list never leave the server. Player identity and station assignments are server-side. Critical actions cannot bypass the closed-loop command endpoint.

Physical state is computed separately from instrument channels. FT-201A and FT-201B measure the same Train A flow, providing redundant measurements rather than measuring different trains. Mechanical and Operations see the selected channel. I&C sees both channels. Selecting a good channel mitigates the scored emergency without repairing the bad transmitter.

The first fault, after 30 seconds of normal operation, is FT-201A failed-low. The physical pump and cooling remain healthy. Incorrectly stopping P-201A creates real cooling loss, subsequent heating, integrity damage and a scored cascade. Later faults occur at 65, 100, 135, 170, 205, 240, 275, 310 and 335 seconds. Several can coexist.

Session credentials live in the individual tab's session storage and travel in authorization headers. Reload and temporary connection loss preserve identity, station assignments and pending communications. Rooms currently live in memory: a server restart loses them. Offline crew seats are retained for reconnect; entirely disconnected rooms expire after two hours. Run one server instance; replicas require shared state before use. A running shift continues while players are disconnected.

## Fictional controls and recovery

Operations sets output and issues critical commands. Pump start/stop, isolation, breaker operations, load transfers, fault isolation and shutdown use COMMAND → REPEAT-BACK → CONFIRMATION → ACTION. The recipient repeats the exact queued action, Operations confirms, and only that recipient can execute it once. Routine requests and routine controls do not require that sequence.

Mechanical can select powered standby equipment and operate valves. Pumps require their assigned electrical bus. Start standby cooling before stopping or isolating the active train. Electrical can start DG-1 to sustain power through generator instability, transfer loads, open BUS-B and isolate its overload fault. Isolating a train permits fictional maintenance of its bearing, exchanger or stuck valve. Restore the train afterward when needed.

I&C compares channels, selects alternate indications and controls manual/automatic mode. Manual mode is required before resetting an unstable controller. Auxiliary reset recovers ventilation when DG-1 is running; primary cooling loss recovery requires Train B running with Train A isolated. These are fictional game rules, not real-world procedures.

## Deterministic scoring

All metrics are calculated by the server and freeze with the end state:

- Final Facility Integrity: final integrity rounded to the nearest integer.
- Emergencies resolved: each scheduled fault counts once when its defined mitigation succeeds.
- Incorrect actions: stopping a healthy running pump without bearing degradation, or an action that changes adequate cooling into insufficient cooling. One action counts at most once. Rejected/unauthorized actions do not affect the plant or score.
- Cascading failures caused: each player action that changes adequate physical cooling into insufficient physical cooling at the current output.
- Critical actions completed: successful execution of designated critical actions.
- Successful three-part communications: critical commands executed after recipient repeat-back and issuer confirmation, once per command.

Points = clamp(round(integrity) − 5 × incorrect actions − 10 × cascades + min(10, 2 × emergencies resolved), 0, 100).

| Rating | Points |
| --- | --- |
| S | 95–100 |
| A | 85–94 |
| B | 70–84 |
| C | 55–69 |
| D | 40–54 |
| F | 0–39, or integrity reaches zero |

FLAWLESS SHIFT requires completion, actual integrity at least 99%, zero incorrect actions, zero player-caused cascades, every introduced emergency resolved, and at least one successful three-part communication. A controlled shutdown reduces heat demand but the shift and remaining failures continue.

## Deployment and acceptance

The public test build is at https://critical-failure.onrender.com, deployed on Render's Free plan in the owner's confirmed “The Shop” workspace. The Docker image built and started successfully on Render. See `DEPLOYMENT.md` for the deployment configuration and `ACCEPTANCE.md` for verification status and the mandatory physical-device procedure. Final acceptance remains pending the four-physical-device test and phone verification. Free hosting can restart or sleep, and in-memory rooms do not survive server restarts.

## About / Credits

Alexander “Alex” Noblin — Creator & Designer. Responsible for the game concept, systems design, gameplay mechanics, and creative direction.

Developed with AI-assisted tools using ChatGPT.

These credits are a permanent core requirement and appear in the player-facing landing experience and About / Credits section.
