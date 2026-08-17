# Phase 2 — provider-side spend controls (exit criterion 2)

`DEC-20260815-17`'s Phase 2 exit criterion 2 requires **provider-side billing
caps or alerts in place before provisioning, with the named check and timestamp
recorded**. `DEC-20260815-09`'s Founder ruling of 2026-08-17 fixes the control
as a **USD 50 cap plus alerts on both providers**, and a same-day Founder
confirmation fixes the USD 50 as **combined across Railway and Neon**, not per
provider.

This document is that record. It is written to be read against the ruling, so
what is attested is kept apart from what was checked, and the one gap is named
rather than smoothed over.

## What this record is, and is not

**Everything in the table below is a Founder attestation relayed in session on
2026-08-17. None of it is a check `builder` ran.**

Named negative check, so the limitation is evidenced rather than asserted:
neither provider surface available to this session exposes a billing or
usage-limit tool. Verified 2026-08-17T19:03Z by enumerating the Railway and Neon
MCP tool surfaces — Railway offers project, service, variable, domain,
deployment, log and metric operations and no billing operation; Neon offers
project, branch, compute, SQL and schema operations and no billing operation.
The check is narrow and the claim is bounded to it: it establishes that **this
session cannot read or set a provider spend limit**, not that the providers lack
the capability.

The consequence is that the figures below cannot be independently verified from
here, and are recorded as the Founder's statements with the date they were
given. `DEC-20260801-02` clause 4 requires a named check and timestamp for
live-system state claims; an attestation is a legitimate source for that, but
only when it is labelled as one.

## The controls

| Provider | Limb | Limit | Enforcement | Status |
|---|---|---|---|---|
| Railway | compute | see note | hard limit (per Founder) | **see "Unresolved" below** |
| Railway | Agent | see note | hard limit (per Founder) | **see "Unresolved" below** |
| Railway | compute alert | USD 15 | soft, email | attested 2026-08-17 |
| Railway | Agent alert | USD 5 | soft, email | attested 2026-08-17 |
| Neon | account | USD 25 | **not established — see below** | attested 2026-08-17 |

## Unresolved, and why it is not filled in

Two things are open, and both are deliberately left blank rather than guessed.

**1. Railway's hard limits are not settled.** The Founder first stated USD 25
compute plus USD 25 Agent. `builder` raised that this is USD 50 on Railway
alone — the entire combined interim cap, leaving nothing for Neon. The Founder
replied *"so I can switch it to $15 and $10"*, which reads as a proposal rather
than a report of a change already made. **Whether the dashboard now reads
25/25 or 15/10 is not established**, and the difference is material:

- 15 + 10 = USD 25 Railway, plus USD 25 Neon = **USD 50 combined**, which holds
  the ruled figure exactly.
- 25 + 25 = USD 50 Railway, plus USD 25 Neon = **USD 75 combined**, which
  exceeds the ruled figure by USD 25.

Recording the intended state as the actual state is the precise defect this
corpus has repeatedly had to correct, so the row stays blank until the Founder
confirms what is configured.

**2. Whether Neon's USD 25 is a hard limit or an alert is not established.**
`DEC-20260815-09` is explicit on this point: *"If a selected provider can only
alert, that is a gap to report before provisioning, not something to paper over
by calling an alert a cap."* The figure was given without that distinction, so
it is recorded without it.

## An observation on the alert thresholds

If Railway's compute hard limit becomes USD 15, the existing **USD 15 compute
alert fires at the same figure the hard stop does** — it would notify at the
moment action is already impossible. The alert limb exists for lead time, and an
alert at the cap has none. Raised with the Founder 2026-08-17; moving it down is
their call and is not assumed here.

## Arithmetic against the ratified ceiling

The ratified monthly ceiling is **USD 85 total**, covering infrastructure *and*
provider API usage (`DEC-20260815-09`, Founder ruling of 2026-08-15). At a
combined provider-side limit of USD 50, USD 35 of headroom remains for provider
API usage inside the ceiling.

At USD 50 combined the interim control sits **exactly at** the ruled figure
rather than under it, so there is no slack: adding any further provider spend
breaches the combined cap unless a limb is lowered or the Founder adjusts the
figure. Adjusting it is a Founder act — the 2026-08-17 confirmation's *"and
adjustments could be made … if needed"* records an expectation that the figure
is provisional, and expressly does **not** delegate the power to change it.

## What the interim control does not do

It acts **at the provider, not at dispatch**, so it cannot pause a run the way
`DEC-20260815-16`'s guardrails do. It is not the meter and is not a substitute
for it — `DEC-20260815-09`'s ruling says so in terms. The meter is built in
`packages/cost-meter`, and deliberately does not gate on the USD 50: a test pins
that it does not.

## Sequencing

The ruling requires the caps and alerts **before** provisioning. As of this
record: Neon billing is attested configured (Founder, 2026-08-17) and the Neon
project `founder-os-build-room` exists, created via the Neon console 2026-08-17
at 16:55:19Z — observed by `builder` 2026-08-17T19:03Z. The Railway project
created earlier the same day was deleted by the Founder before any deployment
existed, so **no Railway compute has run**.

## Related

- `DEC-20260815-09` — the cost commitment, the USD 85 ceiling, the meter
  authorization, and the USD 50 interim combined cap
- `DEC-20260815-16` — per-room token ceilings and the per-run hard cap
- `DEC-20260815-17` — Phase 2 authorization and its exit criteria
- `packages/cost-meter` — the meter this interim control is not a substitute for
