---
title: "Point, don't re-explore: giving an LLM a map of your .NET repo"
description: "Agents burn tokens re-discovering the same codebase every session. Here's the case for handing them a structured map instead — and how DevContext builds one with Roslyn."
pubDate: 2026-07-14
tags: ['dotnet', 'ai', 'tooling']
---

Every coding agent I've used has the same expensive habit: it re-explores the
repository from cold at the start of every session. It greps, it opens files, it
follows references, it rebuilds a mental model — and then the session ends and all
of that context evaporates. Next session, it does it again.

For a small project that's fine. For a real .NET solution — dozens of projects,
layers of dependency injection, MediatR handlers wired up by convention — it's
slow, costs a fortune in tokens, and the model still gets the wiring wrong.

## The idea

What if the first thing an agent read wasn't the raw source, but a **map**? A
compact, honest description of the architecture: the projects, how they depend on
each other, where the entry points are, and how a request actually flows through
the indirection.

That's what [DevContext](https://github.com/shaahink/DevContext) does. It's a CLI
that analyses a `.sln` and emits structured context — Markdown or JSON — designed
to be dropped straight into an LLM's context window.

## Why Roslyn

You can't build an honest map with regex. The whole point is to resolve
indirection: to say "this controller action ends up calling *that* handler" even
when nothing in the text links them. That needs real semantic analysis, which in
.NET means Roslyn.

```csharp
using var workspace = MSBuildWorkspace.Create();
var solution = await workspace.OpenSolutionAsync(solutionPath);

foreach (var project in solution.Projects)
{
    var compilation = await project.GetCompilationAsync();
    foreach (var tree in compilation.SyntaxTrees)
    {
        var model = compilation.GetSemanticModel(tree);
        var root = await tree.GetRootAsync();

        foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var symbol = model.GetSymbolInfo(invocation).Symbol;
            // symbol.ContainingType tells you where this call *actually* lands —
            // even across an interface or a DI registration.
        }
    }
}
```

The semantic model is the difference between "these two files mention the same
name" and "this call is dispatched to this concrete type."

## The rule that keeps it useful

There's one discipline that matters more than any feature: **never show what the
tool can't honestly answer.** A map that invents an edge — a confident but wrong
"this calls that" — is worse than no map at all, because the agent will trust it
and build on the lie.

So DevContext is explicit about scope and confidence. It says *what* it analysed
(the whole solution, or one project's closure) and *how sure* it is about each
edge. A tool you reach for blindly has to be self-aware about its blind spots.

## Where this goes

DevContext started as a one-shot context generator. The direction it's heading —
a queryable graph you can browse, trace, and expose over MCP — is the more
interesting version: one kernel, many faces. But the core bet is the same. Don't
make the model re-explore. Hand it the map.
