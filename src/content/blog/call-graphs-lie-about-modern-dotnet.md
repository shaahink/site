---
title: 'Call graphs lie about modern .NET'
description: "In a mediator-and-DI codebase, nothing calls anything — everything is connected by convention. Honest tracing means building edges from joins, and making every edge cite the file and line it came from."
pubDate: 2026-07-15
tags: ['dotnet', 'roslyn', 'ai', 'tooling']
---

Ask the obvious question about any .NET service — *what actually happens when
`POST /orders` is hit?* — and try to answer it with a call graph. You'll get
exactly one hop:

```csharp
[HttpPost]
public Task<IActionResult> Create(CreateOrderRequest req)
    => _mediator.Send(new CreateOrderCommand(req));   // ...and the trail goes cold
```

The call graph dutifully reports that the controller calls
`IMediator.Send`. It cannot tell you that the real successor is
`CreateOrderCommandHandler`, because **nothing in the entire solution ever
calls the handler**. MediatR finds it by reflection at runtime. Statically,
it's dead code with a day job.

And it's not just MediatR. Modern .NET has systematically replaced calls with
conventions: DI containers construct your implementations, so nothing `new`s
them; MassTransit invokes your consumers when a message arrives, so nothing
calls them; domain events dispatch to handlers the same way; pipeline
behaviours wrap everything invisibly. The better your architecture — the more
decoupled — the more your call graph degenerates into disconnected islands
with `Send` and `Publish` at the shores.

This is precisely where humans onboarding to a repo get lost, and where coding
agents hallucinate wiring that doesn't exist. The model sees `Send(new
CreateOrderCommand(...))`, can't see the handler, and invents one.

## Join, don't follow

[DevContext](/projects#devcontext) — my tool for turning a .NET solution into
a queryable code graph — deals with this by refusing to treat calls as the
primary source of truth. Instead, the analyser runs separate Roslyn detections
across the solution: endpoints, MediatR handlers, message consumers, EF Core
entities, DI registrations, background workers, domain-event raises.

Then it builds edges by **joining detections**, the way you'd join tables:

- `_mediator.Send(new CreateOrderCommand(...))` is detected as a *send* of
  `CreateOrderCommand`.
- `class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, OrderId>`
  is detected as a *handler* of `CreateOrderCommand`.
- Same message type on both sides → a `Sends`/`Handles` edge connects them.

No call exists between those two classes, and no call is needed. The message
type is the foreign key. The same join works for events and their consumers,
for `AddScoped<IOrderRepository, OrderRepository>()` connecting an interface
to what the container will actually construct, and for entities reached
through a `DbContext`.

## An edge you can't cite is a guess

Joins are inference, and inference can be wrong — a message type with two
handlers, an interface with three registrations. So every edge in the graph
carries three pieces of honesty metadata:

- **Provenance** — the `file:line` of the evidence on both sides.
- **Resolution** — how the edge was derived: a `Join`, a raw `Syntactic`
  match, or full `Semantic` resolution.
- **Confidence** — because "the only implementor of this interface" is a
  stronger claim than "one of three implementors".

This turns out to matter more for LLMs than for humans. A trace whose every
hop cites its source is something an agent (or its orchestrator) can
*verify* — open the file, check the line. A trace without citations is just
more plausible-sounding text, and plausible-sounding text is the one thing
models never run short of.

## Not all edges are equally interesting

When the tracer walks outward from an entry point, it expands edges in a
strict priority order — the semantic, intent-revealing edges first:

| Priority | Edge | Meaning |
|---|---|---|
| 0 | `Sends` | command/event dispatch |
| 1 | `Handles` | mediator handler join |
| 2 | `Raises` | domain event raised |
| 3 | `Consumes` | bus consumer join |
| 4 | `ReadsWrites` | EF entity touched |
| 5 | `Resolves` | DI interface → implementation |
| 6 | `WrappedBy` | pipeline behaviour |
| 7 | `Calls` | plain method call |

Raw `Calls` edges — the only thing a classic call graph has — come dead last.
They're the noise floor: real, but rarely what you're asking about. The
priority ladder is what makes a trace read like an explanation ("the endpoint
sends a command, the handler raises an event, a consumer writes the entity")
instead of a stack dump.

A few guards keep traces finite and honest: a depth limit, a fan-out cap per
node, framework-boundary detection so the walk stops at ASP.NET internals
instead of descending into them, and a revisit guard for cycles. A trace that
tried to be complete would be as unreadable as the codebase; the job is to be
*truthful within a budget*.

## The point

I wrote before about giving agents [a map instead of letting them re-explore
](/blog/point-dont-re-explore) the repo every session. The map is half the
answer. The other half is the trace — and a trace is only worth feeding to a
model if it survives the question "how do you know?". Build the edges from
joins, make them cite file and line, and rank meaning above mechanics: that's
the difference between a code graph and a very confident lie.
