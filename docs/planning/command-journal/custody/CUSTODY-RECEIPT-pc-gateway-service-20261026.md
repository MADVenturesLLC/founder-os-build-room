# CUSTODY RECEIPT — the PC's Gateway rebuilt at Build Room main and run as a supervised user service (2026-10-26)

**This receipt records the landing of one Founder instrument, his act
`FOUNDER-ACT-20261026-BR-PC-GATEWAY-SERVICE`, with the readings he gave
under it and the builder's reads. It records nine findings and
authorizes nothing.** The act's own text governs. The filing is ordered
by C1 of the act and C1 of `FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE`
(one custody filing per act, after the act completes). The merge of this
record needs the Founder's separate SHA-named authorization.

## The instrument

The act was not posted. It is the text the builder delivered in session,
byte for byte, which the Founder signed by reference to its SHA-256.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-pc-gateway-service-20261026.txt` |
| Git blob id | `9b9fb1296cc5f7c8d0dbbb7e2c329c2258caf2d5` |
| SHA-256 | `47f5ef0b529298adc385fa8148a4062ef3d3b9bd7694b43d41a51550bdde4206` |
| Bytes | 8033 |
| Lines | 51 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261026-BR-PC-GATEWAY-SERVICE`, the text the builder delivered in session; signed in session at 2026-10-26T01:57:26Z by reference to this SHA-256 (the signature is quoted below) |

**The signature, verbatim**, given in session:

> I sign FOUNDER-ACT-20261026-BR-PC-GATEWAY-SERVICE as the builder
> delivered it in this session (SHA-256
> 47f5ef0b529298adc385fa8148a4062ef3d3b9bd7694b43d41a51550bdde4206).

(Rewrapped for this file.)

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-GATEWAY-SERVICE-EVIDENCE-founder-readings-20261026.txt` |
| Git blob id | `84ac8f61b4f4ae060bac008166e589b376df7ef9` |
| SHA-256 | `5b909e00eda2d437a5b8a05c325ab9054e2526429a839de41ed0c760d2ef8f7b` |
| Bytes | 19696 |
| Lines | 286 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's twelve readings and statements on the PC as he gave them in session, from B1 to B6 and one after the act, each under a heading line with the time the builder received it, then the two Railway logs he uploaded for B1; otherwise verbatim. Nothing needed masking (finding 8) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-GATEWAY-SERVICE-EVIDENCE-builder-reads-20261026.txt` |
| Git blob id | `f7d35051807fbe501ab0f794f2fce1eba6c4417d` |
| SHA-256 | `260dcef42ed8c56c2f35be6757bb8ca2791760aa9506d8f23326fae7a54bea55` |
| Bytes | 1845 |
| Lines | 8 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's reads for the act: the A2 repository facts, the signed file's hash, the B1 reads of GitHub `main` and public `/health`, the expected unit-file hash, and `/health` across B4 to B6. No Railway API was read (finding 2) |

## What happened, in order

All times are UTC. The PC's own lines read EDT (UTC−4).

| Time | Event | Source |
|---|---|---|
| 2026-10-25 22:33:33Z | Build Room PR #128 merged as `056ffd1` | GitHub API |
| 22:33:36Z | Railway deployment `fe8ea5c3` created; its container started at 22:34:10.977Z and passed its health check at 22:34:11Z; SUCCESS | the Founder's `railway deployment list` and uploaded logs |
| 2026-10-26 01:55:19Z | `/health` 200, uptime 12069 s, which puts the serving process's start at about 22:34:10Z | public `/health` |
| 01:57:26Z | the act signed in session | the Founder, in session |
| 01:57:35Z | the builder's B1 reads: `main` at `056ffd1`, no Gateway package change, `/health` 200 | GitHub, public `/health` |
| 02:01:55Z to 02:02:11Z | the Founder's B1 readings on the PC: no daemon running; checkout `750b6839`, clean; Node v22.23.2; systemd 259; `Linger=yes`; no `buildroom-gateway.service` | the Founder, in session |
| 02:07:13Z to 02:09:10Z | `railway` not found on the PC, then installed there by the Founder, then `railway deployment list`: `fe8ea5c3` SUCCESS at the top, nothing building | the Founder, in session |
| 02:09:17Z | the builder's B1 reads repeated: `main` unchanged, `/health` 200 | GitHub, public `/health` |
| 02:09:57Z | B2: clone at `056ffd1`, `npm ci` and `npm run build` succeed; clean tree; `main.js` present | the Founder, in session |
| 02:10:37Z | B4: the unit file's SHA-256 matches the act's text; the service enabled and started; `enable-linger` run | the Founder, in session |
| 02:11:17Z | B5: `active (running)`, `Linger=yes`, `primary: HEARTBEATING` from the running daemon | the Founder, in session |
| about 02:13Z | the PC rebooted for B6 | the Founder, in session |
| 02:13:27.065Z | logind session `1`, class `manager` (the lingering user manager) | the PC's journal |
| 02:13:27.207Z | `user@1000.service` and `buildroom-gateway.service` started | the PC's journal |
| 02:13:35.745Z | the first login, session `3`, class `user`, on the console | the PC's journal |
| 02:14:04Z | B6: uptime 0 min, `active (running)` since 02:13:27Z, `Linger=yes`, `primary: HEARTBEATING` | the Founder, in session |
| 02:14:26Z | `/health` 200 | public `/health` |
| 02:23:33Z | after the act: `railway logout` on the PC succeeds; idle suspend on AC power reads `'nothing'` | the Founder, in session |

