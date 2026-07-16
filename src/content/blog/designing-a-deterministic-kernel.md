---
title: 'Designing a deterministic kernel'
description: "Event-driven systems rot into callback soup where no two runs behave alike. Here's the cure I used in a trading engine: one queue, one pure reducer, one journal, one effect executor — and the discipline that makes two replays byte-identical."
pubDate: 2026-07-16
tags: ['dotnet', 'architecture', 'trading']
---

At 14:32 on a Tuesday, the engine sold. Nobody told it to. The strategy looked
right, the risk numbers looked right, and yet: sold. So you do what everyone
does — you re-run the day to watch it happen.

It doesn't happen.

Same code, same data, different behaviour. Congratulations: your system has
*interleavings*, and one of them fired on Tuesday and a different one fired
just now. There is no bug to find because there is no execution to inspect.
The behaviour lives in the gaps between callbacks, and the gaps shuffle
themselves every run.

This post is about the shape that kills that entire class of mystery. I built
it for a trading engine — an environment where "we can't reproduce Tuesday"
costs actual money — but nothing in it is about trading. It's about any system
that reacts to events and must be able to answer for itself afterwards.

## The problem, laid out properly

An event-driven system accretes naturally into this:

- market data arrives in a **broker callback**, which updates some fields and
  maybe fires an order,
- a **timer** wakes up every second to check drawdown,
- order fills land on **another callback**, on another thread,
- and an **async continuation** from the last HTTP call resolves whenever it
  feels like it.

Each piece is individually reasonable. Collectively they have no defined
order. The fill from bar 41 can arrive while the timer is halfway through
reading state that bar 42 is halfway through writing. Two runs over identical
data interleave differently, so testing proves little and replaying proves
nothing.

The usual patch is a mutex and an apology. The actual fix is structural:
**build the system so there is only one place where anything happens.**

## The shape

```
tape event ─► queue ─► Kernel.Decide (PURE) ─► (state', effects[])
                           │                          │
                           ▼                          ▼
                      StepRecord ─► journal      effect executor (the ONLY I/O)
                                                 venue feedback (fills, account) ──┐
                                                     re-enqueued via the queue ◄───┘
```

Four parts, four jobs, no overlaps:

**The tape** is wherever events come from — recorded bars on disk, or a live
socket feed. The kernel cannot tell the difference, and that indifference is
the whole point: the backtest and the live path run through the *same* driver.
There is no replay-only fork of the logic to drift out of sync.

**The reducer** is one pure function:

```csharp
EngineDecision Decide(EngineState state, EngineEvent evt);
// EngineDecision = (EngineState State, IReadOnlyList<Effect> Effects)
```

Every decision the system will ever make goes through this signature. It does
no I/O, reads no clock, mints no ids. It takes the world as a value and
returns the next world as a value, plus a list of *intentions* — `SubmitOrder`,
`ClosePosition`, `RecordDecision` — as data.

**The executor** is the only component allowed to touch reality. It walks the
effect list and does the dirty work: talks to the venue, writes to the event
bus, updates the progress sink. Crucially, when reality answers back — a fill,
an account update — the executor doesn't *handle* it. It wraps the answer in
an event and puts it on the queue, where it goes through the same front door
as everything else.

**The journal** gets one record per processed event: sequence number,
sim-time, the event itself as JSON, the effects it produced, and a snapshot of
the risk state. It is not logging. It's the single source of truth that the
report, the export, and the live monitor are all projections of.

## The loop

The driver that pumps it all is small enough to hold in your head:

```csharp
foreach (var tapeEvent in tape)
{
    queue.Enqueue(tapeEvent);

    // Drain this event AND every feedback event it triggers
    // before pulling the next one from the tape.
    while (queue.TryDequeue(out var evt))
    {
        var decision = kernel.Decide(state, evt);   // pure
        state = decision.State;

        journal.Append(BuildStepRecord(++seq, evt, decision, state));

        foreach (var effect in decision.Effects)    // the only I/O
            await effects.ExecuteAsync(effect, ct);
    }
}
```

The line that earns its keep is the inner `while`. Call it
**drain-before-advance**: when a bar produces a `SubmitOrder`, and the venue
answers with a fill, that fill goes *back onto the same queue* — and is fully
processed before the next bar is pulled from the tape. Consequences never
race their causes. However asynchronous the outside world is, inside the
kernel there is exactly one total order of events, every run, forever.

Without that rule, bar N+1 races the fills of bar N and you're back to
interleavings. With it, the system is single-file: one event, one decision,
one journal record, next.

## Determinism is a discipline, not a property

Here's the uncomfortable part. You don't get byte-identical replays by
declaring the reducer pure. You get them by hunting down every leak, and the
leaks are sneakier than you'd think. A tour of the ones that actually bit me:

**The id mint.** Deep inside position tracking, something called
`Guid.NewGuid()` to label a new position. Perfectly innocent — and every
replay now produces different journal bytes, because the ids differ. The fix
was to stop minting: the position id *is* the order id, which arrived on the
event, which came from the edge. Rule: if the kernel needs an id, the id
travelled in on the event.

