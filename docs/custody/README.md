# Build Room — Custody Records

Governed, PR-landed records that make the Build Room **working-folder custody**
verifiable. The custody artifacts themselves live on disk at
`~/MADVenturesOPs/build-room/` and are deliberately **not** committed here.

## Why this exists

Founder ruling, 2026-09-12:

> "Keep disk as working custody, and periodically land a manifest of hashes via
> PR — a single governed file listing what custody exists and its hashes, so the
> record is verifiable even though the artifacts aren't committed."

The working folder is not a governed repository, so custody on disk has no
version history and no tamper-evidence on its own. This directory closes that
gap: artifacts stay on disk, their identities live here.

## The artifact test

One question decides where a record goes — **does this file make a claim that
binds someone?**

- **It binds someone** → doctrine → the governing repository, via PR, with
  Tier-2 review and the Founder's separate SHA-named merge authorization.
- **It only evidences that something happened** → custody → disk, in the Build
  Room working folder, listed in the manifest below.

## Files

| File | What it is |
|---|---|
| `CUSTODY-MANIFEST.md` | Generated inventory: path, SHA-256, and byte count for every custody artifact on disk |
| `build-custody-manifest.sh` | The generator. Deterministic — same tree in, same bytes out apart from the generated-at line |

## Regenerating

```bash
cd ~/MADVenturesOPs/build-room
bash templates/build-custody-manifest.sh -o verification/CUSTODY-MANIFEST.md
```

Then copy the regenerated manifest here and land it by PR.

**Do not hand-edit the manifest.** Regenerate it. A hand-edited hash list is not
evidence of anything.

## A mismatch is a finding

If a hash in `CUSTODY-MANIFEST.md` does not match the artifact on disk at audit
time, that is a **finding to report** — the artifact changed, or it is not the
artifact this manifest describes. Regenerating the manifest to make it match is
the one thing that must never happen silently: it destroys the only
tamper-evidence the custody store has.
