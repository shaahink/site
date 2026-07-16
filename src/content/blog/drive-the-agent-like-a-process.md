---
title: 'Your coding agent has a CLI — drive it like a process'
description: "Claude Code and friends ship headless modes that stream typed JSON to stdout. Everything my orchestrator does — dashboards, watchdogs, cost accounting, resumable pipelines — starts from treating an agent session as a supervised child process."
pubDate: 2026-07-16
tags: ['ai', 'agents', 'dotnet', 'orchestration']
---

[Conductor](/projects#conductor) runs coding agents unattended, one session at
a time, for hours. People assume that requires an SDK, or worse, a PTY and
terminal scraping. It requires neither. The agent CLIs already have a
first-class automation surface:

```
claude -p "<prompt>" --output-format stream-json
opencode run "<prompt>" --format json
```

Headless mode, prompt in, newline-delimited JSON out — every assistant
message, every tool call, and a final `result` envelope with cost and token
counts. An agent session becomes what forty years of Unix knows how to
supervise: **a child process with structured output**.

## Starting it properly

The details that matter are boring and load-bearing
([AgentSession.cs](https://github.com/shaahink/conductor/blob/master/src/Conductor/Core/AgentSession.cs)):

```csharp
var psi = new ProcessStartInfo(cfg.Command)
{
    WorkingDirectory = cwd,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    RedirectStandardInput = true,
    StandardOutputEncoding = Encoding.UTF8,
};
foreach (var a in args) psi.ArgumentList.Add(a);   // never a concatenated string
```

**`ArgumentList`, not an arguments string.** Prompts contain quotes, newlines
and JSON. Shell-quoting them yourself is a bug factory; `ArgumentList`
bypasses the shell entirely.

**Templates make the agent pluggable.** The config holds
`["-p", "{prompt}", "--output-format", "stream-json"]`; the driver replaces
`{prompt}`, `{sessionId}`, `{claudeSessionId}`. Swapping Claude Code for
opencode is a config edit, not a code change — Conductor supports both with
one session class and two parsers.

**Close stdin.** Headless agents shouldn't wait for input; some will.

**Tee the raw stream to a file before parsing.** When a session goes weird at
2 a.m., `session-042.jsonl` is the forensic record. Parsers are lossy by
design; the log is not.

## Parsing the stream

Each stdout line is one JSON event. The parser folds them into a small typed
vocabulary — `system | text | tool | result` — that feeds a live dashboard,
and stamps `LastActivityUtc` on every line, which is the vital sign the
[watchdog](/blog/watchdogging-an-autonomous-agent) lives on:

```csharp
case "result":
    if (root.TryGetProperty("is_error", out var ie) && ie.ValueKind == JsonValueKind.True)
        ResultIsError = true;
    if (root.TryGetProperty("result", out var res)) ResultText = res.GetString();
    if (root.TryGetProperty("total_cost_usd", out var c)) CostUsd = c.GetDecimal();
    if (root.TryGetProperty("num_turns", out var nt)) NumTurns = nt.GetInt32();
    break;
```

That `total_cost_usd` line is quietly the most important: it's what lets an
orchestrator keep a running bill per session, per stage, per plan — and stop
when a budget is gone rather than when a credit card notices.

## Kill means kill

An agent session spawns children — build tools, test runners, dev servers —
and some of them detach into new consoles and escape the normal process tree.
On Windows, `Process.Kill(entireProcessTree: true)` misses those. Conductor
assigns every session to a **Job Object** with `KILL_ON_JOB_CLOSE`
([JobObject.cs](https://github.com/shaahink/conductor/blob/master/src/Conductor/Core/JobObject.cs)):
close the handle and everything the session ever spawned dies with it. Without
this, a stray `dotnet watch` from session 12 holds a file lock that fails the
gate battery in session 13, and you spend an evening learning why.

## Then it's a pipeline

Once a session is a process with typed output, the orchestration layer on top
is almost mundane. Prompts are rendered from templates by session kind —
*deliver* for new work, *fix* with the actual failing gate output embedded,
*resume* via `claude --resume <session-id>` for interrupted work. Each session
ends as a `SessionRecord` — outcome, commits, cost, tokens, duration — and the
loop [never believes any of it](/blog/dont-trust-the-agent) without
independently re-running the gates.

The honest cost: you're coupled to the CLI's stream format, which is
versioned by vibes. The raw log plus a tolerant parser (unknown event types
become `raw`, never crashes) is what keeps that coupling survivable.

---

*Runnable, distilled version: [`04-cli-agent-driver`](https://github.com/shaahink/blog-code/tree/main/04-cli-agent-driver)
in [blog-code](https://github.com/shaahink/blog-code) — includes a fake agent, so it runs with nothing installed.
The real thing: [Conductor](https://github.com/shaahink/conductor).*
