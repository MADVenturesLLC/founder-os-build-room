# Linux Gateway — design note (r1)

**Status:** DRAFT. This note is owed under B6 of
`FOUNDER-ACT-20261010-BUILD-ROOM-LINUX-GATEWAY` (recorded verbatim in
FounderOS `DEC-20260815-14`). It takes effect only by a separate Founder
act that ratifies its exact text. Until then it authorizes nothing: no
Gateway code, test, sandbox profile, AppArmor profile, custody
implementation, CI change, enrollment or production change. Where it
disagrees with a FounderOS decision, the decision governs.

**Base:** Build Room `main` at `0d2b97b15fafe84ae0322df0a8fa4bcf00c61556`
(merge of PR #110, 2026-10-12). Every `file:line` below is at that base.

**Drafted by:** the builder (`claude-code` surface), 2026-10-12, from a
read of the base. Nothing was run on the PC or a Mac to draft it.

Claims are labeled **[Certain]** (read directly from the code, the act or
a primary document), **[Likely]** (a strong inference from those) or
**[Guessing]** (a proposal or a reading not yet checked on the PC).

## 1. What the act asks of this note

B6 asks for one note covering B2 to B5:

- **B2:** every place the code branches on the operating system, each
  named here and exercised on its own operating system in CI and at
  certification.
- **B3:** one custody backend for Linux, either TPM2-sealed
  `systemd-creds` or the Secret Service, with reasons.
- **B4:** the Linux sandbox profile, at least as restrictive as
  `DEC-20260815-14` clause 2, with every restriction that has no Linux
  equivalent named for the Founder's ruling.
- **B5:** the worker supervisor fix and the Linux form of the
  Prerequisite C `lsof` checks.

B9 adds one more item: the note fixes the Gateway's Node and Bun
versions (section 7).

Section 8 lists the questions that stop for the Founder's ruling.
Ratifying this note with no ruling on one of them leaves that item
unresolved; it does not accept the builder's recommendation by default.

## 2. Three facts that shape everything below

1. **[Certain] No sandbox exists on either operating system.** Nothing
   in `packages/`, `scripts/`, `test/` or `contracts/` calls
   `sandbox-exec`, bubblewrap, Landlock or seccomp, and there is no
   profile, static or generated. The repository disclaims sandboxing on
   purpose: `docs/planning/room-runtime-phase0/phase0-evidence.md:62-69`,
   `test/phase0-filesystem-boundary.test.ts:60-84`, and the "Not a
   filesystem sandbox" section of each file in `contracts/seats/`. Clause
   2's `sandbox-exec` posture is ratified but was never built. So "at
   least as restrictive as clause 2" is measured against clause 2's text,
   not against running macOS code.
2. **[Certain] Nothing in the Gateway runs a task yet.** The `providers`
   verb is a fixed refusal (`packages/gateway-cli/src/commands.ts:65`,
   `runProviders`).
   A sandbox has nothing to confine until a Gateway path executes a
   builder's task. Section 5.4 draws the consequence.
3. **[Certain] CI never runs on macOS.** Every job in
   `.github/workflows/` uses `runs-on: ubuntu-latest`. The real-Keychain
   suite runs only by hand (`package.json:33`, `test:custody:macos`), and
   the Prerequisite C suite skips in CI because CI lacks its pinned
   runtime (`test/support/require-prereq-c-runtime.ts`). B2's "exercised
   on its own operating system in CI" is therefore not met today for the
   branches that already exist. Section 3.3 proposes the CI change.

## 3. Operating-system branches (B2)

### 3.1 The branches

B2 allows a branch only where an operating-system facility differs. Each
branch below has one switch, chosen on `process.platform` (or
`os.platform()`), never on a host name, user or path.

| # | Branch | Where | macOS | Linux (Ubuntu 26.04, `x86_64`) |
|---|---|---|---|---|
| P1 | Gateway key custody | new factory in `packages/gateway-daemon`, replacing the three constructions at `packages/gateway-cli/src/bin.ts:91`, `packages/gateway-daemon/src/main.ts:59`, `packages/run-harness/src/phase3/cli.ts:67` | Keychain through `/usr/bin/security`, as today | `systemd-creds --user`, TPM2-sealed (section 4) |
| P2 | Keychain write prompt | `packages/gateway-daemon/src/custody.ts:108` (exists) | `expect` drives the `security` prompt | not reached: P2 lives inside P1's macOS backend |
| P3 | Redaction HMAC key source | `packages/run-harness/src/redaction-boundary.ts:89-96` (exists) | `KeychainHmacKeyCustody` | a read-only `systemd-creds` source (section 4.6) |
| P4 | Unix socket path limit | `packages/gateway-daemon/src/ipc.ts:163` (exists) | 104 bytes | 108 bytes |
| P5 | Phase 3 machine identity | `packages/run-harness/src/phase3/cli.ts:358-370` (exists) | `/usr/bin/sw_vers` | **stops for ruling R1** |
| P6 | Sandbox launcher | none exists | `sandbox-exec` (not built) | bubblewrap, Landlock, seccomp (section 5) |

Test-only branches, which prove the same property by the means each
operating system offers:

| # | Branch | Where | macOS | Linux |
|---|---|---|---|---|
| T1 | Socket-pair proof (5.2) | `test/worker-supervisor.prereq-c.storage.test.ts:203-255` | `lsof` names `->0x…` | `lsof` plus `/proc/net/unix` (section 6.3) |
| T2 | Descriptor-custody proof (5.6) | same file, `:257-293` | compares `lsof` names | compares socket inodes (section 6.3) |
| T3 | Worker environment read | `test/room-runtime-phase1-c2.storage.test.ts:160` | `ps -E` | `/proc/<pid>/environ` |
| T4 | Occupancy-lock proof | `test/phase0-occupancy-lock.test.ts:118-120` (exists) | `O_EXLOCK` | none; see below |
| T5 | Real custody suite | `test/custody-macos.test.ts` (exists) | real Keychain | a new real `systemd-creds` suite |
| T6 | HMAC source wiring | `test/run-harness-redaction-wiring.test.ts:179-185` | Keychain | its Linux assertion changes from "unavailable" to the P3 source |

T4 has no Linux counterpart, on purpose. **[Certain]** Its header calls
`O_EXLOCK` "the Founder-confirmed Phase 0 proof mechanism only; not a
production selection" (`test/phase0-occupancy-lock.test.ts:21-23`), and no
production code takes that lock. Linux has no `O_EXLOCK`. If a production
occupancy lock is ever selected, its Linux mechanism is part of that
selection, not of this note.

### 3.2 What does not branch

- **The Gateway directory.** `packages/gateway-daemon/src/paths.ts:14-17`
  puts `state.json`, `staging.lock` and `ipc.sock` under
  `~/Library/Application Support/founder-os/gateway/` on every operating
  system. **Recommendation:** keep that path on Linux and add no branch.
  It works on Linux. The XDG base-directory layout (`~/.local/state`) is a
  convention, not a facility, and B2 allows a branch only for a facility.
  The socket path fits Linux's 108-byte limit, which leaves 107 bytes for
  the path after its terminating NUL (`ipc.ts:170-178`), for any home
  directory up to 51 bytes, since the suffix is 56 (`/home/michaeldaley`
  is 18). The alternative, an XDG
  path on Linux, costs one more branch and one more thing to certify.
  The Founder may choose it by ruling R2.
- **Starting the daemon.** `packages/gateway-cli/src/offer.ts` spawns the
  daemon detached, and `launchd` is out of scope. On Linux a `systemd`
  user unit stays out of scope in the same way.
- **The host descriptor.** `packages/gateway-cli/src/bin.ts:120` sends
  `platform()` at enrollment as data. On the PC it sends `linux`. The
  control plane checks the field's length only
  (`packages/control-plane/src/gateway/enroll-validation.ts:49-52`).
- **`/usr/bin/git`** (`packages/run-harness/src/phase3/repository.ts:142`),
  the staging lock, `state.json` writes and the IPC framing are already
  portable.

### 3.3 CI and certification

B2 asks that each branch be exercised on its own operating system in CI
and at certification. Proposed:

- **A macOS job** next to `build-and-test` in `.github/workflows/ci.yml`:
  build, typecheck, the default suite, and the real-Keychain suite (T5)
  under a synthetic service name. **[Guessing]** Whether a hosted macOS
  runner's login keychain accepts that suite is checked when the job is
  added. If it does not, the job creates and unlocks a temporary keychain,
  and that test-only difference is recorded. **[Likely]** Hosted macOS
  minutes cost more than Linux minutes for a private repository. That
  spend is the Founder's to accept, in the implementation act.
- **The existing Linux jobs** keep running everything they run today,
  plus P1, P3 and T6 against a fake `systemd-creds` runner.
- **The real Linux custody suite cannot run on hosted runners.**
  **[Likely]** `systemd-creds --user` arrived in systemd 256, while
  `ubuntu-latest` is Ubuntu 24.04 with systemd 255, and hosted runners
  have no TPM. So in CI the Linux backend is exercised only against
  fakes. The real backend is exercised at certification on the PC, the
  way the real Keychain is exercised on a Mac today. This is a gap
  against B2's wording, named as ruling R3.
- **Certification (B7):** one reviewed commit passes, on the PC and on a
  Mac: the default suite, every storage suite, the runtime-role tier,
  the Prerequisite C proof in full (15 of 15), the real custody suite of
  that operating system, and `scripts/gateway-smoke.sh`. Each report
  names its host, under the act's B9.

## 4. Key custody on Linux (B3)

### 4.1 Recommendation

**Use `systemd-creds --user`, with a key that includes the TPM2 chip.**
The Gateway's private key and the redaction HMAC key are each kept as an
encrypted credential file that only this machine's TPM can decrypt, for
this user only.

### 4.2 How `systemd-creds --user` works

**[Certain]**, from systemd's own manual page (`man/systemd-creds.xml`)
and its release notes (`NEWS`):

- `--user`, added in systemd 256, encrypts "a user-scoped (rather than a
  system-scoped) credential … Such credentials may only be decrypted from
  the specified user's context". The user's UID, user name and the
  machine's `machine-id` are mixed into the key.
