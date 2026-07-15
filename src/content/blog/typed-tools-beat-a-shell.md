---
title: 'Typed tools beat a raw shell: designing an MCP server for agents'
description: "Handing an agent a shell is easy and, past a toy, a mistake. The reliable path is a small set of typed, validated, least-privilege tools it can't misuse — which is an API design problem, not a prompting one."
pubDate: 2026-06-30
tags: ['ai', 'agents', 'tooling']
---

The quickest way to make an LLM "agentic" is to give it a shell. It works in a
demo and then betrays you: the model shells out with a subtly wrong flag, deletes
the wrong path, or pipes half a gigabyte of log into its own context and forgets
what it was doing. A raw shell is maximal capability with zero guardrails.

The reliable alternative is boring: give the agent a **small set of typed tools**,
each of which does exactly one thing, validates its input, and refuses everything
else. That's the whole idea behind the [Model Context
Protocol](https://modelcontextprotocol.io) — and designing a good MCP server is an
API design problem, not a prompt-engineering one.

## A tool is a contract, not a suggestion

A tool has a name, a typed input schema, and a description the model reads to
decide when to call it. The schema is the guardrail: the arguments are validated
*before* your code runs, so the model physically cannot call `get_order` without a
well-formed `orderId`.

```csharp
[McpServerTool, Description("Fetch a single order by id. Read-only.")]
public static async Task<OrderDto> GetOrder(
    OrderService orders,
    [Description("The order's GUID, e.g. 3fa85f64-...")] Guid orderId,
    CancellationToken ct)
{
    var order = await orders.FindAsync(orderId, ct)
        ?? throw new McpException($"No order found for {orderId}.");
    return OrderDto.From(order);
}
```

Three things are doing quiet work here:

- **The type is the validation.** `Guid orderId` means malformed ids never reach
  your logic — the protocol layer rejects them.
- **The description is the interface.** "Read-only", the id format, the example —
  the model plans against that text. Vague descriptions cause misuse the same way
  vague docs cause bad API calls.
- **The error is structured.** A clear `McpException` lets the agent recover on the
  next turn instead of hallucinating what went wrong.

## Design principles that survive contact with a model

1. **Least privilege, always.** Prefer `get_order` and `refund_order` over one
   `run_sql`. Every tool you expose is attack surface the model can stumble into.
   If a tool can't be misused, you don't have to hope the prompt keeps it in line.
2. **Return structured data, not a wall of text.** Hand back a typed DTO, not
   dumped stdout. The model reasons far better over `{ "status": "shipped" }` than
   over 400 lines it has to parse — and you keep its context lean.
3. **Make writes obvious and idempotent.** Name mutating tools like mutations,
   validate hard, and design them so a retried call is safe. Agents retry.
4. **Bound every output.** A tool that can return unbounded data is a context
   bomb. Page it, cap it, summarise it — decide the limit yourself.

## Why this is the un-glamorous, correct path

Giving a model a shell feels powerful because it offloads the hard part — deciding
what the system should actually let happen — onto the model's judgement, turn by
turn. Typed tools put that decision back where it belongs: in an interface you
designed, reviewed, and tested once.

It's the same instinct as everywhere else in engineering. You don't hand a caller
raw database access and hope; you give them an API. An agent is just another
caller — a fast, capable, occasionally overconfident one. Design for it like you'd
design for any client you don't fully control.
