---
title: 'CI for a trading engine, no broker account required'
description: "The scariest code in a trading system is the venue integration — exactly the code unit tests never touch. The gap-closer is a fake venue that speaks the real wire protocol against the real engine, credential-free, on every push."
pubDate: 2026-07-16
tags: ['dotnet', 'testing', 'trading']
---

A [pure kernel](/blog/a-trading-engine-as-a-pure-function) makes unit tests
read like arithmetic — state in, event in, assert on intents. Two hundred of
those run in a second and cover the decision logic completely. And they cover
**none of the code that actually breaks in production**: the handshake, the
[bridge](/blog/a-deterministic-bridge-out-of-ctrader), reconnect
reconciliation, order-command translation, the teardown path. The venue
integration is simultaneously the scariest code in the system and the least
tested — because testing it "properly" needs credentials, market hours, and
luck.

[Shamshir](/projects#shamshir)'s answer is a tier between unit tests and the
real venue: the **simulation tier**, and its centrepiece is `FakeCBot`.

## A fake venue that speaks the real protocol

`FakeCBot` is not a mock of an interface. It's a stand-in for the *process on
the other side of the wire*: it binds a real PUB socket, connects a real
DEALER to the engine's ROUTER, performs the real handshake, and speaks the
real lock-step bar protocol over real TCP — against the production
`NetMqMessageTransport` and the production engine, unmodified:

```csharp
public sealed class FakeCBot : IAsyncDisposable
{
    public Task ConnectAsync()
    {
        _pub = new PublisherSocket();
        _pub.Bind(_dataEndpoint);
        _dealer = new DealerSocket();
        _dealer.Connect(_commandEndpoint);
        …
    }

    public async Task HandshakeAsync(IReadOnlyList<string> symbols, …)
    {
        Dealer.SendFrame(Serialize("hello", …));
        // retry until the engine acks — the real cBot does the same
    }
}
```

The distinction matters. Mock the transport interface and you've tested your
ability to write mocks. Speak the wire protocol and you've tested framing,
socket lifecycles, the dedup logic, the handshake retry, the identity
handling on reconnect — the entire seam where the two processes meet, which
is where the bugs actually live.

## Scenarios are scripted, not random

The harness feeds deliberate market shapes and asserts on the **exact command
sequence** the venue observed:

- flat chop, then a rally → exactly one entry command;
- then a crash past the drawdown limit → a flatten from the governor;
- and after the lock, *nothing* — no order may follow, however tempting the
  chart.

Randomised feeds have their place (they found the bar-dedup bug), but
scripted scenarios are the regression suite: when `Breaching daily drawdown
flattens and locks` goes red, the diff that broke it is today's diff. All of
it runs credential-free — no broker account exists anywhere in CI — in
seconds, on every push.

## The tier above: the venue tests itself

Some lies only the real venue can catch. So the top tier
(`CtraderE2EHarness`) runs actual cTrader *backtests* with the real cBot on a
workstation where cTrader is installed — start a run, wait for the engine,
assert on the results ledger.

Two hard-won details from that tier:

**The cBot writes its own ledger.** The venue CLI's `--report-json` crashed
often enough to be useless, so the cBot appends its own `report.json` +
`events.json` as it trades — checkpointed every 50 bars, so even a dead run
leaves evidence. When a tool between you and the truth is flaky, move the
truth-writing inside the boundary you control.

**Compare the venue against the tape.** The same scenario, run through the
venue and through [tape replay](/blog/record-the-world-once), must agree.
That cross-check is what exposed the stale-bar bug — the venue filled a limit
order *through* the limit price while the replay rested it; the divergence
was the alarm. Neither tier alone would have caught it: the replay was
internally consistent, the venue run looked plausible. Only the disagreement
was loud.

## The ladder, honestly

Unit tests prove the decisions. Simulation proves the seam, on every push.
E2E proves the venue still behaves like the venue you integrated against —
run on a workstation, on demand, because it needs the platform installed.
Each tier catches what the one below structurally cannot; the discipline is
refusing to let "it needs credentials" become "so we don't test it". The
fake venue's fidelity is a maintenance cost — when the protocol grows a
field, `FakeCBot` learns it too — but that cost is the list of things your
tests understand about your own wire format, which is a strange thing to
begrudge.

---

*Runnable, distilled version: [`10-simulation-tier`](https://github.com/shaahink/blog-code/tree/main/10-simulation-tier)
in [blog-code](https://github.com/shaahink/blog-code) — rally-then-crash, asserted on the command log.
The real thing: [TradingEngine.Tests.Simulation](https://github.com/shaahink/Shamshir/tree/main/tests/TradingEngine.Tests.Simulation)
in [Shamshir](https://github.com/shaahink/Shamshir).*
