# Infrastructure cost recognition — the open choice, surfaced

**Status: NOT SELECTED. Slice 1 makes no selection, and none is baked in.**

This document exists because `DEC-20260815-09` leaves exactly one
implementation choice open, and because making that choice silently — in code,
without recording it — is the specific failure mode the decision warns against.

## What the choice is

The Founder's ruling of 2026-08-15 fixed infrastructure cost recognition as
**when incurred, not when invoiced**, and then offered two acceptable methods
without selecting between them. Recorded verbatim in `DEC-20260815-09`:

> Count infrastructure when incurred, not when invoiced. Railway, Neon,
> Cloudflare are fixed monthly costs — you know the number before the month
> starts. Waiting for an invoice creates a lag where you could overshoot. Count
> it as it accrues (prorated daily, or just book the full month at the start).

The two methods are **prorated-daily** and **book-the-full-month-at-the-start**.
Both satisfy "when incurred, not when invoiced". They differ in the intra-month
spend curve, **not in the monthly total**.

## Who chooses

`DEC-20260815-09`, under *"One implementation choice the ruling deliberately
leaves open"*:

> **That choice is not made here.** It belongs to whoever builds the meter,
> under WF-04 Step 3, and should be recorded when made. Recording a selection
> now would repeat exactly the defect two Tier-2 rounds caught on this decision:
> presenting a drafter's choice as the Founder's.

`DEC-20260815-16` says the same: *"Whoever builds the meter selects and records
it."*

## Why Slice 1 does not select it

**Slice 1 builds no meter.** The authorized scope is the contracts/ledger core:
pure TypeScript, zero I/O, zero credentials, zero infrastructure. A cost meter
needs provider-reported token counts and infrastructure billing state — all of
it I/O — so it cannot exist inside this slice's boundary.

Named check, so this is not an assertion from memory: `grep -rniE
'PRICE_TABLE_VERSION|spend[_-]?ceiling|monthly[_-]?ceiling|cost[_-]?meter|prorat|invoice'`
over `packages/` and `test/`, run 2026-08-16T18:08:36Z on branch
`builder/wf04-step3-slice1-contracts-ledger` — **zero hits**. The check is
narrow and the claim is bounded to it: it does not establish that no cost logic
exists under other identifiers, and it inspects this repository only.

The honest position is therefore that the choice is **still open**, and this
document is where it is surfaced rather than left implicit.

## Recommendation, for the Founder to accept or reject

If a selection is wanted now: **book the full month at the start.**

Reasoning, kept short because the decision turns on one thing:

- It is the **conservative** method against the ceiling that matters. The USD 85
  monthly bound is the outer boundary, and booking the full month means the
  meter always reports the highest defensible figure for the period. Prorating
  makes early-month spend look cheaper than the month will actually cost, which
  is precisely the overshoot direction the Founder's ruling was avoiding when it
  rejected invoice-lag.
- It is **simpler to audit**. One booking event per provider per month, on the
  1st, aligning exactly with the ruled calendar-month reset. Prorating adds a
  daily accrual the auditor has to re-derive.
- The **monthly total is identical**, so nothing is lost. The only cost is that
  a month's spend headroom appears consumed earlier than it strictly is.

The argument the other way, stated fairly: prorating gives a smoother and more
truthful intra-month picture of what has actually been consumed to date, which
matters more if the ceiling is ever raised mid-month or if spend is reported
per-week rather than per-month.

**This recommendation is a `builder` proposal and is not operative.** Nothing in
this document selects the method, and no code implements either. When the meter
is built, the selection is recorded here and in the meter's own decision record.

## Related

- `DEC-20260815-09` — cost commitment; the ruling and the open choice
- `DEC-20260815-16` — per-room token ceilings and per-run hard cap
- `DEC-20260721-03` — displayed cost is an estimate, not a billed figure
