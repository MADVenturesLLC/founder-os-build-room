# CUSTODY RECEIPT — the Planner's isolation on the PC, and Gateway 1880c12d's executor enabled (2026-10-30 to 2026-11-02)

**This receipt records the landing of one Founder act,
`FOUNDER-ACT-20261030-BR-PC-PLANNER`, with its three amendments, the
readings he gave under them, his rulings during the act, and the
builder's reads. It records fourteen findings and authorizes nothing.**
The act's own text governs. The filing is ordered by Part I of the act,
Part F of its Amendment 3, and C1 of
`FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE` (one custody filing per act,
after the act completes). Under Part I it is the record that Amendment 1
C7, Amendment 2 E1, Amendment 3 D1 and Amendment 4 F1 of
`FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR` require before any counted
run, and the attestation report of that ruling's B3. The merge of this
record needs the Founder's separate SHA-named authorization.

Two documents in this record have an "Amendment 3". The **ruling's**
Amendment 3 (SHA-256 `c3a257ef…`) sets the two privilege rules and how a
run ends; the act cites it throughout. The **act's** Amendment 3, filed
here, moves the Gateway to `2a56dab` and lifts the executor's halt.

## The instruments

None was posted. Each is the text the builder delivered in session, byte
for byte, signed in session.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261030-BR-PC-PLANNER.txt` |
| Git blob id | `04d8984570172447909889debbd05330df8340b7` |
| SHA-256 | `8a78e3a2632cfd25732c272ec6fbd7df47391aa7a6020062958cc8a3f32f20b0` |
| Bytes | 28617 |
| Lines | 281 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261030-BR-PC-PLANNER`, the text the builder delivered in session; signed at 2026-10-30T11:42:34Z without naming its hash (finding 1) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261030-BR-PC-PLANNER-AMENDMENT-1.txt` |
| Git blob id | `8b830ce449c69409260fecc0a1678e2eb3aace9d` |
| SHA-256 | `38cc5f9bea6e1d347f7df5cf663408a5edd8a284def52cd9342468463ae78dac` |
| Bytes | 3062 |
| Lines | 22 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 1, the copy made from agy 1.4.11; signed at 2026-10-30T12:53:22Z without naming its hash (finding 1) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261030-BR-PC-PLANNER-AMENDMENT-2.txt` |
| Git blob id | `7f1541fd6bcef8a288e53381b21f5b7d29473fba` |
| SHA-256 | `303ee80039db78e83bf9fc3a15848ccec6dd37af881ef3f5ef87ba185523d885` |
| Bytes | 1451 |
| Lines | 18 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 2, where G4 reads `daemon.booted`; signed at 2026-10-30T13:12:57Z by reference to this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261030-BR-PC-PLANNER-AMENDMENT-3.txt` |
| Git blob id | `28ac42e18bd371b22651f4206133204743fcaa94` |
| SHA-256 | `0ccf84d7079bcbad9070ec95255d39b220232982b0c503ad25a5c539bbf27f52` |
| Bytes | 7799 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 3, the Gateway moved to `2a56dab` and the executor's halt lifted; signed at 2026-11-02T09:50:23Z without naming its hash (finding 1) |

**The signatures, verbatim**, given in session:

> I sign FOUNDER-ACT-20261030-BR-PC-PLANNER as delivered

> I sign FOUNDER-ACT-20261030-BR-PC-PLANNER Amendment 1 as delivered

> I sign FOUNDER-ACT-20261030-BR-PC-PLANNER Amendment 2 as the builder
> delivered it in this session (SHA-256
> 303ee80039db78e83bf9fc3a15848ccec6dd37af881ef3f5ef87ba185523d885).

> I sign FOUNDER-ACT-20261030-BR-PC-PLANNER Amendment 3

(Rewrapped for this file.)

**The rulings, verbatim**, each given as the Founder's choice among
options the builder put to him in session. The question is quoted
before the choice.

At 2026-10-30T10:08:50Z, before the act was drafted:

> "PC act ruling 1, network allowlist: how should the PC limit which
> internet hosts the planner user (the account agy runs as) can reach?"
> = "Firewall + SNI filter (Recommended)"

> "PC act ruling 2, DNS: Ubuntu's systemd-resolved answers name lookups
> over a local channel the firewall can't see, so the planner user could
> leak data through lookups. How should that be closed?" = "Lookups via
> the stub (Recommended)"

> "PC act ruling 3, reading the allowed hosts before the act (Amendment 2
> B2): how should the list of hosts agy needs be established?" = "Read
> from your agy (Recommended)"

> "PC act ruling 4, sign-in: agy 1.4.7 lists no login command, and the
> planner user has no screen or login shell. How should the planner user
> sign in to agy?" = "Interactive first run (Recommended)"

At 2026-10-30T11:14:13Z, ruling 2 asked again because the first option
was wrong (finding 2):

> "PC act ruling 2, re-asked (my earlier option was wrong): R10 shows
> systemd-resolved's local socket and D-Bus are open to every user, so
> the planner user could look up any name directly and leak data through
> lookups, past the firewall. The nsswitch change I offered doesn't touch
> that. How should it be handled?" = "Close it for the planner
> (Recommended)"

At 2026-10-30T11:29:04Z, after R9:

> "PC act allowlist: R9 traced agy's own lookups. Certain to be needed:
> daily-cloudcode-pa.googleapis.com (the model API) and
> oauth2.googleapis.com (sign-in tokens). Unclear: aicode.googleapis.com
> and antigravity-unleash.goog (agy-specific, purpose unknown), and
> www.googleapis.com (Google's general API front door, which can also
> accept file uploads). Also seen: play.googleapis.com (telemetry), agy's
> auto-updater, lh3.googleusercontent.com (profile picture),
> gemini-api-docs-mcp.dev (an MCP server, banned for the planner by
> Amendment 4). Which hosts may the planner user reach?" = "agy-specific
> only (Recommended)"

> "PC act sign-in (refines your ruling 4): Google sign-ins for
> command-line tools often send the browser back to a local address on
> the same machine (localhost). If agy's sign-in for the planner user
> does that, a browser on another device can't complete it. May you
> finish it in a browser on the PC itself?" = "Yes, PC browser if needed
> (Recommended)"

At 2026-10-30T13:19:11Z, after G4 failed (finding 7):

> "PC act G4 failed: the new Gateway daemon (413ba83) is running and
> heartbeating, but its Planner executor halted at boot because it checks
> for leftover planner processes the instant after killing them (a race,
> to be fixed in code). Halted, it refuses all Planner work until you
> remove the halt file. Under the act's H1 you stop. Do you keep the new
> daemon running with its executor halted, or roll back to the old
> 056ffd1 daemon now?" = "Hold, executor halted (Recommended)"

Two later directions, given in session on 2026-10-30, are carried by
Amendment 3's text: "keep the 4 second grace" (16:22:44Z, on Build Room
pull request 137), and the start of the fix pull request, "yes, start the
fix PR" (13:22:15Z).

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-PLANNER-EVIDENCE-founder-readings-20261030.txt` |
| Git blob id | `6799d88ca1cda0e61a5d8998e27daf5a22157da5` |
| SHA-256 | `72a97025c95bc5ea5915999f362a24baaf9c73e9b24c64207589261b972a9e82` |
| Bytes | 174289 |
| Lines | 3336 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's twenty-nine readings and statements as he gave them in session: R1 to R11 before the act, Parts B to G of the act, and Parts B to D of Amendment 3, each under a heading line naming its step and the time the builder received it; otherwise verbatim, with seven kinds of value masked (finding 13) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-PLANNER-EVIDENCE-builder-reads-20261030.txt` |
| Git blob id | `e6ee94fa44ac16c56a6303ae237e34e51387eafa` |
| SHA-256 | `aa7f9b400195ab64f079608c6b0e61714566d9639df3f24ff744b7894fe8f419` |
| Bytes | 5036 |
| Lines | 12 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's reads for the act and Amendment 3: the deployments of `413ba83`, `5eaa1f9` and `2a56dab`; B2 and Amendment 3 B1; the cause of G4's halt read from the code; the dependency audit; and the control plane's heartbeat logs around G2, C5 and the reboot |

