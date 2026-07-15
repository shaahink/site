---
title: 'A trading engine as a pure function'
description: "Most backtesters are a second implementation of the strategy — so they prove nothing about the code that actually trades. Build the engine as a pure reducer and the backtest, the live path, and the debugger become the same thing."
pubDate: 2026-07-15
tags: ['dotnet', 'architecture', 'trading']
---

There's a dirty secret in most algorithmic trading setups: the backtester and the
live engine are **two different programs**. The backtest loops over candles in a
`for` loop; the live engine reacts to broker callbacks, timers, and network
weather. The strategy logic gets reimplemented — or "shared" through a leaky
abstraction — and the result is a backtest that validates code which never runs,
and live code that has never been validated.

I'm building a trading engine ([Shamshir](/projects#shamshir)) where that split
can't exist, because the core of the engine is a pure function:

```csharp
public static (EngineState Next, IReadOnlyList<Intent> Intents)
    Reduce(EngineState state, MarketEvent evt);
```

State in, event in. New state out, plus a list of *intents* — open this
position, move this stop, close everything. That's the whole kernel. No clock,
no broker client, no database, no `DateTime.UtcNow`, no randomness. If it needs
to know the time, the time is on the event.

## Side effects live at the edges

Everything impure sits in thin adapters around the kernel:

- A **feed adapter** turns broker callbacks (ticks, bar closes, order fills)
  into `MarketEvent` records and pushes them through the reducer.
- An **execution adapter** takes the intents the reducer emits and turns them
  into real broker API calls — then feeds the results (fills, rejections) back
  in as new events.
- A **persistence adapter** appends every event to a log (SQLite is plenty)
  before the reducer sees it.

The adapters are deliberately boring. All the decisions — every indicator
update, every signal, every position-size calculation — happen inside the pure
part, where they can be tested with nothing but values.

## The backtest is not a second program

Once the engine is a reducer over events, backtesting stops being a separate
implementation and becomes **replay**:

```csharp
var state = EngineState.Initial(config);
foreach (var evt in recordedEvents)
    (state, _) = Kernel.Reduce(state, evt);
```

Feed it a year of recorded events and you have a backtest. Feed it this
morning's events and you have a reconstruction of this morning. The code path
is identical to live — same reducer, same indicators, same sizing, same risk
checks — so a green backtest actually says something about the software that
will trade.

The corollary is my favourite property of the whole design: **any trading day
can be replayed, byte for byte**. When the engine does something surprising at
14:32 — and it will — I don't stare at logs guessing. I replay the event log up
to 14:31, attach a debugger, and step through the exact decision with the exact
state. "Why did it sell?" becomes a reproducible question.

## Strategies propose. The governor disposes.

Shamshir targets prop-firm accounts, which come with unforgiving rules —
FTMO-style daily drawdown and total drawdown limits. Breach them once and the
account is gone. Rules like that are too important to live inside strategy
code, which is exactly the code you rewrite most often.

So the kernel is split in two layers. Strategies emit *proposals*. A separate
**risk governor** sits between proposals and intents, and its only power is
veto and reduction:

```csharp
// The governor can shrink or kill a proposal — never enlarge it.
var verdict = governor.Evaluate(state.Risk, proposal);
// verdict: Approved(sized) | Reduced(sized, reason) | Rejected(reason)
```

Daily drawdown, max total drawdown, exposure caps, and position sizing are
first-class domain objects in the governor, not `if` statements scattered
through strategies. A strategy can be wrong, greedy, or half-finished; the
blast radius is capped by a small component that never changes and is tested
to death. It's the same shape as a supervisor in an actor system — or, for
that matter, an orchestrator that [doesn't trust its
agents](/blog/dont-trust-the-agent): the thing that enforces the rules must be
separate from the thing that does the work.

## What testing looks like when the core is pure

The unit tests read like arithmetic. Build a state, apply an event, assert on
the output — no mocks, no broker sandbox, no async ceremony:

```csharp
[Fact]
public void Breaching_daily_drawdown_flattens_and_locks()
{
    var state = StateWith(equity: 98_950m, dailyStart: 100_000m); // -1.05%
    var (next, intents) = Kernel.Reduce(state, BarClose(...));

    intents.Should().ContainSingle(i => i is CloseAll);
    next.Risk.TradingLocked.Should().BeTrue();
}
```

Above that sits a simulation tier: full engine, synthetic or recorded feeds,
no credentials required — so CI exercises realistic multi-day scenarios
without a broker account anywhere in sight.

## The costs, honestly

Purity isn't free. All engine state has to be explicit and serialisable —
including indicator state, which is where third-party indicator libraries
fight you. Multi-symbol, multi-timeframe indicator windows make `EngineState`
a genuinely large object, and you have to be disciplined about it evolving.
And this design optimises for correctness and replayability, not latency; if
you're chasing microseconds, a pure functional core with an event log is not
your architecture.

For a swing engine whose failure mode is "one bad day ends the account", the
trade is obvious. The reducer gives you a backtest you can believe, a debugger
that time-travels, and a risk layer that can't be bypassed — all from one
decision about where the side effects live.
