---
title: 'Fail in 80 tokens: error design for agent-facing tools'
description: "When a tool call fails, the agent reads the error, thinks, and tries again — so the error message IS the interface. Envelopes with a hint and an example beat stack traces, and refusing to guess beats being helpful."
pubDate: 2026-07-16
series: 'workshop-systems'
seriesOrder: 7
tags: ['ai', 'mcp', 'tooling', 'api-design']
---

I've argued that [agents deserve typed tools, not a
shell](/blog/typed-tools-beat-a-shell). This is the sequel nobody writes:
what happens when the agent calls your lovely typed tool *wrong*. Because it
will — stale handles, misspelled symbols, missing parameters, fuzzy queries.
For [DevContext](/projects#devcontext)'s MCP server, failures turned out to
be roughly a third of all calls. The error path isn't an edge case; it's a
third of your API.

And an agent's error path has a property human-facing APIs don't: **the
consumer reads the error with a meter running**. A stack trace costs
thousands of tokens of context to convey nothing actionable. Worse, a vague
error sends the agent into flailing retries — same call, slightly different
guess, five times.

## The envelope

Every tool failure in DevContext returns the same three-field shape, with a
hard budget:

```csharp
// Budget: error + hint + example <= 80 tokens. Kept terse by construction.
private static string Envelope(string error, string hint, string example)
    => JsonSerializer.Serialize(new { error, hint, example }, JsonOpts);
```

```json
{
  "error": "Handle expired or unknown — analyze again or check list_sessions().",
  "hint": "Run analyze(path) first, then retry.",
  "example": "analyze(\"C:/repos/MyApp\")"
}
```

Three fields, three jobs. `error` says what's wrong. `hint` names the *next
move* — not the cause, the move. `example` is paste-ready. The agent recovers
in one turn instead of three, and the failed call cost less than this
paragraph.

Failures classify cleanly onto hints. Preconditions ("no session yet") →
*run analyze first*. Staleness ("handle expired") → *re-analyze or list
sessions*. Bad arguments → *check the schema*. Mapping infrastructure
errors to those classes is one switch on a gRPC status code — mechanical,
and it means no raw exception ever reaches the model.

## Never silently pick

The tempting failure is the opposite of a crash: being too helpful. Agent
asks to trace `checkout`; you have `CheckoutController.Post`,
`CheckoutHandler.Handle` and `CheckoutSaga.Advance`; fuzzy search says the
handler is probably right. Return it?

No. A wrong guess is the most expensive outcome available: the agent walks
away confident, builds three turns of reasoning on the wrong symbol, and
produces an answer that's fluently, citedly wrong. DevContext encodes the
rule as a law: **only an exact, unique match resolves silently.** Everything
else returns candidates:

```json
{
  "error": "'checkout' is ambiguous (3 matches).",
  "hint": "Did you mean one of these? Pass the full id.",
  "example": "trace(\"CheckoutHandler.Handle\")",
  "candidates": [
    { "nodeId": "Method:CheckoutController.Post", "kind": "Method" },
    { "nodeId": "Method:CheckoutHandler.Handle",  "kind": "Method" },
    { "nodeId": "Method:CheckoutSaga.Advance",    "kind": "Method" }
  ]
}
```

One extra round-trip, maybe forty tokens. Against an agent confidently wrong,
it's the cheapest insurance in the system. The same shape serves misses:
no match → did-you-mean candidates from ranked search, keyed on the most
distinctive token of the query, so `"how does checkout work"` still finds
`checkout`.

## The budget is enforced, not aspirational

"Keep errors short" is a code-review comment; a *budget* is a design
constraint. Eighty tokens forces the discipline that makes the envelopes
good: no exception messages passed through raw, no ten-item candidate lists,
`WhenWritingNull` dropping absent fields. In the sample repo the builder
literally throws if an envelope exceeds budget — fail at build time, not in
the agent's context window.

The cost of all this is unglamorous: hints are product copy, and you write
them per failure class per tool. But tool descriptions get lavish attention
while error paths get `ex.Message` — and the error path is where the agent
decides whether your tool is usable or gets abandoned for `grep`.

---

*Runnable, distilled version: [`07-error-envelopes`](https://github.com/shaahink/blog-code/tree/main/07-error-envelopes)
in [blog-code](https://github.com/shaahink/blog-code) — resolution with an enforced 80-token budget.
The real thing: [DevContextTools.cs](https://github.com/shaahink/DevContext2/blob/feat/tapestry-t4/src/DevContext.Mcp/DevContextTools.cs)
in [DevContext](https://github.com/shaahink/DevContext2).*