## What happened, in order

All times are UTC. The PC's own lines read EDT (UTC−4) on 2026-10-30
and EST (UTC−5) on 2026-11-02.

| Time | Event | Source |
|---|---|---|
| 2026-10-30 10:08:50Z | rulings 1 to 4 | the Founder, in session |
| 10:45:44Z | the control plane deployed at `413ba83` (Build Room pull request 136) | Railway |
| 11:02:51Z to 11:25:47Z | R1 to R11, the readings before the act; R9 traced agy's lookups | the Founder, in session |
| 11:14:13Z, 11:29:04Z | ruling 2 asked again; the allowlist and sign-in rulings | the Founder, in session |
| 11:42:34Z | the act signed | the Founder, in session |
| 12:49:39Z to 12:51:28Z | B1: agy found at 1.4.11, not the act's 1.4.8; stop, nothing changed | the Founder, in session |
| 12:53:22Z | Amendment 1 signed | the Founder, in session |
| 12:53:39Z | B2, the builder's reads: `main` at `413ba83`, `/health`, `/version`, Railway | the builder |
| 12:55:49Z | Part C: the planner user, the copy, the sudo rules, the checkout parent, HOME | the Founder, in session |
| 12:58:11Z | Part D: nginx and the stream filter, dnsmasq, the resolver drop-ins, the firewall | the Founder, in session |
| 12:59:11Z to 13:00:10Z | F4, F1, F2, F3 and E1 | the Founder, in session |
| about 13:00Z | E2: agy signed in as the planner user | the Founder, in session |
| 13:03:15Z | F5: init event `gemini-4-argon-high`, 9.08 s before the input; result `OK` | the Founder, in session |
| 13:05:28Z | F6, F7 and F8 | the Founder, in session |
| 13:12:57Z | Amendment 2 signed | the Founder, in session |
| 13:14:38Z to 13:16:47Z | G1, G2 and the start of G3 | the Founder, in session |
| 13:15:04Z | G2's restart; the daemon at `413ba83` halts its executor with `planner_user_survived_reap` | the PC's journal |
| 13:17:39Z | G3's end (no planner process) and G4 | the Founder, in session |
| 13:19:11Z | the ruling to hold, with the executor halted | the Founder, in session |
| 2026-10-31 06:43Z | Build Room pull request 137 merged as `5eaa1f9` | GitHub |
| 2026-11-02 01:43Z | Build Room pull request 138 merged as `2a56dab`; deployed at 01:45:24Z | GitHub, Railway |
| 09:50:23Z | Amendment 3 signed | the Founder, in session |
| 09:50:38Z, 10:10:45Z | Amendment 3 B1, the builder's reads | the builder |
| 10:05:00Z | Amendment 3 B2, first attempt, run on the MacBook | the Founder, in session |
| 10:10:31Z | Amendment 3 B2 on the PC: the halt file and `pgrep` as stated | the Founder, in session |
| 10:11:48Z | C1: the checkout at `2a56dab`, built | the Founder, in session |
| 10:14:43Z | C2 to C4: the service stopped, the halt file removed, the unit written | the Founder, in session |
| 10:15:27Z | the test run's init event | the PC |
| 10:19:15Z | C5: the service started; at 10:19:30Z no planner process | the Founder, in session |
| 10:19:35Z | the first heartbeat after C5 | Railway |
| 10:21:07Z | D1 | the Founder, in session |
| 10:27:35Z | the PC rebooted for D2 | `uptime -s` |
| 10:27:47Z | the service started, nobody logged in at the console (finding 11) | the PC's journal |
| 10:28:07Z | the first heartbeat after the reboot | Railway |
| 10:28:54Z | D2's readings over SSH | the Founder, in session |

