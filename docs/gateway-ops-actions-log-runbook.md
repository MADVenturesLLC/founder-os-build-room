# Runbook — recording gateway enrolment acts in the FounderOS ops-actions-log

**Status:** ships with the gateway enrolment pairing PR. It documents an
obligation that attaches at **execution** of a live act, not at code
construction. Building the endpoints owes no row; performing a mint, a confirm
or a revoke does.

**Authority:** `DEC-20260730-01` clause 2, and the ops-log's own rules.

---

## What this is, and what it deliberately is not

`DEC-20260730-01` clause 2 requires a **manual, act-time row** appended to
`/07-decisions/ops-actions-log.md` in FounderOS, through the normal governed
flow, on the **same calendar day** as the act.

**There is no automated cross-repository writer, and this PR creates none.** No
ratified source establishes one. Such an integration would be a new mechanism
requiring a Founder decision, and none is needed: the acts are few, manual, and
Founder-performed by construction.

The control plane emits a structured log line named `founder_act` for each of
these acts. That line is **operational logging**. It is not an ops-actions-log
row, it is never labelled as one, and it does not satisfy clause 2.

Ops-log Rule 6 independently captures these acts as external-effect mutations.

---

## Which acts require a row

The three Founder-token acts that change the world outside this repository:

| Act | Endpoint |
| --- | --- |
| Mint a pairing code | `POST /control-plane/pairing-codes` |
| Confirm an enrolment | `POST /control-plane/enrollments/:gatewayId/confirm` |
| Revoke a gateway | `POST /control-plane/gateways/:gatewayId/revoke` |

Deny (`POST /control-plane/enrollments/:gatewayId/deny`) is recorded on the same
footing when it is performed as a deliberate Founder act.

Reads — listing pairing codes or enrolments — change nothing and owe no row.

---

## Minimum fields

Every row carries all of these:

| Field | Value |
| --- | --- |
| **When** | ISO-8601 UTC timestamp of the act |
| **Action** | `gateway.code_minted`, `gateway.enrollment_confirmed`, `gateway.enrollment_denied`, or `gateway.gateway_revoked` |
| **Previous state** | the projection state before the act (`none` for a mint) |
| **New state** | the projection state after the act |
| **Actor** | the Founder |
| **Trigger / resource** | the control-plane service, and the `gateway_id` (a mint has none — use the `pairing_id`) |
| **Related decision** | `DEC-20260818-01` |
| **Notes** | the registry `event_id` returned by the act |

The registry event id is the join between the row and the durable record. With
it, anyone reading the ops log later can find the exact append-only row the act
produced; without it, the two records are only circumstantially related.

---

## Procedure

1. **Before the act** — confirm the current projection state, so the "previous
   state" field is observed rather than assumed:

   ```
   GET /control-plane/enrollments
   ```

2. **Perform the act** through the Founder-token endpoint.

3. **Record the registry event id.** Query the append-only log for the event the
   act produced:

   ```sql
   SELECT event_id, event_type, gateway_id, occurred_at
     FROM gateway_registry_events
    ORDER BY seq DESC
    LIMIT 5;
   ```

4. **Append the row** to `/07-decisions/ops-actions-log.md` in FounderOS,
   through the normal governed flow, **the same calendar day**.

5. **Never paste the plaintext pairing code** into the ops log, into a message,
   or into any file. The code appears exactly once, in the mint response. Only
   `sha256(code)` is stored, and a code in a log is a live credential in a
   document nobody sweeps.

---

## Worked example

A mint, a confirm and a revoke, in the ruled order. Values are illustrative.

```
| 2026-08-19T14:02:11Z | gateway.code_minted | none | minted | founder |
| control-plane; pairing_id=8f1d0c2a-... | DEC-20260818-01 |
| registry event_id=3a77b41e-...; code delivered out of band, never logged |

| 2026-08-19T14:31:47Z | gateway.gateway_revoked | enrolled | revoked | founder |
| control-plane; gateway_id=b2c9e5d1-... | DEC-20260818-01 |
| registry event_id=91ab6c40-...; incumbent revoked BEFORE successor confirmation |

| 2026-08-19T14:33:02Z | gateway.enrollment_confirmed | awaiting_approval | enrolled | founder |
| control-plane; gateway_id=5e40a7bb-... | DEC-20260818-01 |
| registry event_id=cc12f8e3-...; fingerprint compared out of band against `buildroom enroll` output |
```

Note the ordering in the example: **revoke the incumbent first, confirm the
successor second.** Since `FOUNDER-ACT-20261010-TWO-GATEWAYS` (amending
`DEC-20260818-01` clause 5, migration `0009`), up to two gateways may be
enrolled at once, each holding one of two enrollment slots; a partial unique
index on the slot is what refuses a third. So the order depends on how many
slots are held:

- **Both slots held** (two gateways enrolled): the example's order is the only
  one. A confirmation attempted first returns `409 enrollment_cap_reached`.
  During the gap between the two acts the other enrolled gateway, if live,
  keeps the derivation online.
- **One slot held**: the successor may be confirmed before the incumbent is
  revoked (the act's B5 and its clarification). The machine then briefly holds
  two enrolled gateways; the overlap ends when the incumbent is revoked, and
  revocation stays a Founder act. Record both acts as rows, as in the example.

`another_gateway_enrolled` was the refusal under the cap of one; rows written
before migration `0009` still carry it, and the control plane no longer writes
it. A Phase 3 counted run still requires exactly one enrolled gateway (the
act's B4), and is refused while two are enrolled.

---

## Verification evidence

This runbook ships in the PR. The evidence the phase gate checks is the **first
live act's same-day row in FounderOS** — the established founder-acts,
builder-records pattern. No row is owed until an act is performed.

---

## Confirming a fingerprint

`buildroom enroll` prints a fingerprint and asks that it be handed to the
Founder. The confirm endpoint recomputes the fingerprint from the public key the
server actually stored and refuses on any mismatch with
`409 fingerprint_mismatch`.

That comparison is the control against a substituted key, and it only works if
the fingerprint travels **out of band** — read from the machine's own terminal,
not from anything the redeeming machine sent. A fingerprint relayed through the
same channel as the key proves nothing.