- Per-user credentials are encrypted and decrypted through the
  `systemd-creds.socket` Varlink service. The calling process never
  touches the TPM or the root-only host key itself.
- `--with-key=tpm2` (or `host+tpm2`) binds the key to the TPM chip: "the
  credential secured in this way can only be decrypted again by the
  local machine". The default, `auto`, quietly drops the TPM when none is
  found or when running in a container.
- `--tpm2-pcrs=` empty, the default, binds to no PCR values.
- Input and output may be `-`, meaning standard input and standard
  output.
- `--name=` embeds a name at encryption and checks it at decryption.
- From systemd 262, credentials are also pinned to the TPM's storage root
  key, and earlier versions cannot decrypt them.

**[Guessing]** Ubuntu 26.04 ships systemd 256 or later. The act's A3 saw
`systemd-creds` with TPM2 support on the PC. The version is checked on the
PC before implementation: `systemd-creds --version`, then an encrypt and
decrypt round trip with `--user`.

### 4.3 How each B3 guarantee is met

The Linux backend keeps the behaviour of today's `Custody` class
(`packages/gateway-daemon/src/custody.ts:150-288`), operation by
operation. Files live in `<gateway directory>/custody/`, which is mode
0700; each file is mode 0600.

| B3 guarantee | Linux design |
|---|---|
| No plaintext-file fallback | Only ciphertext reaches disk. The key always includes the TPM: `--with-key=tpm2` or `host+tpm2`, whichever the PC accepts in `--user` mode, checked on the PC. Never `auto` (it can silently leave out the TPM) and never `null`. |
| `enroll` and `doctor` fail closed | A new `probe()` operation runs an encrypt and decrypt round trip of a random, non-secret value through standard input and output, writing nothing to disk. `enroll` calls it before it reads the pairing code or generates a keypair; `doctor` reports its error code. Section 4.5 fixes the defect that blocks this today on macOS too. |
| Every write verified by read-back | After each write, the file is decrypted with `--name=<account>` and compared byte for byte with the secret. A mismatch is `write_unverified`. |
| Nothing deleted before a read-back succeeds | Promotion keeps today's four steps (`custody.ts:189-227`): read staging twice and compare, write primary, read primary back, and only then delete staging. |
| Staging creation fails if an item exists | The ciphertext is written to a temporary file in the same directory, then `link(2)`ed to `staging.cred`. `link` fails with `EEXIST` when the name exists, atomically, so no partial staging file can ever exist. The temporary file is then removed. |
| Primary replaced only by promotion | Promotion never moves the staging file. Each credential carries its name inside the ciphertext, so the secret read back from staging is encrypted afresh with `--name=primary` into a temporary file, which then replaces `primary.cred` by `rename(2)`. That replacement is the Linux counterpart of `security -U`, which the code calls "the sole permitted `-U` use in the contract" (`custody.ts:19-20`). |
| Deletion verified | `unlink`, then a check that the file is gone (`ENOENT`). |
| No secret in a log, diagnostic, environment variable or argv | The secret reaches `systemd-creds` only on standard input and comes back only on standard output. `/usr/bin/systemd-creds` is spawned by absolute path with an argv array and no shell. Error details keep the tool's exit code and standard error, never standard output. |

