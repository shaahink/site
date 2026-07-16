---
title: 'Record the world once: market-data tapes'
description: "A backtest is only as trustworthy as its data plumbing. Splitting the tape — recorded events — from the config — strategy, risk — means you record the world once and every re-run is free. Even the venue can be the recorder."
pubDate: 2026-07-16
tags: ['dotnet', 'trading', 'architecture']
---

The [kernel post](/blog/designing-a-kernel) had a quiet assumption in it:
something called a *tape* feeds the funnel. That abstraction deserves its own
post, because it's the half of determinism that isn't about code — it's about
**data custody**.

```csharp
public interface IEventTape
{
    DatasetRef Dataset { get; }
    // Pure replay of stored data — no live clock, no randomness —
    // so the kernel output is reproducible.
    IAsyncEnumerable<EngineEvent> ReadAsync(CancellationToken ct);
}
```

The point of the interface is the *decoupling*: the tape is **data**, the
config is **code**. Re-running the same tape with a different strategy or
risk profile is a new backtest with zero new data plumbing — one function
call in [Shamshir](/projects#shamshir), not a new download job. Record the
world once; experiment forever.

Two design decisions follow, and both bit me before I made them explicit.

**Feedback events are not on the tape.** Fills, account updates, equity marks
— they're *produced* by executing the engine's own effects, and re-enter
[through the queue](/blog/designing-a-kernel). Put them on the tape and
you've frozen one particular engine's decisions into your "market data";
change the strategy and the recorded fills are lies. A tape is pure market
truth: bars now, ticks later, granularity carried on the `DatasetRef`.

**Order is a contract, not a hope.** The reader *refuses* an out-of-order
tape rather than sorting it quietly. A tape that needs sorting is a tape
whose recorder has a bug you want to know about — silently repairing it
converts a loud failure today into an unexplainable backtest divergence next
month.

## Let the venue be the recorder

Where does the data come from? Broker history APIs page grudgingly, rate
limit aggressively, and love giving you M1 when you asked for H4. Shamshir's
answer: the venue adapter already receives every bar — so give the cBot a
**recorder mode**. Set `Record = true` and it short-circuits the entire
engine path — no [bridge](/blog/a-deterministic-bridge-out-of-ctrader), no
handshake — and simply appends every closed bar to NDJSON shards on disk:

```csharp
protected override void OnStart()
{
    // Recorder mode: no NetMQ, no engine — run as a plain backtest and
    // capture every closed bar to a shard.
    if (Record) { StartRecording(); return; }
    …
}
```

Run a cTrader *backtest* in this mode and you've hijacked the venue's own
replay machinery as a bulk history exporter: it pages years of any timeframe
through your `OnBarClosed` at full speed, and the shard writer captures it.
The venue does the hard part; the recorder is thirty lines.

Two details carry the trustworthiness:

- **Dedup at capture.** Venues re-fire bar events — reconnects, warm-up
  overlaps. The recorder keys on `(symbol, timeframe, openTime)` and drops
  repeats at the point of entry, so downstream code never learns venues do
  this.
- **NDJSON as the format.** One JSON object per line: append-only writes,
  streams without loading, diffs in git, greps at 2 a.m., and survives a
  crash mid-write losing at most one line. Boring formats are a feature —
  the same reasoning as the [orchestrator's JSON
  snapshot](/blog/crash-safe-with-one-json-file).

## The payoff compounds

A recorded tape is what makes the rest of the machinery honest. Replay the
same tape twice: byte-identical journals, or you've found a purity bug.
Replay it against the *venue's* results: divergence means the bridge or the
venue is lying — that's exactly how a stale-bar bug (the engine fed
4-hour-old prices) [was caught](/blog/a-deterministic-bridge-out-of-ctrader).
And the [simulation tier](/blog/ci-without-a-broker-account) feeds recorded
tapes through the full engine in CI, credential-free.

The costs are mild: disk (NDJSON compresses well, and bars are small), and
dataset versioning — a tape needs an identity (`DatasetRef`) so a backtest
can say *which* world it ran against. That identity discipline is the point:
"EURUSD H1, 2023, recorded 2026-06-12" is a citable fact. "Whatever the API
returned this morning" is not.

---

*Runnable, distilled version: [`09-market-data-tape`](https://github.com/shaahink/blog-code/tree/main/09-market-data-tape)
in [blog-code](https://github.com/shaahink/blog-code) — record with dedup, replay byte-identically, re-run with a new config.
The real thing: [IEventTape.cs](https://github.com/shaahink/Shamshir/blob/main/src/TradingEngine.Domain/Kernel/IEventTape.cs)
and the [recorder cBot](https://github.com/shaahink/Shamshir/blob/main/src/TradingEngine.Adapters.CTrader/TradingEngineCBot.Recorder.cs)
in [Shamshir](https://github.com/shaahink/Shamshir).*
