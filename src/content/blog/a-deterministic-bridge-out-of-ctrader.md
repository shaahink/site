---
title: 'A deterministic bridge out of cTrader'
description: "My strategy code refuses to live inside a broker sandbox — so a ZeroMQ bridge moves it out. The part that took real thought isn't the sockets: it's the lock-step acknowledgement that makes two processes behave like one deterministic loop."
pubDate: 2026-07-16
series: 'workshop-systems'
seriesOrder: 2
tags: ['dotnet', 'zeromq', 'trading', 'architecture']
---

cTrader runs your algo as a *cBot* — a class compiled into its sandbox, with
its C# dialect, its lifecycle, and no room for the things a real engine needs:
a test suite, persistence, a web dashboard, [a pure kernel with a
journal](/blog/designing-a-kernel). I wanted cTrader to be nothing but a
**venue adapter**, with the engine in its own .NET 10 process. That means two
processes and a wire between them — and the naive wire ruins everything.

The naive wire is fire-and-forget pub/sub: cBot publishes bars, engine
publishes orders, everyone's async, everyone's happy. Until you notice that
bar N+1 sometimes arrives before the engine's orders for bar N have been
applied — and now every backtest run interleaves differently. You've traded a
sandbox for a race condition.

## Lock-step: the venue waits for the ack

The fix in [Shamshir](/projects#shamshir) is a lock-step protocol over a
ZeroMQ DEALER↔ROUTER pair. The cBot sends a bar and then **blocks** until the
engine acknowledges *that specific bar*:

```csharp
// cBot side, on every closed bar
_dealer.SendFrame(barJson);                     // carries a seq number

var deadline = DateTime.UtcNow.AddSeconds(30);  // safety valve, not a feature
while (DateTime.UtcNow < deadline)
{
    if (!_inbox.TryTake(out var json, 100)) continue;
    var doc = JsonDocument.Parse(json);
    if (doc.RootElement.GetProperty("type").GetString() != "bar_done") continue;
    if (doc.RootElement.GetProperty("seq").GetInt32() != _barEventCount) continue;

    ApplyCommands(doc);   // place/close orders, then echo executions back
    break;
}
```

The `bar_done` reply carries every command the engine produced for that bar.
No bar N+1 until bar N's orders are applied and their executions echoed back.
Two processes, one total event order — the property the
[kernel](/blog/designing-a-kernel) needs, preserved across a process boundary.

In a cTrader *backtest*, this makes the venue a deterministic replay machine:
cTrader pages history as fast as the engine can ack. In *live* trading the
same protocol runs unchanged; the "block" is however long the engine takes to
decide, which is microseconds against a once-an-hour bar.

## The topology, briefly

- The cBot binds a **PUB** socket for one-way telemetry (diagnostics, account
  snapshots) and connects a **DEALER** to the engine's **ROUTER** for the
  lock-step loop. ROUTER sees an identity per connection, so replies are
  addressed — and the engine knows a reconnect when it sees one.
- On the engine side
  ([NetMqMessageTransport](https://github.com/shaahink/Shamshir/blob/main/src/TradingEngine.Infrastructure/Transport/NetMq/NetMqMessageTransport.cs)),
  a single `NetMQPoller` thread moves socket frames into bounded
  `System.Threading.Channels` — **`DropOldest`** for telemetry (stale ticks
  are worthless), **`Wait`** for the command channel (an execution report must
  never be dropped). Backpressure policy is a per-channel decision, not a
  global one.
- Bars are deduplicated at the edge by `(symbol, timeframe, openTime)` —
  venues re-fire events more often than their docs admit.

## Two bugs the bridge taught me

**The stale-bar bug.** For weeks the cBot published `Bars.Last(1)` — "the last
closed bar" — which, at the moment the `BarClosed` event fires, is actually
the bar *before* the one that just closed. The engine decided on 4-hour-old
prices; its limit orders arrived already marketable and filled at market,
through the limit price. What caught it wasn't staring at charts: the venue's
own clock, recorded per bar, showed a steady 8-hour open-to-publish gap where
4 was expected — and the tape replay filled the same order at the limit while
the venue filled it through. When your backtest and your venue disagree,
one of them is lying, and now you have the instruments to find which.

**The double-teardown bug.** The orchestrator disconnects the transport twice
on a normal run — once from a safety-net force-disconnect, once from host
disposal. `NetMQPoller.Stop()` throws on the second call, and that exception
once stamped a *completed* run as `failed`. The fix is one line of humility:

```csharp
if (Interlocked.Exchange(ref _teardownStarted, 1) == 1) return;
```

Teardown paths get called twice. Make them idempotent before they teach you.

## Costs

Lock-step means the venue is paced by the engine — fine for bars, wrong for
tick-level HFT. The 30-second deadline is a tombstone, not a retry: if the
engine is gone, the venue aborts loudly rather than trading blind. And ZeroMQ
gives you framing, identity and reconnection but no persistence — anything
that must survive a crash goes in the [journal](/blog/designing-a-kernel), not
the socket.

---

*Runnable, distilled version: [`02-zeromq-lock-step`](https://github.com/shaahink/blog-code/tree/main/02-zeromq-lock-step)
in [blog-code](https://github.com/shaahink/blog-code) — venue and engine over real TCP in one `dotnet run`.
The real thing: [TradingEngineCBot](https://github.com/shaahink/Shamshir/blob/main/src/TradingEngine.Adapters.CTrader/TradingEngineCBot.Events.cs)
in [Shamshir](https://github.com/shaahink/Shamshir).*
