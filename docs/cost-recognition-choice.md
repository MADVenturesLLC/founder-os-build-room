# Infrastructure cost recognition — the choice, surfaced then selected

**Status: SELECTED — `BOOK_FULL_MONTH_AT_START`, selected by `builder`
2026-08-17 while building the meter in Phase 2.**

Implemented in `packages/cost-meter/src/recognition.ts` as
`SELECTED_RECOGNITION_METHOD`, and pinned by a test.

**The authority for selecting it.** `DEC-20260815-09` and `DEC-20260815-16`
both assign this choice to whoever builds the meter — *"Whoever builds the
meter selects and records it"* — and `-09`'s Founder ruling of 2026-08-17
authorized the meter as part of Phase 2, which made the selection due. The
Founder offered both methods as acceptable without choosing between them; that
is what makes selecting one a builder act rather than a usurpation. **It is not
a Founder ruling and is not presented as one.**

**What it changes: nothing ruled.** No ceiling, no aggregation rule, no value,
no accounting period. Only the intra-month spend curve, which the two methods
were always agreed to differ on while producing an identical monthly total.

**That identical-total claim holds for a full month and not for a partial
one.** It is exact when a commitment is in force for every day of the month —
the ordinary case, and the case it was written about. It is **not** exact when
a commitment starts or ends mid-month: `BOOK_FULL_MONTH_AT_START` books the
whole monthly figure for any month containing a served day, while
`PRORATED_DAILY` books only the days actually served. A plan running 1–9 August
books its full month under the selected method and about 9/31 of it under the
alternative.

That gap is the selected method's conservatism working as intended, not a
defect — it overstates a partial month, which is the direction the USD 85
ceiling wants to be wrong in. It is qualified here because the unqualified
sentence above would otherwise read as a guarantee it does not make. Raised by
CodeRabbit on PR #2.

**How to revisit it.** `PRORATED_DAILY` is implemented alongside it and is
reachable by passing `recognitionMethod` — so changing method is a
configuration change plus a recorded decision, not a rewrite. If the Founder
prefers prorating, saying so is enough and this document records the change.

**Everything below is the record as it stood before the selection**, kept
because the reasoning is what the selection rests on, and because the
document's own account of who may choose is the check on that.

---

**Status at Slice 1: NOT SELECTED. Slice 1 made no selection, and none was
baked in.**

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

> **Superseded 2026-08-17 — the meter was built and the selection made.** The
> two sentences above were true when written and are false now: the method is
> selected at the top of this document, and `packages/cost-meter` implements
> both. Left in place rather than rewritten, because it is the accurate record
> of the position Slice 1 held, and the paragraph it sits in is the reasoning
> the selection actually rests on. The recommendation was accepted as written —
> no part of it was revised to fit the outcome.

## Related

- `DEC-20260815-09` — cost commitment; the ruling and the open choice
- `DEC-20260815-16` — per-room token ceilings and per-run hard cap
- `DEC-20260721-03` — displayed cost is an estimate, not a billed figure
