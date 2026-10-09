# V0.1 acceptance record

## Automated coverage

Latest local run: all 12 tests pass.

## Hosted verification

Render's Docker deployment became live at https://critical-failure.onrender.com on October 8, 2026 (America/New_York), in the confirmed “The Shop” workspace, Virginia region, Free plan. GitHub Actions passed for the initial implementation commit. The hosted `/health` endpoint returned HTTP 200, and the public landing screen displayed the required creator credit.

`node scripts/public-smoke.mjs https://critical-failure.onrender.com` passed with four independent hosted HTTP clients in disposable room CF-BBF666. Verified distinct station payloads, action authorization, FT-201A readings of 4 versus redundant flow of 100 with full integrity and healthy electrical current, blocked premature execution, the complete communication sequence, blocked command replay, actual flow loss after pump stop, temperature/integrity consequences, standby recovery, alternate channel selection and authenticated stream reconnect. A Render error-log check returned no errors. This is public automated verification, not four-physical-device acceptance.

`node --test` covers four independent HTTP clients, room capacity, assignment conflicts, host controls, readiness, private station projections, authorization, streaming reconnect, the full closed-loop communication sequence, replay rejection, electrical/mechanical interactions, separate actual and instrument state, the mandatory FT-201A false-flow scenario, all ten coexisting failure types, player-created cooling cascades, normal first 30 seconds, complete/failed shifts, synchronized four-client results, deterministic rating thresholds and an attainable FLAWLESS SHIFT.

Accelerated tests use a server factory option unavailable through public APIs. Simulated crew recovery tests use direct engine actions to verify that all ten emergencies are recoverable; independent-client tests separately enforce authorization and the communication protocol. They do not establish human difficulty balance.

## Browser checks

Four independent browser tabs joined room CF-F83D5A with distinct session storage and one station each. Verified READY gating and countdown, separate station screens, the scheduled FT-201A failed-low indication while integrity remained 100%, redundant FT readings of 4/100, and healthy pump electrical current. Operations issued a pump stop; Mechanical repeated it, Operations confirmed, and Mechanical executed it. Pump current then fell to zero, real integrity damage followed, and powered Train B recovered cooling. I&C alternate-channel selection synchronized to Mechanical. Reloading Mechanical restored the same room, station and completed command.

Desktop screenshots were inspected. An attempted 390×844 viewport override did not change the in-app browser's reported 1280-pixel viewport, so no phone-sized visual verification is claimed. Phone CSS is implemented; phone layout still needs verification in a browser/device that supports the target size. Automated network clients and browser tabs do not replace physical-device testing.

## Required four-device test — pending

Use four separate physical phones/computers, ideally across both Wi-Fi and cellular networks, on the public HTTPS game URL.

1. Create one room and join from the other three devices without accounts. Assign one station each. Confirm every player must select READY.
2. Start the shift. Verify the synchronized countdown, integrity, alert level and timer.
3. Confirm that each device shows only its station's process details. Inspect network responses to verify other station details are absent.
4. After 30 seconds, Mechanical sees low indicated flow. Electrical sees healthy pump current, Operations sees stable temperature and I&C sees FT channel disagreement. Compare observations verbally.
5. In a disposable test shift, command a stop of healthy P-201A through the complete three-part sequence. Verify real flow loss, temperature rise and integrity damage. Select powered standby equipment to recover.
6. Exercise breaker operations across Electrical and Mechanical, redundant channel selection across I&C and Mechanical, and Operations output changes.
7. Disconnect one device temporarily, reconnect and reload it. Verify the same player, station and pending command return while the other devices remain synchronized.
8. Complete a six-minute shift, then run a failure scenario. Compare end-state metrics and ratings across all devices.
9. Test a two-player crew with separate station tabs, narrow phone layouts, readable equipment tags, touch controls and permanent credits.

Record device models, browsers, network types, public build identifier, observed defects and date. Final acceptance remains pending until the owner/physical testers complete this record. No physical-device results are claimed by the automated tests.

## Room join fix verification — 2026-10-09 UTC

All 17 automated tests pass. GitHub CI passed for 471368b7afa3. Public independent-client join regression passed (CF-71726B): distinct credentials/identities, same process, shared authority, synchronized roster and READY updates. Real public application redeploy preserved room CF-274EDC and its host session; a fresh independent guest joined the replacement instance. Two fresh browser sessions joined CF-97822F with lowercase, whitespace and a Unicode dash; READY synchronized, and guest reload retained identity without a duplicate seat. Server logs confirmed found=true and committed membership counts 1 then 2 on the same instance. Hosted four-client privacy, FT-201A false-low/healthy cooling, player-created cooling loss, communication sequence and reconnect tests passed. Physical two-device confirmation remains pending. No gameplay polish was added.

For restart verification: run `node scripts/room-restart-regression.mjs https://critical-failure.onrender.com`, wait for READY, then redeploy the application without replacing its Key Value store. The script verifies the replacement process restores the original host identity and room and accepts a new independent guest.