Error codes stay as they are: `keychain_unavailable`, `item_not_found`,
`write_unverified` (`custody.ts:35`). **Recommendation:** keep the code
`keychain_unavailable` on Linux, documented as "the custody backend is
unavailable". Renaming it would change the CLI's output contract and its
tests for no gain in safety.

### 4.4 The code change custody needs

- **Pull an interface out of `Custody`.** Today the seam is
  `KeychainRunner` (`custody.ts:66-68`), which speaks `security` argv,
  and every consumer types against the concrete class (`enroll.ts:39`,
  `doctor.ts:35`, `daemon.ts:31`, `phase3/cli.ts:57`). A Linux backend
  would otherwise have to imitate `security`'s argv and exit code 44. The
  interface has today's five operations plus `probe()`. The Keychain
  class implements it unchanged; the Linux class implements it from
  scratch.
- **One factory, one switch.** A factory in `packages/gateway-daemon`
  returns the Keychain backend on `darwin`, the `systemd-creds` backend
  on `linux`, and on any other platform a backend whose every operation
  fails `keychain_unavailable`. The three construction sites call it.
  As today, no environment variable selects a backend (`bin.ts:6-9`,
  `main.ts:13-15`).

### 4.5 A defect this fixes on both operating systems

**[Certain]** `inventory()` swallows every error
(`custody.ts:273-287`: `readQuietly` catches and returns `null`), so:

