---
title: 'A live MCP session in .NET'
description: "MCP hosts spawn your server per client, over stdio — but a Roslyn analysis takes thirty seconds you don't want to pay twice. The shape that works: a thin stdio front, one long-lived server behind it, and sessions as handles."
pubDate: 2026-07-16
tags: ['dotnet', 'ai', 'mcp', 'tooling']
---

[DevContext](/projects#devcontext) analyses a .NET solution into a typed code
graph so agents can [query instead of grep](/blog/point-dont-re-explore). The
analysis is the expensive part — a full Roslyn pass over a large solution
takes tens of seconds. The consumers are cheap: "trace this endpoint", "what
implements this interface", answered from the warm graph in milliseconds.

MCP's process model fights that split. The host — Claude Code, Cursor,
whatever — spawns your server executable and speaks JSON-RPC over **stdio**.
Every client gets its own process; restart the client, lose the process. Put
the graph in the MCP server and you rebuild it per client, per restart,
per crash. Thirty seconds, again and again.

## Thin front, warm back

The shape that works is three layers:

1. **A stdio MCP executable that owns nothing.** It's a proxy. In DevContext
   it forwards every tool call over gRPC to…
2. **One long-lived local server** that owns the graph. The desktop app, the
   CLI and every MCP client share it — one analysis, many faces.
3. **A shim that makes the server exist.** On startup the MCP front pings
   `/health`; if nobody answers it spawns the server hidden, polls until
   ready, and remembers that *it* did the spawning so it can kill the process
   tree on exit. If the server was already there, it's left alone.

```csharp
// ServerShim.EnsureServerRunning, abridged
var response = pingClient.GetAsync($"{endpoint}/health").Result;
if (response.IsSuccessStatusCode) return null;      // already running — attach

var process = Process.Start(new ProcessStartInfo   // spawn hidden
{
    FileName = FindServerExe(),
    UseShellExecute = true,
    WindowStyle = ProcessWindowStyle.Hidden,
});
// …poll /health until ready, kill-on-exit only if we spawned it
```

The C# SDK makes the front end almost declarative — tools are attributed
methods, and the SDK derives snake_case names and JSON schemas from your
signatures and `[Description]` attributes:

```csharp
[McpServerToolType]
public sealed class DevContextTools
{
    [McpServerTool]
    public async Task<string> Analyze(string path) { /* → handle */ }

    [McpServerTool]
    public async Task<string> Trace(string? handle = null, string? query = null) { … }
}

services.AddMcpServer(o => o.ServerInfo = new() { Name = "devcontext", Version = "1.0.0" })
    .WithTools(toolsInstance)
    .WithStdioServerTransport();
```

## Sessions are handles

`analyze(path)` returns a **handle**; every other tool takes an optional one.
The resolution rule is friendly without being magical: an explicit handle
wins; if exactly one session is open, it's implied; zero or many sessions is
an error that says exactly what to do next —

```json
{"error":"No active session.","hint":"Run analyze first, then retry.","example":"analyze(\"C:/repos/MyApp\")"}
```

That error shape is a deliberate contract — short, actionable, and never a
stack trace. It matters enough that it gets [its own
post](/blog/fail-in-80-tokens).

## Rule zero: stdout belongs to the protocol

The classic stdio-server failure is your own logging. One
`Console.WriteLine`, one chatty library writing to stdout, and the JSON-RPC
stream is corrupt — the host reports a protocol error and you debug it for an
hour. DevContext routes Serilog to a rolling file under
`%LOCALAPPDATA%/DevContext/logs`; the console gets nothing. Anything a human
should see during development goes to **stderr**, which hosts happily ignore.

## Costs

You now manage a local server's lifecycle: discovery of the executable
(env var override first, then known install locations), version skew between
front and back (the `Ping` response carries the server version so mismatches
are visible), and the "who kills it" question the shim answers with
*whoever spawned it*. That's real machinery. But it buys the thing that makes
agents actually use the tools: a session that's already warm when the second
question arrives.

---

*Runnable, distilled version: [`03-mcp-live-session`](https://github.com/shaahink/blog-code/tree/main/03-mcp-live-session)
in [blog-code](https://github.com/shaahink/blog-code) — a stdio MCP server with live session handles, in two files.
The real thing: [DevContext.Mcp](https://github.com/shaahink/DevContext2/tree/feat/tapestry-t4/src/DevContext.Mcp)
in [DevContext](https://github.com/shaahink/DevContext2).*
