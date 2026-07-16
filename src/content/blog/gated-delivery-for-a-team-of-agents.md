---
title: 'Gated delivery for a team of agents'
description: "Coding agents will work unattended for hours — if you stop believing anything they say. The full anatomy of an autonomous delivery loop: agent CLIs as processes, a ten-outcome vocabulary, independent gate batteries, fix sessions armed with evidence, and state that survives a power cut."
pubDate: 2026-07-16
tags: ['ai', 'agents', 'orchestration', 'dotnet']
---

Here is how a multi-stage delivery actually goes with a coding agent. You
write a beautiful plan. You feed stage one to the agent. It works; you check
it; fine. You feed it stage two. You wait. You alt-tab to something else. You
come back to find it finished twenty minutes ago — or stuck, forty minutes
ago. You check the work, you spawn the next session, you glance at the clock:
23:40. You are a highly trained engineer performing the duties of a while
loop.

I built [Conductor](/projects#conductor) to be that while loop. It runs
agent sessions unattended, one at a time, for hours — overnight is the
normal case, not the war story. And every design decision in it flows from
one axiom, which I'll state now and spend the rest of the post cashing out:

**An agent's report of its own work is not evidence.**

Not because agents lie maliciously. Because they are optimistic, occasionally
confused, and rewarded — in some deep gradient-descent sense — for sounding
finished. "All tests passing, the feature is complete" is a *claim*. The
orchestrator's job is to be the auditor that never signs a claim without
receipts. I've written before about [the trust
model](/blog/dont-trust-the-agent) in principle; this post is the machinery,
end to end.

## The automation surface nobody advertises

First, the enabling fact: you don't need an SDK, a browser harness, or PTY
scraping to drive a coding agent. The CLIs ship a first-class headless mode:

```
claude -p "<prompt>" --output-format stream-json
opencode run "<prompt>" --format json
```

Prompt in, newline-delimited JSON out: every assistant message, every tool
call, and a final `result` envelope carrying cost, token counts and an error
flag. Which means an agent session is something Unix has known how to
supervise for forty years — **a child process with structured output**.

The spawning code is boring, and every boring line is load-bearing:

```csharp
var psi = new ProcessStartInfo(cfg.Command)
{
    WorkingDirectory = repoPath,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    RedirectStandardInput = true,
    StandardOutputEncoding = Encoding.UTF8,
};
foreach (var a in args) psi.ArgumentList.Add(a);   // never a concatenated string
```

**`ArgumentList`, not an argument string** — prompts contain quotes, newlines
and JSON, and hand-quoting them for a shell is a bug factory with a night
shift. **Close stdin** — headless agents shouldn't wait for input; some will
anyway. **Tee the raw stream to a file** before parsing a single line —
`session-042.jsonl` is the forensic record for when something goes weird, and
parsers are lossy by design. And keep the parser *tolerant*: unknown event
types become `raw`, never an exception, because the stream format is
versioned by vibes.

Templates finish the job: the config holds
`["-p", "{prompt}", "--output-format", "stream-json"]`, and the driver
substitutes `{prompt}` and `{sessionId}`. Swapping Claude Code for opencode
is a config edit. The orchestrator has one session class and two parsers, and
genuinely does not care who's inside the process.

### Kill means kill

One hard-won subclause. Agent sessions spawn children — build tools, test
runners, dev servers — and some of them detach and escape the process tree.
On Windows, even `Process.Kill(entireProcessTree: true)` misses those.
Conductor puts every session in a **Job Object** with `KILL_ON_JOB_CLOSE`:
close one handle and everything the session ever started dies with it.

The tuition for this lesson: a stray `dotnet watch` from session 12 held a
file lock that failed the build gate in session 13, which spawned a fix
session that could not possibly fix anything, which burned the stage's
attempt budget, which stopped the run — all while the actual code was fine.
An orchestrator that can't guarantee a clean battlefield between sessions
will gaslight itself. Kill means kill.

## Sessions don't pass or fail — they end ten ways

The next thing unattended operation forces on you: an exit code is nowhere
near enough vocabulary. Conductor reduces every session to one of ten
explicit outcomes, and the enum is worth reading like a poem about
everything that can go wrong:

```csharp
public enum SessionOutcome
{
    Advanced,      // gates green, new commits, ≥1 checkpoint newly DONE
    Progress,      // gates green, new commits, no new DONE — multi-session stage, fine
    NoProgress,    // gates green but nothing committed
    GatesRed,      // gates failed after the session
    Stalled,       // no output for stallMinutes — killed
    TimedOut,      // exceeded sessionTimeoutMinutes — killed
    AgentError,    // agent process exited with an error result
    LimitBackoff,  // usage/rate limit detected — waiting it out
    KilledByUser,
    Interrupted,   // conductor itself died mid-session (recovered on restart)
}
```

The point of the vocabulary isn't taxonomy for its own sake — it's that
**different outcomes get different next moves**, and the difference is fault
attribution:

- **Stalled / TimedOut** — the agent's fault. Kill it, resume the same
  session with a bounded resume budget, and *burn an attempt* from the
  stage's allowance.
- **LimitBackoff** — the world's fault. The backend said "usage limit
  reached"; punishing the agent for that is nonsense. Wait it out, resume,
  burn *nothing*. (Detecting this one is a regex over the output tail,
  because the refusal hides in free text rather than any structured field.
  I'm not proud of it, but it's load-bearing: misclassify a rate limit as an
  agent failure and your overnight run dies at the exact moment it's most
  useful — when you're asleep and the API is busy.)
- **GatesRed** — actionable, and the evidence is already in hand. Spawn a fix
  session; more below.
- **NoProgress** — the strangest one. Everything's green, the agent chatted
  amiably, and *nothing changed in the repo*. Counted against the stage,
  because three of those in a row means the plan and the agent have agreed
  to disagree, and a human should look.

A watchdog produces the first two: every output line stamps
`LastActivityUtc`, and a supervision loop checks it against a stall limit
and a wall-clock timeout. The cost envelope feeds a second budget — the
`result` event's `total_cost_usd` accumulates per session, stage and run, so
the loop stops when the money's gone rather than when the credit card
notices.

## The verdict: three witnesses, no testimony

Now the core of the trust model. When a session ends "successfully" — clean
exit, no error flag — Conductor determines what actually happened using only
things it can *independently observe*:

1. **The gate battery** — re-run the builds, tests, linters. Real commands,
   real exit codes, no summaries accepted.
2. **Git** — `CommitsSince(startHead)`. Did the repo change? An agent that
   "completed the feature" without committing anything has completed
   nothing.
3. **The tracker diff** — the plan's checkpoints live in a tracker file;
   parse it before and after, and see which checkpoints *newly* flipped to
   DONE.

One line from the real log, because it summarises the whole philosophy:

```
verdict inputs: gates green · commits 3 · newly DONE [4.2] · dirty no
```

Gates green **and** commits exist **and** a checkpoint flipped ⇒ `Advanced`.
Gates green and commits but no checkpoint ⇒ `Progress`. The agent's parting
essay about its own excellence is not among the inputs. It's stored — it
makes good reading later — but it decides nothing.

Note what this makes the agent's claim of "done": a *hypothesis* the
orchestrator then tries to falsify, cheaply. Session says done → gates say
otherwise → session was wrong, and the loop knows it before the human ever
would. The wrongness gets caught in minutes, not discovered in review two
days later.

## Gates are a battery, not a script

The gates themselves deserve engineering care, because per-session gating
means they run *constantly*. Conductor's `GateRunner` walks the configured
gates in listed order with one scheduling rule: a gate marked non-parallel
is a **barrier**; consecutive parallel gates run **as one concurrent
batch**. So `build` runs alone, everyone waits — then tests, formatting and
the docs check fan out together. There are two tiers: a **fast** tier after
every session (seconds — the pulse check), and the **full battery** at phase
boundaries (the physical). Optional gates can fail as warnings; per-stage
filters keep irrelevant gates out of the loop.

That's four sentences of feature list with one purpose: keep the
verify-everything loop cheap enough that *nobody is ever tempted to skip
it*. A trust model you bypass under schedule pressure isn't a trust model.
It's decoration.

## Failure is an input: fix sessions

When gates come back red, the orchestrator doesn't retry with a hopeful "try
again, but better". It records a debt — literally a `PendingFix` in the run
state:

```csharp
public sealed class PendingFix
{
    public int FromSession { get; set; }
    public string GateFailures { get; set; } = "";   // the ACTUAL failing output
    public string ProgressSummary { get; set; } = "";
}
```

— and the next session is a **fix session** whose prompt embeds the real
failing gate output, the commits so far and what the last session claimed.
The difference in outcome quality between "tests failed, please fix" and
*here are the four failing test names and their assertion messages* is the
difference between a coin flip and a mechanic. Evidence in, fix out.

Fix isn't the only specialist. Sessions come in kinds — **Deliver** for new
work, **Fix** armed with failures, **Resume** (via `claude --resume
<session-id>`) to continue an interrupted session with its context intact,
and **Audit** at phase boundaries to review a whole stage's diff. Same
process machinery, different briefs. A team of agents, in the only sense
that currently works reliably: not five agents arguing in a group chat, but
specialists *across time*, each handed exactly the context its job needs,
each distrusted equally.

When the loop truly corners itself — resume budget exhausted, attempts gone —
it consults a cheap second-model **advisor** with a compact dossier: outcome
history, tracker state, the reason it's stuck. Continue, retry differently,
or stop and ask the human. A second opinion at dead ends only; the loop's
core stays deliberately dumb and auditable. Autonomy that knows when to
stop being autonomous — the run status even has a `NeedsHuman` state, which
is the system formally admitting you exist.

## Built to be killed

Anything that runs for hours will be interrupted — Ctrl+C, reboot, power
cut, or its own bug. Conductor treats that as a feature request: the entire
run state is one JSON document, snapshotted **atomically on every
transition** (write to temp file, rename over the old — the filesystem's
one free transaction). Owed work is recorded *as data*: `PendingFix`,
`PendingResume`, `PendingPhaseGate`, `PendingAudit`. Kill the process
anywhere; `conductor run` reads the state and does whatever is owed. There's
even an outcome for it — `Interrupted` — because dying mid-session is just
another way a session ends, and the resume machinery treats it accordingly.

The [companion sample](https://github.com/shaahink/blog-code/tree/main/gated-agent-delivery)
compresses this whole post into a ninety-second demo: a three-stage delivery
where the backend rate-limits stage one (backoff, no attempt burned), the
agent *lies* about stage two (gates catch it, the fix session gets the
evidence), a power cut lands between runs (atomic state resumes it), and the
agent stalls on stage three (watchdog kills, retry succeeds). Its final
self-report — which, unlike an agent's, you may believe, because it's a grep
over verified output:

```
delivered 3/3 stages · sessions: 6 · lies caught by gates: 1 · stalls caught by watchdog: 1
resumed after crash: True
```

## What this costs, honestly

**You're coupled to stream formats** that change without notice. The raw
log plus the tolerant parser is the survival kit, not a nicety.

**Your gates are your actual spec.** The loop delivers whatever the battery
accepts — it cannot want what you meant, only what you check. A weak battery
plus a diligent agent yields confidently delivered garbage at impressive
speed. Budget real time for gate quality; it's where the engineering went.

**Sequential sessions are slower than a human juggling three terminals** —
on a good day, when the human is fresh. The orchestrator's day has no
concept of fresh. It does the loop at 03:00 exactly as it does it at 09:00,
[watched from a phone](/blog/a-live-tui-in-the-ai-era) if you're curious,
and it never once believes the agent because believing was never in the
loop.

That last property compounds. Each session ends as a `SessionRecord` —
outcome, commits, checkpoints, cost, tokens, duration — so every run
produces its own audit trail. After a few weeks you know things about your
agents no anecdote could tell you: which stages burn attempts, where stalls
cluster, what a stage *costs*. The loop doesn't just deliver unattended. It
keeps the books.

---

*Runnable, distilled version:
[`gated-agent-delivery`](https://github.com/shaahink/blog-code/tree/main/gated-agent-delivery)
in [blog-code](https://github.com/shaahink/blog-code) — the full loop with a
bundled fake agent, so it runs with nothing installed. The real thing:
[Conductor](https://github.com/shaahink/conductor).*
