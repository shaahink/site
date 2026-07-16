---
title: 'Designing a kernel: one queue, one reducer, one journal'
description: "The heart of my trading engine is a single pump. Every event goes through one queue, one pure function, and one journal — and the drain order is the whole trick. Here's the shape, and what it buys."
pubDate: 2026-07-16
series: 'workshop-systems'
seriesOrder: 1
tags: ['dotnet', 'architecture', 'trading']
---

I've written before about [building a trading engine as a pure
function](/blog/a-trading-engine-as-a-pure-function) — why the core should be
`(state, event) → (state', effects)`. That post was the *why*. This one is the
*how*: the piece of machinery that actually drives the pure function, which in
[Shamshir](/projects#shamshir) is called the kernel driver, and internally,
**the funnel**.

```
tape event ─► queue ─► Kernel.Decide (PURE) ─► (state', effects[])
                           │                          │
                           ▼                          ▼
                      StepRecord ─► journal      effect executor (the ONLY I/O)
                                                 venue feedback (fills, account) ──┐
                                                     re-enqueued via the queue ◄───┘
```

The problem it solves: engine logic that lives in broker callbacks, timer
handlers, and async continuations has no defined event order. Two runs over
the same data interleave differently, and "why did it sell at 14:32?" becomes
unanswerable. The fix is structural, not disciplinary — build the system so
there is only one place where anything happens.

## The loop

The driver is small enough to read in one breath
([the real one](https://github.com/shaahink/Shamshir/blob/main/src/TradingEngine.Engine/Kernel/KernelDriver.cs)
is ~140 lines, journaling included):

```csharp
foreach (var tapeEvent in tape)
{
    queue.Enqueue(tapeEvent);

    // Drain this event AND every feedback event it triggers
    // before pulling the next bar.
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

Three rules make this deterministic:

**Drain before advancing.** A `SubmitOrder` effect reaches the venue, the venue
answers with a fill, and that fill goes *back onto the same queue* — and is
processed before the next bar is pulled from the tape. One total order of
events, always. Without this, bar N+1 races the consequences of bar N and
every run is a new interleaving.

**The kernel is pure — enforced, not hoped.** No I/O, no wall clock, no
`Guid.NewGuid()`, no randomness inside `Decide`. If the kernel needs the time,
the time is on the event. If it needs an id, the id was minted at the edge and
travelled in on the event.

**One journal record per event, lossless.** Every step writes a `StepRecord`:
sequence number, sim-time, the event as JSON, the effects it produced, and a
risk snapshot. The journal is not logging — it's the single source of truth
that the report, the NDJSON export, and the live monitor are all projections
of. Same run spec ⇒ bit-identical journal, which turns "did my refactor change
behaviour?" into a `diff`.

## Config is not state

The subtle design decision is what *doesn't* go in `EngineState`. Risk limits,
sizing policy, symbol metadata — they're constant for the whole run, so they
live in a `KernelConfig` the kernel closes over:

```csharp
public sealed record KernelConfig(
    ConstraintSet Constraints,
    RiskProfile Profile,
    SizingPolicyOptions Sizing,
    Func<Symbol, SymbolInfo> ResolveSymbol,
    int Seed);
```

Only time-varying data — positions, drawdown, equity, governor status —
belongs in state. The split keeps state small enough to snapshot and reason
about, while the kernel still knows the rules. And it makes the most useful
replay operation trivial: same tape, different config. That *is* "re-run this
backtest with a different risk profile", as one function call.

## What it buys, what it costs

Live trading and backtesting run through this same driver; the only difference
is which `IEventTape` feeds it — recorded bars or the
[ZeroMQ transport](/blog/a-deterministic-bridge-out-of-ctrader). There is no
replay-only fork to drift out of sync. Any surprising decision can be re-run
under a debugger with the exact state that produced it.

The cost is that the decision path is deliberately single-threaded — one
event at a time, in order. For a swing engine that's nothing; if you need
microseconds, a funnel with a journal write per event is not your design. And
the purity contract needs a test that fails when someone innocently adds
`DateTime.UtcNow` to the kernel, because someone will.

---

*Runnable, distilled version: [`01-deterministic-kernel`](https://github.com/shaahink/blog-code/tree/main/01-deterministic-kernel)
in [blog-code](https://github.com/shaahink/blog-code) — two replays of one tape, byte-identical journals.
The real thing: [Shamshir](https://github.com/shaahink/Shamshir).*