**The clock.** `DateTime.UtcNow` in decision code means replays disagree with
history by definition. Time is data: every event carries the time it
occurred, and that is the only "now" the kernel is allowed to know. This has
a lovely side effect — a year-long backtest experiences a year of sim-time in
minutes, and nothing inside can tell.

**The culture.** The journal serialises decimals. `12.5m.ToString()` is
`"12.5"` on my machine and `"12,5"` on a machine that thinks in commas —
different bytes, broken diff. Everything the journal writes is formatted with
the invariant culture, because the determinism contract extends all the way
down to `ToString`.

**The impure question.** Some decisions genuinely need outside knowledge — is
there a news embargo right now? Is it the weekend? You can't call a news
service from a pure function. The move: the *edge* computes those verdicts at
event time and attaches them to the event itself. The reducer applies
verdicts; it never asks questions. Purity is preserved, and so is the audit
trail — the journal shows exactly which verdicts the decision saw.

Each of these is enforced by tests now, because each of them will be
reintroduced by someone (me) innocently improving something (anything). A
purity test that replays a fixed tape twice and compares hashes is the
cheapest insurance I own.

## Config is not state

A subtler design decision: what *doesn't* go in `EngineState`. Risk limits,
sizing policy, symbol metadata — constant for the whole run — live in a
`KernelConfig` the kernel closes over:

```csharp
public sealed record KernelConfig(
    ConstraintSet Constraints,
    RiskProfile Profile,
    SizingPolicyOptions Sizing,
    Func<Symbol, SymbolInfo> ResolveSymbol,
    int Seed);
```

Only time-varying data — positions, drawdown, equity, protection status — is
state. The split keeps state small enough to snapshot and reason about, and it
makes the most useful operation in the whole system embarrassingly cheap:
**same tape, different config.** That one sentence *is* "re-run this backtest
with a different risk profile". No new data plumbing, no export/import, one
function call with a different second argument.

## Risk gets a veto

Inside the reducer, in front of every order, sits a gate. A strategy doesn't
submit orders; it *proposes* them, and the proposal passes through a
pre-trade gate that owns sizing and the account's survival constraints —
daily, weekly, monthly and total drawdown, checked in severity order.

Reject means reject: the journal records a decision event with the reason,
and no effect reaches the venue. And when equity breaches a limit, the gate's
big sibling takes over: the state enters *protection mode*, every open
position gets a close effect, and nothing opens again until the boundary that
clears it (next day, next week) rolls past — also an event, also journaled.

The gate produces one more thing while it's at it: a self-describing sizing
record — equity at gate time, drawdown scaling, raw and clamped lot size —
written into the journal. When a position is a quarter of the size you
expected, the answer is in the record, not in a debugger at 2 a.m.

Risk-as-veto only works *because* of the funnel. When every order passes
through one pure function, "nothing bypasses risk" is an architectural fact,
not a code-review aspiration.

## What it buys

**Replay as a debugger.** Any surprising decision can be re-run with the
exact state that produced it. "Why did it sell at 14:32?" stopped being a
mystery and became a query: pull the step record, load the state, step
through the reducer. The answer takes minutes and is always there.

**Diff as a regression test.** Same tape + same config ⇒ bit-identical
journal. So a refactor's safety check is: replay, hash, compare. If the hash
moved, behaviour moved — and the journal diff shows exactly which step
diverged first. The demo in the companion repo does this in three lines of
output:

```
replay 1 sha256 : 89F7787232D7CE37
replay 2 sha256 : 89F7787232D7CE37
byte-identical  : True
```

**A backtester that proves something.** Because live and backtest share the
driver, a backtest exercises the code that trades — not a parallel
implementation with parallel bugs. The only swapped part is the tape.

**CI without credentials.** A simulated venue at the executor's edge plus
recorded tapes means the full decision path runs in CI, deterministic and
credential-free, on every push.

## What it costs

The decision path is deliberately single-threaded: one event at a time, in
order. For a swing-trading engine, that's nothing — the queue idles between
bars. If you need microseconds, a funnel with a journal write per event is
not your design, and I'd point you at the LMAX Disruptor literature instead —
same religion (single writer, event log), different performance class.

The journal grows. One record per event, with event and effects as JSON, adds
up; you'll want retention rules and compaction eventually. I consider the
disk cheap and the answers priceless, but it's a real line item.

And the purity contract needs *guarding*. It is not self-enforcing. The type
system won't stop a colleague — or you, in eleven months — from adding an
innocent `DateTime.UtcNow`. The replay-hash test will. Write it the same day
you write the reducer.

The pure function was the idea. The queue, the journal and the discipline
around them are what made it an *engine* — I wrote about the underlying
philosophy in [a trading engine as a pure
function](/blog/a-trading-engine-as-a-pure-function), and this post is the
machinery that philosophy actually runs on.

---

*Runnable, distilled version:
[`deterministic-kernel`](https://github.com/shaahink/blog-code/tree/main/deterministic-kernel)
in [blog-code](https://github.com/shaahink/blog-code) — records a tape, replays
it twice, proves the journals byte-identical, then reruns it under a different
config for free.*