## Findings

**1. The Gateway was down when the act began.** B1 found no daemon
process. The last recorded heartbeat is 2026-10-15T01:38:58Z, read under
the restart act; when the daemon stopped after that is not known. B3 had
nothing to stop.

**2. The builder read no Railway API.** The Railway connector was not
loaded in this session, so every Railway fact here is the Founder's: the
`railway deployment list` output and the two logs he uploaded. The list
does not name the serving deployment's commit. That it is `056ffd1` is
the builder's inference from timing (created 3 seconds after the merge
of PR #128), not a reading. B1 asks only for SUCCESS with nothing
building, which the list shows. The builder also could not read
Railway's request logs for `/gateway/heartbeat` in B5; as B5 allows,
the heartbeat rests on the Founder's `buildroom status` readings.

**3. The Railway CLI was installed on the PC during the act, outside
it.** The PC had no `railway` at 02:07:13Z and listed deployments at
02:09:10Z; the Founder states he installed it there. The act does not
cover changes to the Gateway host, and it bars none of this kind
expressly. Because the list command worked, the PC now likely holds a
logged-in Railway credential with production access, which the
Gateway's design does not account for. The builder advised
`railway logout` on the PC unless the Founder wants it kept. The
Founder ran it after the act, at 02:23Z, and it printed "Logged out
successfully" (reading 12); the CLI itself stays installed.

**4. Lingering was already on.** B1 read `Linger=yes` before B4, so
B4's `sudo loginctl enable-linger` changed nothing. What turned it on
earlier is not recorded.

**5. B6 proves the service starts without a login.** The PC's console
logged in at 02:13:35.745Z (session `3`, class `user`), but the
lingering user manager and the Gateway service started 8.5 seconds
earlier, at 02:13:27Z. The B6 readings were taken at that console, not
over SSH as the act suggests; the journal's order, not the reading's
transport, carries the proof.

**6. The Gateway still serves no planner work.** Per A3, the daemon on
`main` is built without a planner executor and polls nothing for the
Planner. This act puts the planner worker on the PC; the executor, a
provider binding under `DEC-20260827-01` §3.4, needs its own act.

**7. `npm ci` reports one high-severity vulnerability.** The same line
appears in the build log of Railway's serving deployment, so it is not
new to the PC. The act authorizes no `npm audit fix`, and none was run.

**8. Nothing in the PC readings needed masking.** This repository is
public. The readings carry the PC's hostname, as earlier records did,
and no address, node key, host identifier or phone number. The sudo
prompts show no password.

**9. The PC does not suspend when idle on AC power.** After the act
the Founder read the GNOME setting `sleep-inactive-ac-type` as
`'nothing'` (reading 12). The act changes no power setting. A suspend
would stop the heartbeats without the service exiting, so it would not
be restarted.

None of the findings was corrected.

## What the builder read and did not do

- Every repository fact above was read from git and GitHub; `/health`
  from the public route.
- The builder holds no connection string, password, token or key, and
  called no tool that returns a variable's value.
- The builder changed nothing on the PC. The Founder ran every command
  there under the act. The old checkout `~/buildroom-gateway` is kept.
  No Gateway was enrolled, revoked or given a pairing code; no key was
  minted or moved; no planner executor, counted run or Railway variable
  was touched. Nothing was deployed, redeployed or rolled back.

## Provenance and transport

| Step | Identity |
|---|---|
| The act, the signature, the readings and the statement on the Railway CLI | the Founder (in session) |
| Draft of the act, GitHub and `/health` reads, this record | the builder session, under the act and the Founder's direction in session |
| Transport | the act from the builder's delivered file; readings from the session transcript and the Founder's uploads; each file ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | the act's SHA-256, which the Founder's signature names |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: C1 of
`FOUNDER-ACT-20261026-BR-PC-GATEWAY-SERVICE` and C1 of
`FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE`. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
