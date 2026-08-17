# Phase 2 — provider-side spend controls (exit criterion 2)

`DEC-20260815-17`'s Phase 2 exit criterion 2 requires **provider-side billing
caps or alerts in place before provisioning, with the named check and timestamp
recorded**. `DEC-20260815-09`'s Founder ruling of 2026-08-17 fixes the control
as a **USD 50 cap plus alerts on both providers**, and a same-day Founder
confirmation fixes the USD 50 as **combined across Railway and Neon**, not per
provider.

This document is that record. It is written to be read against the ruling, so
what is attested is kept apart from what was checked, and the gap it found is
named rather than smoothed over.

**The finding, up front, because it is the thing a reader most needs:** the cap
limb of the ruled control is satisfied on **Railway only**. Neon's USD 25 is a
notification threshold that still bills above it, so **USD 25 of infrastructure
spend is enforced and the rest is merely observed**. `DEC-20260815-09` requires
that to be reported before provisioning rather than described as a cap, which
is what this document does.

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
| Railway | compute | USD 15 | hard limit (per Founder) | attested 2026-08-17 |
| Railway | Agent | USD 10 | hard limit (per Founder) | attested 2026-08-17 |
| Railway | compute alert | USD 15 | soft, email | attested 2026-08-17 — **see the threshold note below** |
| Railway | Agent alert | USD 5 | soft, email | attested 2026-08-17 |
| Neon | account threshold | USD 25 | **alert only — no hard stop** | attested 2026-08-17 |
| Neon | alert at 80% | USD 20 | soft, notification | attested 2026-08-17 |
| Neon | alert at 100% | USD 25 | soft, notification | attested 2026-08-17 |

**The two providers do not enforce the same way, and the totals differ
accordingly.**

- **Enforced (hard) combined: USD 25** — Railway only. Railway's USD 15
  compute and USD 10 Agent limits are hard limits per the Founder.
- **Notified-but-unenforced: Neon's USD 25.** Neon's threshold notifies at 80%
  (USD 20) and again at 100% (USD 25), and **usage above the threshold is still
  billed**. Neon contributes nothing to the enforced total.

So the combined figure is USD 50 **as a set of thresholds** and USD 25 **as a
set of stops**. Both numbers are stated because only one of them is a control.

## What was open, and how each was settled

Both open items are now closed. They are kept struck through rather than
deleted, because how a figure came to be settled is part of the record — and
because in one case the blank row is the only reason a wrong figure was never
written down as fact.

**1. ~~Railway's hard limits are not settled.~~ RESOLVED, 2026-08-17.** The
Founder confirmed **15/10**. The exchange is kept because the order in which
this was established is part of the record: the Founder first stated USD 25
compute plus USD 25 Agent; `builder` raised that this is USD 50 on Railway
alone — the entire combined interim cap, leaving nothing for Neon; the Founder
replied *"so I can switch it to $15 and $10"*, which was a proposal rather than
a report of a change already made, and this document recorded the row as blank
on that basis; the Founder then confirmed **"15/10"**. The difference was
material — 25/25 would have put the combined total at USD 75, exceeding the
ruled figure by USD 25 — which is why it was held open rather than filled in
with the intended value.

**2. ~~Whether Neon's USD 25 is a hard limit or an alert is not
established.~~ RESOLVED, 2026-08-17 — and the answer is the gap, not the
cap.** The Founder confirmed it is a **notification threshold**, quoting Neon's
own wording:

> Alerts are sent when spending reaches 80% of your threshold, and again when
> it reaches 100%. Usage above the threshold is still billed.

**Neon cannot hard-stop spend.** This is the contingency `DEC-20260815-09`
anticipated in terms: *"If a selected provider can only alert, that is a gap to
report before provisioning, not something to paper over by calling an alert a
cap."* Reporting it is what this section does. See *The cap limb is satisfied on
one provider only* below for what follows from it.

## The cap limb is satisfied on one provider only

The ruled interim control is a **USD 50 cap plus alerts on both providers**.
Measured against the configuration attested above:

- **The alert limb is satisfied on both providers.** Railway emails at USD 15
  compute and USD 5 Agent; Neon notifies at USD 20 and USD 25.
- **The cap limb is satisfied on Railway only.** Railway stops at USD 25
  combined across its two limbs. Neon stops at nothing.

**What is actually unbounded, stated plainly.** Neon spend above USD 25 is
billed and no provider-side control prevents it. Neither does the cost meter:
`packages/cost-meter` pauses **dispatch** when recognized monthly spend exceeds
the ratified USD 85, and Neon's cost accrues from the database existing rather
than from a dispatch, so pausing dispatch does not stop it. The ratified USD 85
ceiling is unchanged as a rule; what is missing is a provider-side backstop
behind it on the Neon side.

**One structural bound does exist, and it is a configuration, not a billing
control.** The Neon project `founder-os-build-room` is fixed at 0.25 compute
units with no autoscaling headroom (`autoscaling_limit_min_cu` and
`autoscaling_limit_max_cu` both 0.25) and suspends after 60 seconds idle —
observed by `builder` via the Neon API 2026-08-17T19:03Z. That bounds compute
cost by capping the rate at which it can accrue, which is a real limit and a
meaningful one at this size. It is **not** a spend cap: storage accrues
independently of compute, the setting can be changed without touching billing,
and nothing about it stops the meter running past USD 25.

**This is reported, not resolved.** Whether to accept the gap, move Neon to a
plan or mechanism that can hard-stop, or lower the exposure another way is a
Founder decision. `builder` is not treating an alert as a cap, and is not
treating the gap as a blocker it may waive.

## An observation on the alert thresholds

**The Railway compute alert now sits at the same figure as its hard limit.**
Both are USD 15, so the alert fires at the moment the hard stop does — it
notifies when action is already impossible. The alert limb exists for lead time,
and an alert at the cap has none. The Agent limb does not have this problem:
its alert is USD 5 against a USD 10 hard limit.

Raised with the Founder 2026-08-17. Moving the compute alert down is their call,
it is **not** assumed here, and the table above records the alert at USD 15
because that is what is attested. This does not fail exit criterion 2 — the
ruling requires a cap *and* alerting on both providers, and both are present —
but an alert with no lead time is worth naming rather than counting as
satisfied and forgetting.

## Arithmetic against the ratified ceiling

The ratified monthly ceiling is **USD 85 total**, covering infrastructure *and*
provider API usage (`DEC-20260815-09`, Founder ruling of 2026-08-15). At a
combined provider-side threshold of USD 50, USD 35 of headroom remains for
provider API usage inside the ceiling — **on the assumption that the thresholds
hold, which on Neon they do not**. The honest reading is that USD 25 of
infrastructure spend is enforced and the rest is observed.

At USD 50 combined the interim thresholds sit **exactly at** the ruled figure
rather than under it, so there is no slack: adding any further provider spend
breaches the combined figure unless a limb is lowered or the Founder adjusts
it. Adjusting it is a Founder act — the 2026-08-17 confirmation's *"and
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