- `doctor`'s error branch (`packages/gateway-cli/src/doctor.ts:63-67`)
  cannot be reached. With custody broken, `doctor` prints "absent" for
  both items and "error: none". The promise in `custody.ts:22-23`,
  "`doctor` says why", is not kept today.
- `enroll`'s guard (`enroll.ts:94`) cannot see a broken Keychain. It
  still fails closed, but only at `createStaging` (`enroll.ts:116`),
  after it has read the pairing code (`:109`) and generated a keypair
  (`:115`).

Fix: `inventory()` reports an unavailable backend instead of "absent",
`doctor` prints its code, and `enroll` calls `probe()` before it reads the
pairing code. New tests assert both, on each operating system. Today
there is no test that `doctor` shows a custody error.

### 4.6 The redaction HMAC key on Linux

- `packages/redaction/src/key-custody.ts` already has a proper interface,
  `HmacKeyCustody` (`:36-38`), and the code never writes the key.
- P3 adds a read-only `systemd-creds` source: it decrypts
  `hmac-v1.cred` with `--name=hmac-v1` and applies the same checks as the
  Keychain source (even-length hex, at least `MIN_HMAC_KEY_BYTES`;
  `:104-111`). A missing file is `absent`; any other failure is
  `unavailable`.
- Its file sits beside the Gateway's, in
  `~/Library/Application Support/founder-os/redaction/` under R2's
  recommendation.
- Minting the key on the PC stays a Founder custody act, as on a Mac
  (`key-custody.ts:7-14`). The value is typed or piped into
  `systemd-creds --user encrypt --with-key=<mode> --name=hmac-v1 - <file>`,
  never placed in argv, where `<mode>` is the TPM mode of section 4.3
  fixed on the PC (`tpm2` or `host+tpm2`), never left to `auto`.
- **Ruling R4:** B8's "no private key moves from a Mac to the PC" names
  the Gateway's key. Whether the PC's HMAC key is a new value or the
  Mac's value carried across by the Founder is a separate choice.
  **[Guessing]** Two different values would turn the same secret into
  different redaction tokens on the two hosts. Whether anything compares
  those tokens across hosts was not checked for this note.

### 4.7 Why not the Secret Service

| | `systemd-creds --user` (TPM2) | Secret Service (`secret-tool`) |
|---|---|---|
| Staging must fail if an item exists | Met atomically by `link(2)` | Not met: `secret-tool store` silently replaces an item. Check-then-store is a race; the staging lock covers only the Gateway's own processes. |
| Works with no desktop login (after a reboot, over SSH, for a daemon) | Yes: the Varlink service is a system service | **[Likely]** No: the keyring stays locked until a desktop login unlocks it |
| Who else can read the secret | Any process running as the same user that can reach the Varlink socket and the file | Any process on the user's session bus, with no prompt, once unlocked |
| Can be hidden from a sandboxed process | Yes: leave the file and the Varlink socket out of the sandbox | Only by cutting the whole session bus |
| A copied file on another machine | Useless: the key is in this TPM | The keyring file opens with the login password anywhere |
| Can be tested on hosted CI runners | **[Likely]** No (section 3.3) | **[Likely]** Yes, with a headless keyring daemon |

The Secret Service wins only on CI testability. It fails the staging
guarantee outright, and it fails headless use, which a daemon needs.

