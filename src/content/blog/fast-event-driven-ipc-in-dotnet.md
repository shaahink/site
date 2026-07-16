---
title: 'Fast event-driven IPC in .NET, with ZeroMQ and NetMQ'
description: "Two processes, one firehose of events, no broker. What ZeroMQ actually is, which socket pattern fits which job, real throughput numbers, the foot-guns that eat your messages silently — and the lock-step protocol that buys determinism over a socket."
pubDate: 2026-07-16
tags: ['dotnet', 'messaging', 'architecture']
---

Sooner or later two of your processes need to talk. Properly talk — not "poll
a REST endpoint every second", but *events, as they happen, at rate*. Market
ticks into a trading engine. Telemetry out of a game server. Frames between a
capture process and an encoder.

The industry reflex is to reach for a broker: RabbitMQ, Kafka, Redis
pub/sub. Now you have infrastructure — something to install, monitor, patch
and explain to the on-call rota — standing between two processes that might
be *on the same machine*. For durable, cross-team, audit-me messaging that's
a fine trade. For "process A must feed process B, fast, now", it's a
mainframe to deliver a pizza.

There's a forty-year-old idea sitting one abstraction lower: just sockets —
but sockets that know messaging patterns. That's ZeroMQ. This post is about
using it from .NET, where the story is unusually good, and about the sharp
edges you'll want to know about *before* they eat your messages.

## What ZeroMQ actually is

The name misleads in both halves: there's no queue *server*, and there's no
broker of any kind. ZeroMQ is a library that gives you **sockets with
opinions**. They look like BSD sockets, but:

- they carry **messages** (discrete frames), never byte soup — no
  length-prefix parsing, no "did I get half a message?",
- each socket runs its own background I/O and **reconnects forever** — you
  can start the client before the server, unplug things mid-run, and the
  socket quietly heals,
- each connection has an internal **queue with a cap** (the high-water mark),
  and — this is the part to tattoo somewhere visible — *what happens when
  that queue fills is decided by the socket type*,
- and each socket type implements a **pattern**: pipeline, broadcast,
  request-reply, async routing.

And **NetMQ** is the reason .NET people get to be smug about it: a complete,
mature port of ZeroMQ in pure C#. Not a P/Invoke wrapper — a port. One
`PackageReference`, no native binaries, no platform matrix. It speaks ZMTP on
the wire, so a NetMQ process happily talks to a libzmq process written in C,
Python or Go.

```
dotnet add package NetMQ
```

That's the entire infrastructure story. Nothing to install, nothing to
monitor, nothing between your processes but TCP.

## The vocabulary

Four patterns cover almost everything. The table you actually need is the
last column — what each socket does under pressure:

| Pattern | Shape | Delivery | When the queue is full |
|---------|-------|----------|------------------------|
| PUSH → PULL | pipeline | round-robin to workers, fair-queue in | **sender blocks** (backpressure) |
| PUB → SUB | broadcast | every subscriber gets a copy | **drops, silently** |
| REQ ↔ REP | rigid request/reply | strict alternation | blocks |
| DEALER ↔ ROUTER | async request/reply | explicit addressing, any cadence | configurable |

Two of those cells run the show. **PUSH blocks** — a slow consumer slows the
producer, nothing is lost, the pipeline breathes. **PUB drops** — the show
must go on, so a slow subscriber loses messages *and nobody tells you*. Not
an exception, not a return code, not a log line. We'll watch it happen below.

The rule that falls out, and the single most useful sentence in this post:
**broadcast telemetry with PUB/SUB; move entitlements over something that
blocks.** A missed price tick is Tuesday; a missed fill is a lawsuit.

## A pipeline, measured

The classic ZeroMQ pipeline is fan-out/fan-in:

```
ventilator (PUSH, bind) ──► workers ×3 (PULL → PUSH) ──► sink (PULL, bind)
```

