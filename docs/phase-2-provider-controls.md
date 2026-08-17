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

| Provider | Limb | Limit | Enforcement | Evidence class |
|---|---|---|---|---|
| Railway | compute | USD 15 | hard limit (per Founder) | `[Founder-reported 2026-08-17]` |
| Railway | Agent | USD 10 | hard limit (per Founder) | `[Founder-reported 2026-08-17]` |
| Railway | compute alert | USD 10 | soft, email | `[Founder-reported 2026-08-17]` — moved down from USD 15, see below |
| Railway | Agent alert | USD 5 | soft, email | `[Founder-reported 2026-08-17]` |
| Neon | account threshold | USD 25 | **alert only — no hard stop** | `[Founder-reported 2026-08-17]` |
| Neon | alert at 80% | USD 20 | soft, notification | `[Founder-reported 2026-08-17]` |
| Neon | alert at 100% | USD 25 | soft, notification | `[Founder-reported 2026-08-17]` |

**Every row is `[Founder-reported]`, and that is the weakest of the three
evidence classes in use here.** `[Observed <date>]` means `builder` ran the
check and read the result — the Neon compute configuration below is the one
thing in this document that carries it. `[Founder-executed <date>, verbatim
output relayed]` means the Founder ran a command and relayed its output
unedited. `[Founder-reported]` is an attestation with no output behind it,
which is what every figure in the table above is, because no surface available
to this session can read provider billing (see the named negative check above).

**Provider billing state is mutable and nothing here re-checks it.** A limit
can be raised, lowered or removed in a provider dashboard at any time, and this
document would not change. A future verifier must re-run the check against the
provider rather than reading these rows as current — they are a record of what
was attested on 2026-08-17, not a live view.

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

- **The alert limb is satisfied on both providers.** Railway emails at USD 10
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
`[Observed 2026-08-17T19:03Z]`, `builder` via the Neon API. That bounds compute
cost by capping the rate at which it can accrue, which is a real limit and a
meaningful one at this size. It is **not** a spend cap: storage accrues
independently of compute, the setting can be changed without touching billing,
and nothing about it stops the meter running past USD 25.

**~~This is reported, not resolved.~~ RESOLVED — the Founder accepted the gap,
2026-08-17.** Their words, recorded verbatim and unmodified:

> I accept the Neon gap $25 observed (notification-only), railway enforced.

**Operative.** The gap is accepted as an informed Founder decision, not
waived by `builder` and not closed by treating an alert as a cap. What is
accepted is precisely what the sections above describe: **USD 25 enforced at
Railway, USD 25 observed at Neon with no stop behind it.**

This changes the gap's *status*, not the gap. Neon still cannot hard-stop,
spend above USD 25 there is still billed, and the cost meter still cannot
reach it. Anyone reading this later should understand the exposure as
accepted rather than eliminated — and the acceptance is revisitable on the
same terms as any Founder act, which is what the paragraph below preserves.

**What would reopen it.** A change in what Neon costs, a change to the project's
compute configuration, or Neon gaining a hard-stop mechanism. None of those is
monitored automatically; the alert at USD 20 is the notice that arrives first,
and it is a notification, not a control.

## ~~An observation on the alert thresholds~~ — CLOSED, 2026-08-17

**Both alert limbs now have lead time.** Railway's compute alert is **USD 10
against a USD 15 hard limit**; the Agent alert is USD 5 against USD 10.

The finding this section originally carried: the compute alert sat at USD 15,
the same figure as its own hard limit, so it fired at the moment the hard stop
did — notifying when action was already impossible. An alert limb exists for
lead time, and an alert at the cap has none.

Raised by `builder` 2026-08-17. The Founder directed the move to USD 10 the same
day, and confirmed it applied: *"alert at 10 for compute confirmed."* The table
above carried USD 15 in the interval between the direction and the
confirmation, deliberately — the direction was on the record, the applied state
was not, and this session cannot read Railway billing to check it (see the
named negative check above). Recording USD 10 on the strength of an intention
would have been the same defect the 15/10 exchange avoided.

The row is now USD 10 on the Founder's confirmation, which is an attestation
like every other figure in the table, not a check `builder` ran.

**USD 15 is the superseded value and appears nowhere as a current alert
figure.** A paragraph recording the pre-confirmation state — *"the table above
records the alert at USD 15 because that is what is attested"* — was left
standing here after the confirmation landed, leaving two current values in one
section. It was true when written and false the moment the Founder confirmed,
and it is removed rather than struck through because a stale operational figure
is the kind of thing a reader acts on. Raised by CodeRabbit on PR #2. The
history it recorded is not lost: the paragraphs above carry it, and the fact
that the alert was raised as a finding before it was changed is stated there.

None of this ever failed exit criterion 2 — the ruling requires a cap *and*
alerting on both providers, and both were present throughout — but an alert
with no lead time was worth naming rather than counting as satisfied and
forgetting.

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

## Sequencing — and what is not established about it

The ruling requires the caps and alerts **before** provisioning.

What is on record: Neon billing is attested configured (Founder, 2026-08-17)
and the Neon project `founder-os-build-room` exists, created via the Neon
console 2026-08-17 at 16:55:19Z — `[Observed 2026-08-17T19:03Z]` by `builder`.
The Railway project created earlier the same day was deleted by the Founder
before any deployment existed, so **no Railway compute ran under it**.

**The ordering itself is not independently verified, and this record does not
claim it is.** Every figure in the table is a Founder attestation carrying a
date but not a time, so nothing here establishes that the billing configuration
existed *before* 16:55:19Z rather than after it. The one timestamped check this
session ran — the 19:03Z tool-surface enumeration — establishes that no billing
operation is reachable from here, which is a statement about tooling and says
nothing about when a limit was set. It also ran nearly two and a half hours
*after* the Neon project was created, so it could not have witnessed the
ordering even in principle.

So the pre-provisioning exit check is **attested, not verified**. Closing it
would take either a timestamped Founder record of when each limit was applied,
or provider audit-log evidence — neither of which exists as of this writing.
Raised by CodeRabbit on PR #2, which correctly noted that a date-only
attestation cannot establish an ordering within a day.

## Related

- `DEC-20260815-09` — the cost commitment, the USD 85 ceiling, the meter
  authorization, and the USD 50 interim combined cap
- `DEC-20260815-16` — per-room token ceilings and the per-run hard cap
- `DEC-20260815-17` — Phase 2 authorization and its exit criteria
- `packages/cost-meter` — the meter this interim control is not a substitute for