## The attestation report (ruling B3)

F5 ran agy through the first privilege rule exactly as the daemon runs
it, in a directory the planner user can read and not write. The init
event named `gemini-4-argon-high` and came 9.08 s before the input was
sent, with `permission_mode` `request-review`; agy accepted `--sandbox`,
and the result was `OK`. Amendment 3 C5's test run, started the same
way, printed the same model and `permission_mode` at 2026-11-02T10:15:27Z.

## Findings

**1. Three of the four signatures name no hash.** The act, Amendment 1
and Amendment 3 were signed "as delivered" or by name. In each case the
builder had delivered exactly one text under that name in the session,
and the signature is recorded against that text, whose SHA-256 is in the
table above. Amendment 2 was signed by its hash.

**2. Ruling 2 was asked twice.** The first option the builder offered,
an `nsswitch` change, could not close the lookup path: R5 showed no
`nss-resolve` module, and R10 showed the resolver's local socket and
D-Bus interface open to every user. The question was put again with
that stated, and the Founder chose to close the path for the planner
user only. The act's D3 does that, and F4 shows it closed.

**3. agy updated itself before the act.** R2 read agy 1.4.8; B1, about
two hours later, read 1.4.11 with another hash, so B1 stopped. Amendment
1 records the new version and hash and adds a re-read before the copy,
which passed. The copy at `/opt/buildroom-planner/bin/agy` changes only
by the Founder's act.

**4. A second planner agy at F6.** F6's `pgrep` listed the test run and
a second agy run by the planner user, with no arguments. The Founder's
statement at 13:39:04Z, that "the sign-in agy was still open in another
terminal", identifies it as E2's interactive session. F6's `pkill` ended
both, and G3's first `pgrep` listed only the test run.

**5. What the filter refused during the sign-in.** F8's logs show the
filter forwarding only names on D1, and refusing `play.googleapis.com`,
`www.googleapis.com` and `www.gstatic.com`. The last is on neither D1 nor
D2's list of names refused by name; it was refused like every other name
off D1, and the sign-in completed without it. `antigravity-unleash.goog`,
on D1, was never reached.