The [companion sample](https://github.com/shaahink/blog-code/tree/main/netmq-event-pipeline)
wires this up over real TCP on localhost and pushes 200,000 messages through
both hops. The ventilator is four lines:

```csharp
using var push = new PushSocket();
push.Options.Linger = TimeSpan.FromSeconds(30);   // remember this line
push.Bind("tcp://127.0.0.1:15961");

for (var i = 0; i < 200_000; i++)
    push.SendFrame(payload);
```

On my laptop, one unscientific evening:

```
payload    16 B : 200,000 / 200,000 msgs through 2 hops in 0.77 s — 259,761 msg/s (4 MB/s)
payload 1,024 B : 200,000 / 200,000 msgs through 2 hops in 5.62 s — 35,566 msg/s (35 MB/s)
```

A quarter of a million small messages per second, through two hops and four
sockets, with zero tuning, on a laptop that was also running Spotify. For
same-box IPC you will run out of ideas before you run out of throughput.

But look at the two rows together, because they teach the real lesson. At 16
bytes we're **message-rate bound** — the cost is per-message bookkeeping, and
the bytes are irrelevant. At 1 KB we're shovelling 64× the payload but only
going 7× slower — the cost curve is bending towards **bandwidth bound**. Your
bottleneck is almost never "the transport". It's what you *put in* the
messages — which, in a typical system, means serialization. A JSON encode per
event will dominate everything ZeroMQ does. (The trick that follows from
this: don't make it a per-message cost. Batch small events into one frame and
amortise.)

## The foot-gun tour

Every one of these is a demo mode in the sample, because every one of them
got me or someone I respect.

### The slow joiner

A subscription is not a local filter — it's a *message*, sent from SUB to
PUB after connecting, and until it lands the publisher filters everything out
at the sending side. So a publisher that starts blasting immediately loses
its opening messages to every subscriber. How badly? On localhost, with the
subscriber connecting as fast as it possibly can:

```
naive start    : received    0 of 1,000 events — the head of the stream is simply gone
handshake first: received 1,000 of 1,000 events
```

Zero. Out of a thousand. This is the most-reported "bug" in ZeroMQ's history
and it is by design: PUB/SUB is a radio broadcast, not a mailbox. The fix is
a start-of-day handshake — the subscriber says *ready* over a separate
REQ/REP pair, and the publisher holds fire until it hears it. Fifteen lines,
and part of the fifteen is a comment saying why.

### The high-water mark

Each side of a connection buffers up to the HWM — 1,000 messages by default.
PUSH responds to a full queue by blocking. PUB responds by dropping, and
here's what that looks like when a publisher blasts 50,000 frames at a
subscriber that dawdles just slightly:

```
published      : 50,000 frames of 128 B
received       : 2,000
dropped        : 48,000 — silently, at the high-water mark
```

Ninety-six percent of the stream, gone, no error anywhere. If you take one
number away from this post, take that one. Raise
`Options.SendHighWatermark` when bursts are expected, drain your subscribers
fast — and never, ever put must-deliver data on PUB/SUB.

### The vanishing tail

NetMQ's default *linger* is zero: disposing a socket discards whatever is
still queued, instantly. Your process sends its last 2,000 messages, hits the
end of `using`, and those messages evaporate — the demo lost exactly its tail
until I set `Linger` before dispose. Symptoms: "the last batch never
arrives", but only on fast runs. Set linger, or drain before dispose.

### The threading rule

ZeroMQ sockets are not thread-safe, full stop. The blessed shape for a
long-lived transport is to give the sockets a single home: a `NetMQPoller`
owns them all and runs the loop, receive handlers fire on the poller thread,
and any *other* thread that wants to send goes through a `NetMQQueue<T>` —
a thread-safe funnel that the poller drains on its own thread.

In the trading engine this pattern came from, the transport then hands
messages to the async world through two bounded
`System.Threading.Channels`, and the bounds *encode the semantics*:

```csharp
// market data: losing the oldest tick to a stall is fine — it's telemetry
Channel.CreateBounded<(string Topic, string Json)>(
    new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.DropOldest });

// commands/executions: these are entitlements — block, never drop
Channel.CreateBounded<(byte[] Identity, string Json)>(
    new BoundedChannelOptions(2_000) { FullMode = BoundedChannelFullMode.Wait });
```

Two channels, two full-modes, and the PUB-drops/PUSH-blocks distinction from
the socket table shows up again *inside* the process. The semantics of "what
may be lost" isn't a transport detail. It's the design.

## Buying determinism over a socket

Speed is the advertised feature. The feature I actually came for is
stranger: **you can build determinism on top of this**, and most transports
won't let you.

The setup: a trading engine in one process, its venue adapter in another
(inside a broker platform I don't control). Bars flow one way, orders flow
back. If both flows are free-running, bar N+1 can arrive before the venue has
executed the orders that bar N produced — and every run of the same day
interleaves data and commands differently. For an engine whose
[whole design](/blog/designing-a-deterministic-kernel) rests on replaying any
day byte-for-byte, that's fatal.

The fix is a protocol, not a transport feature — the **lock-step loop**:

1. the venue sends bar *N* with a sequence number,
2. then *blocks* until the engine replies `bar_done` echoing seq *N*,
   carrying **every command that bar produced**,
3. the venue executes those, echoes the executions, and only then sends
   bar *N+1*.

One total order of data and commands, enforced by the conversation itself.
Same bars in, same interleaving, every run — across a process boundary.

The sample implements it with DEALER/ROUTER rather than REQ/REP, and the
choice is instructive: REQ/REP hard-codes *exactly one* reply per request,
but an engine might answer a bar with nothing, or with three commands and a
status update. DEALER/ROUTER is the polite version of the same conversation —
ROUTER prefixes each message with the sender's identity, so replies are
addressed and several venues could share one engine:

```csharp
// engine side: ROUTER frames arrive as [identity][payload]
var identity = router.ReceiveFrameBytes();
var json     = router.ReceiveFrameString();
// ... decide ...
router.SendMoreFrame(identity)                      // reply to *that* venue
      .SendFrame(Wire("bar_done", new { seq, commands }));
```

Yes, lock-step caps throughput at one bar per round-trip. For bars — even M1
bars across every major pair — that budget is laughable. Determinism costs
latency you weren't using.

## What I'd use it for, and what not

**Reach for it when:** processes on one box or one rack need events at rate;
pipelines with natural backpressure; broadcast telemetry with many readers;
a protocol of your own design (like the lock-step above) that a broker's
opinions would fight.

**Don't reach for it when:** you need durability — ZeroMQ holds messages in
memory; a crashed process's queue is gone. No replay, no consumer offsets, no
audit log: that's Kafka's job, and the honest response to needing it is to
use Kafka. Similarly the open internet edge (you'll want TLS, auth, and
someone else's hardened listener) and org-wide integration fabric (the
broker's governance is the feature, not the overhead).

One more honest cost: no broker means nobody is watching. There's no
management console showing queue depths; observability is yours to build.
The engine's transport counts bars in, commands out, executions back, and
timestamps the last message — four counters and a clock, exposed on a status
endpoint. Build them on day one; they're your only witnesses (the HWM
certainly won't testify).

---

*Runnable, measurable version:
[`netmq-event-pipeline`](https://github.com/shaahink/blog-code/tree/main/netmq-event-pipeline)
in [blog-code](https://github.com/shaahink/blog-code) — the pipeline benchmark,
the slow joiner, the silent HWM drops, and the lock-step protocol, each as a
one-command demo.*
