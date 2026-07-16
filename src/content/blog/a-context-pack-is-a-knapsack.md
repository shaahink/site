---
title: 'A context pack is a knapsack problem'
description: "\"Give the model context about X, in 8,000 tokens\" sounds like retrieval. It's budgeting: sections with their own allowances, spine-first filling, per-body caps — and above all, named cuts, so the model knows what it didn't get."
pubDate: 2026-07-16
series: 'workshop-systems'
seriesOrder: 8
tags: ['ai', 'tooling', 'dotnet']
---

[DevContext](/projects#devcontext) can trace how an endpoint flows through a
.NET codebase — [handlers, events, consumers, with file:line
provenance](/blog/call-graphs-lie-about-modern-dotnet). The last step is
turning a trace into something a model can actually use: a **context pack**,
assembled against a caller-specified token budget. Get that step wrong and
everything upstream was wasted — dump too much and you've blown the window;
truncate blindly and you've silently lied about the code.

The naive versions fail in instructive ways:

- **Depth starves breadth.** Walk the trace depth-first and a six-deep chain
  eats the budget before the second child of the entry point gets a word. On
  Shamshir at depth 6, the *signatures* section alone grew to 2.5k of a 4k
  pack before this was fixed.
- **God classes eat everything.** One 900-line service body, included whole,
  is the whole pack.
- **Silent cuts poison trust.** Truncate without saying so and the model
  reasons as if it saw everything. Confidently. In writing.

## Sections, each with its own allowance

The [pack builder](https://github.com/shaahink/DevContext2/blob/feat/tapestry-t4/src/DevContext.Core/Graph/ContextPackBuilder.cs)
assembles three sections, cheapest first:

1. **The skeleton** — the trace as an indented tree, every node one line,
   with `[approx]` markers on syntactic (lower-confidence) edges. Almost
   free, always complete: even at brutal budgets the model sees the *shape*.
2. **Member signatures** — breadth-first, capped at a fraction of the total
   budget so a deep trace can't starve what follows.
3. **Bodies** — where the tokens go, filled with the remainder.

The two rules that make the bodies section behave:

**Spine-first.** Fill breadth-first from the focus, so what's *near* the
entry point wins over what's merely deep. Relevance in a trace correlates
with graph distance, not discovery order.

**Per-body cap.** `Math.Max(150, budget * 2 / 5)` — no single declaration may
eat the pack. A body over the cap degrades to its salient lines with a
visible marker; a body that doesn't fit at all is counted, not dropped.

## Name every cut

The rule I'd keep if I could keep only one: **the pack reports what it
omitted.**

````markdown
- … (+7 more members — raise budgetTokens for the full list)

### PricingService.Price — Pricing/PricingService.cs:55
```csharp
public Money Price(Cart cart, Region region)
{
    var net = cart.Lines.Sum(l => l.UnitPrice * l.Qty);
… (+38 lines)
```
````

Every truncation is marked in place, and the pack's tail lists omitted bodies
with their would-be cost. This turns the budget into a *conversation*: the
agent sees `+38 lines`, decides it matters, and asks again with a bigger
budget or a narrower focus. An unnamed cut, by contrast, is
indistinguishable from the code not existing.

Two smaller rules pay rent too. Paths are repo-relative (`Pricing/TaxCalc.cs:12`,
never `C:\Users\shahin\repos\…`) — absolute paths waste tokens and leak
machine layout. And the finished pack is *self-checked* against the budget
(estimate vs limit, with a safety margin) before it ships, because token
estimation is approximate and "roughly under" isn't a contract.

## Determinism, again

Same graph, same focus, same budget ⇒ same pack, byte for byte. That's what
makes packs testable — golden-file tests catch a ranking regression as a
diff — and cacheable, and comparable across model evals. The estimator is
crude (~4 characters/token), which is why the margin exists; the *selection*
is exact. Budgeting, it turns out, is another place where
[determinism](/blog/designing-a-kernel) is the feature that makes everything
else debuggable.

---

*Runnable, distilled version: [`08-context-packs`](https://github.com/shaahink/blog-code/tree/main/08-context-packs)
in [blog-code](https://github.com/shaahink/blog-code) — one toy graph packed at 400 and 1,600 tokens, cuts named.
The real thing: [ContextPackBuilder.cs](https://github.com/shaahink/DevContext2/blob/feat/tapestry-t4/src/DevContext.Core/Graph/ContextPackBuilder.cs)
in [DevContext](https://github.com/shaahink/DevContext2).*