**6. G4 as written read `daemon.booted` from the wrong place.** The
daemon writes `daemon.booted` to its own log, which the Gateway CLI's
`tail` reads, not to the service's journal. Amendment 2 moved that
reading, and G4 and D1 read it from `tail`.

**7. G4 failed, and the executor halted at `413ba83`.** At G2's restart
the new daemon's boot reap ended G3's test run, and its check, made the
instant after `pkill -KILL`, still listed the killed process. The
executor halted with `planner_user_survived_reap` and wrote
`planner-halted.json`; G3's reading 20 s later found no process. Every
run's end makes the same check. The Founder ruled to hold, with the
executor halted. Build Room pull requests 137 and 138 fixed the check;
Amendment 3 moved the Gateway to `2a56dab` and lifted the halt; its C5
repeated G3 and the executor did not halt.

**8. The halt held for three days without effect.** From 2026-10-30
13:15:04Z to 2026-11-02 10:14Z the daemon at `413ba83` ran and
heartbeated with its executor halted. No counted run was authorized in
that time, so no planner work was refused that would otherwise have run.

**9. Amendment 3 B2's first attempt ran on the MacBook.** It read
nothing on the PC and changed nothing. The readings were then taken on
the PC over SSH and matched.

**10. The dependency audit grew without a change of dependencies.**
`npm ci` on the PC reported 2 vulnerabilities at `413ba83` on 2026-10-30
and 12 at `2a56dab` on 2026-11-02. `package-lock.json` is byte-identical
between the two; the rise is new advisories on the same packages. The
one high is `body-parser`, transitive; ten moderates are in the lint
toolchain, which the daemon does not load. No `npm audit fix` was run
(Amendment 3 Part G). It is a tracked follow-up.

**11. The reboot was refused once, then forced, and the console was not
read after it.** `sudo reboot` was refused because a desktop session was
open on the PC's console (`tty2`) and two SSH sessions were open;
`sudo systemctl reboot -i` ended them. After the boot the Founder read
D2 over SSH. That nobody logged in at the console after the boot rests
on his instruction, not on a reading: `loginctl` was not read. The
service started 12 s after boot and its first heartbeat was answered 20
s later.

**12. What the commands left beside the act's text.** The builder's
commands kept the unit each step replaced, as
`~/buildroom-gateway.service.056ffd1.bak` (G2) and
`~/buildroom-gateway.service.413ba83.bak` (Amendment 3 C4); the act names
neither copy. Amendment 3 C5's test run left
`/srv/buildroom-planner/checkouts/reading`, an empty directory of mode
0555; the act's F5 removes it after a test run, and C5's commands did
not. The checkouts at `056ffd1` and `413ba83` remain, as the act and
Amendment 3 require.

**13. What is masked.** In the Founder's readings: the PC's host name
(`<PC_HOST>`, 79 times), his user name, alone and in paths
(`<FOUNDER_USER>`, 177), the tailnet name, including in DNS wire form
(`<TAILNET>`, 531), the PC's tailnet addresses, IPv4 and IPv6
(`<PC_TAILNET_ADDRESS>`, 2), the MacBook's tailnet address
(`<MAC_TAILNET_ADDRESS>`, 2), the ISP's DNS servers (`<ISP_DNS>`, 10),
and a Docker bridge address (`<DOCKER_ADDRESS>`, 3). Public addresses
of the services named in the readings (Google, Railway, Cloudflare,
Canonical, Vercel, Fastly and example.com), loopback, Docker subnets and
Tailscale's fixed addresses are kept. No account name, node key, token,
OAuth code or credential appears. In the builder's reads the Gateway's
source address is left out.

**14. Before any counted run.** E3 is still owed: the Founder's reading,
in words, of what access the planner user's agy sign-in grants in his
Google account. The counted run itself needs his separate act.

## Follow-ups, not decided here

- The cleanup ordering the Founder declined in Build Room pull request
  137 as a defect it narrows: a pull request that makes every cleanup
  step independent of halt-marker writes, under its own review.
- The dependency advisories of finding 10.
- `antigravity-unleash.goog`, on D1 and never reached (finding 5).
- Removing `/srv/buildroom-planner/checkouts/reading` (finding 12), as
  F5's last line does.

## Not authorized by this record

Anything. In particular: a counted run or the Founder's counted-run act;
any planner command reaching agy through the daemon; any Railway
variable or setting; any deploy, redeploy or rollback; any change on the
PC or the MacBook; any name added to the allowlist; any update of the
copy.