**Parity with the Keychain, stated plainly.** **[Likely]** An item that
`/usr/bin/security` creates can be read back by any process of the same
user that runs `security`; that is how the Gateway reads it today. Under
`systemd-creds --user`, any process of the same user can likewise ask the
Varlink service to decrypt a file it can read. Neither backend protects a
secret from code already running as the Founder's user. Both protect it
at rest and from other users, and the TPM binding adds protection against
a copied disk.

### 4.8 What is lost, and when

- A cleared TPM, a new motherboard, or a reinstall that loses
  `/var/lib/systemd/credential.secret` (if `host+tpm2` is used) makes the
  files undecryptable. The Gateway's key is then gone: the Founder
  revokes that Gateway and enrolls the PC again under
  `DEC-20260818-01`. The HMAC key is re-minted by a Founder custody act.
  A wiped Mac loses its Keychain the same way.
- **Recommendation:** bind to no PCRs (the default). A PCR binding ties
  decryption to the measured boot state, so a kernel or firmware update
  would lock the Gateway out until it is re-enrolled. Ubuntu updates its
  kernel often. The cost of this choice: the key does not depend on
  Secure Boot or on the boot chain being unchanged.
- After systemd 262, credentials written by a newer systemd cannot be
  read by an older one. A downgrade of systemd on the PC would lock the
  Gateway out the same way.

## 5. Sandbox on Linux (B4)

### 5.1 The profile, clause by clause

Clause 2 of `DEC-20260815-14` lists six restrictions. "Equivalent" means
the Linux mechanism enforces the restriction in the kernel at least as
strictly as `sandbox-exec` would.

| Clause 2 restriction | Linux mechanism | Status |
|---|---|---|
| Filesystem write allowlist = worktree ∩ approved scope paths | bubblewrap builds the sandbox's filesystem from an empty root: the system directories it needs are bound read-only (5.1, "Reads"), and each allowed path is bound read-write, by its canonical path. Inside, a Landlock ruleset grants write access beneath those paths only. | Equivalent, two layers |
| Network egress allowlist | bubblewrap `--unshare-net` leaves no network at all. Allowed egress goes through a proxy outside the sandbox, reached by a Unix socket bound in, which allows only listed hosts. | **No direct equivalent: ruling S1** |
| No shell (`spawn` argv arrays only, no `sh -c`) | Enforced by the Gateway's spawner, as it would be on macOS | **Not a kernel restriction: ruling S3** |
| Hooks disabled | Git run with `core.hooksPath=/dev/null`; `.git/hooks` mounted read-only | Spawner and mount: ruling S3 |
| Submodule allowlist | Git configuration and the network allowlist | Spawner: ruling S3 |
| Canonical path resolution, cross-boundary symlink refusal | The Gateway resolves each path with `realpath` and refuses any outside the worktree before binding it. Landlock checks writes against where a file really is, so a symlink pointing outside an allowed tree cannot be written through. | Equivalent |

Beyond clause 2, the Linux profile also restricts what clause 2 leaves
open. These only add restriction, which B4 allows:

- **Reads:** the host's `/` is not bound. Only the system directories a
  toolchain needs (`/usr`, the `/bin`, `/sbin` and `/lib*` links, and
  named files under `/etc`) are bound read-only, with a new `/proc`, a
  minimal `/dev`, and an empty `tmpfs` at each of `/tmp`, `/run`,
  `/var/run` and the home directory. Only the worktree and the toolchains
  are bound back. Hidden by this: the Gateway directory, the custody
  files, `~/.ssh`, and every other credential store.
- **Sockets:** because `/run` is an empty `tmpfs`, the sandbox has no
  path to `/run/user/<uid>/` (the D-Bus session bus and, usually, the SSH
  agent), to the `systemd-creds` Varlink socket under `/run/systemd/`, or
  to any other runtime socket on the host. `--unshare-net` also separates
  abstract Unix sockets, which belong to the network namespace. The one
  socket bound in is the egress proxy's (S1). A sandboxed process cannot
  ask for a decryption. Certification checks this from inside the
  sandbox: connecting to each of those paths must fail.
- **Processes:** new PID, IPC and UTS namespaces; `--die-with-parent`;
  `--new-session`, which blocks terminal injection; and
  `--disable-userns` (bubblewrap 0.8.0 and later, so in the PC's 0.11.1),
  so the sandbox cannot make namespaces of its own.
- **Seccomp:** denies `ptrace`, `mount`, `unshare`, `setns`, `keyctl`,
  `bpf`, `perf_event_open`, kernel module calls and `AF_NETLINK`
  sockets; refuses `clone` with namespace flags.
- **Environment:** an explicit allowlist, as the worker already has
  (`packages/worker-supervisor/src/index.ts:271-274`).

### 5.2 AppArmor

**[Certain]** The act's A3 found unprivileged user namespaces restricted
by AppArmor on the PC (the Ubuntu default). bubblewrap needs a user
namespace. So the profile is:

- one AppArmor profile attached to `/usr/bin/bwrap` that allows `userns`
  and nothing more, as B4 requires;
- an explicit exec transition in that profile, so the program bubblewrap
  starts runs under a second, named profile that does not allow `userns`.
  Without a named transition an AppArmor profile is inherited across
  `exec`, and the task would keep bubblewrap's `userns` permission.
  `--disable-userns` (5.1) is a second, independent bar on nested user
  namespaces. Certification checks from inside the sandbox that creating
  a user namespace fails.

Loading an AppArmor profile needs root. That makes it a step the Founder
runs on the PC, not something the Gateway installs: ruling S5. If the
profile is missing, the Gateway refuses to start a sandboxed task. It
never runs one without the sandbox.

**[Guessing]** Whether Ubuntu 26.04 already ships a usable `bwrap`
profile is checked on the PC at implementation. The act requires a
profile that allows only what bubblewrap needs, so one shipped by Ubuntu
is used only if it meets that.

### 5.3 Restrictions with no Linux equivalent (stop for ruling)

- **S1. Egress allowlist by host name.** The Linux kernel cannot allow
  traffic by host name for an unprivileged process. Landlock filters TCP
  by port only, and a network namespace allows all traffic or none. So
  host-level allowlisting needs the proxy design of 5.1, enforced in user
  space by the Gateway's proxy, with the kernel guaranteeing that the
  proxy is the only way out. **[Likely]** `sandbox-exec` filters by
  address and port, not by host name, so a macOS build would need the
  same proxy. Asked: does a proxy-enforced allowlist behind a no-network
  namespace meet clause 2?
- **S2. A temporary directory.** Clause 2 lists no temporary directory;
  the planning package adds one
  (`source/fable-architecture-implementation-planning-package-v1.0.md:2126-2131`).
  Builds need one. Proposed: a private `tmpfs` for each task, gone when
  the task ends, that writes nothing to the host's disk. Asked: is that
  inside clause 2's allowlist?
- **S3. No shell, hooks disabled, submodule allowlist.** On either
  operating system these are kept by how the Gateway spawns processes
  and configures git, not by the kernel profile. A kernel profile cannot
  tell a shell from any other program without breaking every toolchain,
  and provider CLIs start shells of their own. Asked: are these accepted
  as spawner-enforced? Related, **[Certain]**:
  `packages/run-harness/src/platform.ts:117` spawns with `shell: true`.
  It is the Phase 2 harness's own command runner, not a task path. It
  would break "no shell" if a task ever ran through it.
- **S4. Native code.** Node has no Landlock or seccomp binding, and
  bubblewrap's `--seccomp` takes a compiled filter. Both need native code
  that the Build Room does not carry today: a small helper, built in the
  repository and reviewed, or a packaged tool. Asked: which, under which
  supply-chain review?
- **S5. Root steps on the PC.** Loading the AppArmor profile, and keeping
  it loaded across upgrades, is a Founder host step. Asked: is it a
  separate Founder act, or part of the implementation act?

### 5.4 When the sandbox is built (ruling S6)

Fact 2 of section 2 means the sandbox has no process to confine until a
Gateway path runs a task, and that path does not exist on either
operating system. **Recommendation:** build the sandbox, on both
operating systems at once, in the tranche that first runs a task through
the Gateway. Leave it out of B7, which then covers P1 to P5, the custody
fix, the supervisor fix and CI. The profile in 5.1 is the design for that
tranche on Linux, and that tranche's macOS profile must meet the same
table. Building the Linux sandbox in B7 instead would put a profile in
place with nothing to apply it to, and would leave Linux ahead of macOS.

## 6. The worker supervisor (B5)

### 6.1 The defect

**[Certain]** The supervisor spawns the Bun worker with three socket
channels, fds 3 to 5 (`packages/worker-supervisor/src/index.ts:262-276`),
and attaches:

- no `'error'` listener to fd 3 (`this.control`, `:280`, `:298`), fd 4
  (`:300`) or fd 5 (`:301`);
- no `child.on('error')` (compare `custody.ts:124-126`, which has one);
- its lasting `'exit'` handler only after the handshake (`:333`).

When a worker is killed with unread frames in fd 3, Linux reports
`ECONNRESET` on the Gateway's end. The socket emits `'error'`, nothing
handles it, and Node raises an uncaught exception. **[Likely]** macOS
reports end-of-file there instead, which is why only Linux fails. The act
saw it as tests 5.9, 5.11a and 5.11b failing on the PC (A4).

### 6.2 The fix

In `start()`, straight after the spawn and before the handshake:

- one handler for `'error'` on fds 3, 4 and 5, and for `'error'` on the
  child. It calls `failAllPending('worker_lost', <message>)`
  (`:536-542`), sets the state to `lost` unless it is `disposed`, and
  sends `SIGKILL` to the worker if it is still running. It does not emit
  `'worker-exit'` or `'worker-lost'`; the existing exit handler
  (`:520-533`) still does that when the process exits, so each fires
  once. It does not throw.
- the handlers stay attached for the supervisor's lifetime, through
  `dispose()`, so a late error after disposal is absorbed, not uncaught.

Why `worker_lost`: B5 says "a channel error is worker loss", and
`worker_lost` is the code the supervisor already uses for that
(`:307`, `:525`). It is one of the three codes test 5.9 accepts
(`test/worker-supervisor.prereq-c.storage.test.ts:493`). No new code is
added, so the error-code list in `ipc-contract.md` §5 is unchanged.

The three Linux failures, after the fix:

- **5.9:** the kill's `ECONNRESET` and the exit both lead to
  `worker_lost`. The test passes whichever arrives first.
- **5.11b:** the framing error rejects the pending request with
  `transport_broken` first (`index.ts:465`). The later `ECONNRESET` finds
  nothing pending. The test still sees `transport_broken`.
- **5.11a:** the worker exits with code 2, and the exit handler reports
  it as today.

A spawn failure (for example `ENOENT` for the Bun binary) now rejects the
handshake at once with `worker_lost`, instead of waiting for
`request_timeout`.

**What else the fix changes.** `test/worker-supervisor-contract.test.ts:61-65`
pins `index.ts` and `ipc-contract.md` by SHA-256 as "Phase 1 files this
lane must not touch". The fix changes `index.ts`, and `ipc-contract.md`
gains one sentence: "any error on a worker channel is worker loss". Both
pins are updated in the same change. Updating a guard pin must be named in
the implementation act. The comments that say "Unix/macOS"
(`index.ts:31-44`, `:267`) become "Unix (macOS and Linux)".

### 6.3 Prerequisite C on Linux

B5 requires the `lsof` checks to accept the Linux format "while still
proving unnamed, unbound, connected sockets". **[Certain]**, from a run on
an Ubuntu 24.04 host with lsof 4.95 for this note: for a child's fds 3
to 5, `lsof -F ftn` prints type `unix` and the name `type=STREAM`. That
satisfies "no `/` in the name" and the empty `-i` result. It fails
`name.startsWith('->')` (`:221-229`), and **it proves nothing about
being connected.** So the Linux check needs a second source.

**Test 5.2 on Linux** (branch T1) keeps the platform-neutral checks: at
least three `unix` rows; fds 3, 4 and 5 of type `unix`; no `/` in any
name; `lsof -a -n -p <pid> -i` empty; no socket file under the work
directory. In place of the `->` check it adds, for each of fds 3, 4
and 5:

- read `/proc/<pid>/fd/<n>`, which must be `socket:[<inode>]`;
- find that inode in `/proc/net/unix`, the kernel's own table. It must
  have an empty path (unnamed), state `03` (connected), and no
  listening flag (unbound: never `listen()`ed);
- find its peer with `ss -x -p`, which must be a socket held by the
  supervising Gateway process and by nothing else.

On Linux this proves more than the macOS check does. macOS shows that a
peer exists; Linux shows which process holds it.

**Test 5.6 on Linux** (branch T2) compares socket inodes, not names. On
Linux every name is the same `type=STREAM`, so comparing names proves
nothing, and it fails falsely if the sibling holds any Unix socket. The
check becomes: the worker's fd 3 to 5 inodes and their peers' inodes
appear in no descriptor of the unrelated sibling.

**Worker environment** (branch T3): `ps -E` is BSD-only; on procps it
exits with an error and prints nothing, so the assertion at
`test/room-runtime-phase1-c2.storage.test.ts:163` fails. On Linux the
test reads `/proc/<pid>/environ`, NUL-separated, which is the kernel's
own record.

The suite's runtime gate (`test/support/require-prereq-c-runtime.ts`)
requires Node exactly v22.23.2 and a `madventures-tui` checkout at
`3d5c4c97` or a descendant. **[Certain]** For Bun it requires only that a
`bun` executable be on the path: it records the version but refuses only
a missing executable (`:165-179`). Section 7 fixes Bun at 1.4.2, so the
implementation makes the gate refuse any other Bun version, as it already
does for Node. B7 requires all 15 tests to pass on the PC and on a Mac.

## 7. Versions (B9)

- **Node v22.23.2** on the PC and on every Mac that runs the Gateway: the
  version the Prerequisite C proof pins. `package.json` keeps
  `"node": "^22.13.0"` as the floor for everything else.
- **Bun 1.4.2**, as `FOUNDER-ACT-20261010-LINUX-HOST-SCOPE` B8 fixes.
- **systemd 256 or later** on the PC, for `--user` (section 4.2).
- **bubblewrap 0.11.1** as the act's A3 observed. Only relevant once the
  sandbox is built (section 5.4).
- **Ubuntu 26.04 LTS on `x86_64`**, the one Linux host profile B1
  allows.

## 8. Rulings asked of the Founder

Each stops here until the Founder rules. The builder's recommendation is
given; ratifying the note does not adopt it unless the ratifying act
says so.

| # | Question | Recommendation |
|---|---|---|
| R1 | Phase 3's counted-run harness refuses anything but macOS (`phase3/cli.ts:359`). Lifting that touches the counted-run gate, which the act's Part D leaves unchanged. Lift it for Linux, or keep it? | Keep it until an act on the counted-run gate says otherwise. Then the Linux branch reads `/etc/os-release` and reports `<host>+ubuntu:<VERSION_ID>+<arch>`. |
| R2 | The Gateway directory on Linux: the macOS-style path, or the XDG path? | The macOS-style path, with no branch (section 3.2). |
| R3 | The real Linux custody backend cannot run on hosted CI runners (section 3.3). Accept fakes in CI plus the real suite at certification, or require a runner that can run it? | Fakes in CI plus the real suite at certification, which matches how the Keychain is tested today. A self-hosted runner on the PC is new infrastructure with its own act. |
| R4 | The PC's HMAC key: a new value, or the Mac's value carried across? | No recommendation. It depends on whether redaction tokens are compared across hosts, which this note did not check. |
| S1 | Does a proxy-enforced host allowlist behind a no-network namespace meet clause 2's egress allowlist? | Yes. |
| S2 | Is a private per-task `tmpfs` inside clause 2's write allowlist? | Yes. |
| S3 | Are no-shell, hooks and submodules accepted as spawner-enforced on both operating systems? | Yes. |
| S4 | The native code for Landlock and seccomp: built in the repository, or a packaged tool? | Built in the repository and reviewed, kept small. |
| S5 | Loading the AppArmor profile on the PC: its own Founder act, or part of the implementation act? | Its own act, run by the Founder. |
| S6 | Build the sandbox in B7, or with the first Gateway task path, on both operating systems? | With the first task path (section 5.4). |

## 9. Paths named here that do not exist at the base

Files under `docs/planning/` are outside the path audit, so a plan must
state which of the paths it names do not exist at its base
(`scripts/path-audit.sh`). None of these exists at `0d2b97b`; each would
be created by the implementation, under its own act:

- `<gateway directory>/custody/`, `staging.cred`, `primary.cred` (the
  PC's runtime files, not repository files)
- `~/Library/Application Support/founder-os/redaction/hmac-v1.cred` (a
  runtime file on the PC)
- the Gateway custody factory and the `systemd-creds` backend, in
  `packages/gateway-daemon/src/` (file names chosen at implementation)
- the read-only `systemd-creds` HMAC source, in `packages/redaction/src/`
- the real Linux custody suite, in `test/`
- the AppArmor profile and the sandbox helper of S4 (location chosen when
  the sandbox is built)
- a macOS job in `.github/workflows/ci.yml` (the file exists; the job
  does not)

Every other repository path named here exists at the base.

## 10. Sources

- `FOUNDER-ACT-20261010-BUILD-ROOM-LINUX-GATEWAY`, as recorded in
  FounderOS `07-decisions/DEC-20260815-14-gateway-platform-sandbox.md`
  (7,690 bytes, SHA-256
  `b21fabf6b1571dbd945e394f8713ca91b2af1ee62c74d56c3bf6daf4fbe7e945`).
- `DEC-20260815-14` clauses 2 and 3, same file.
- systemd `man/systemd-creds.xml` and `NEWS` on systemd's `main` branch,
  read 2026-10-12: `--user` and `--uid=` (v256), `--with-key=`,
  `--tpm2-pcrs=`, `--name=`, the `systemd-creds.socket` Varlink service,
  and the v262 storage-root-key pinning.
- The base's code and tests, as cited in each section.
