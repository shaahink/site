---
title: 'Watchdogging an autonomous agent'
description: "Left alone, agent sessions die in three boring ways: silence, eternity, and 'rate limit'. Each needs a different response — and only some of them should cost the agent an attempt."
pubDate: 2026-07-16
series: 'workshop-systems'
seriesOrder: 5
tags: ['ai', 'agents', 'orchestration']
---

When you babysit an agent session yourself, you *are* the watchdog. You notice
the tool stream going quiet, you notice it's been ninety minutes on a
twenty-minute task, you notice "usage limit reached" and go make coffee. Run
sessions unattended — as [Conductor](/projects#conductor) does, overnight —
and every one of those reflexes has to become code, because an exit code
reports none of them.

## The vital sign

The [session driver](/blog/drive-the-agent-like-a-process) stamps a timestamp
on every line the agent emits. That's the entire sensor:

```csharp
private long _lastActivityTicks;
// on every stdout/stderr line:
Interlocked.Exchange(ref _lastActivityTicks, DateTime.UtcNow.Ticks);
```

The supervision loop wakes every 400 ms and asks three questions:

```csharp
while (!agent.HasExited)
{
    if ((DateTime.UtcNow - agent.LastActivityUtc).TotalMinutes > limits.StallMinutes)
        { stalled = true; agent.Kill(); }         // silence
    else if ((DateTime.UtcNow - agent.StartedUtc).TotalMinutes > limits.SessionTimeoutMinutes)
        { timedOut = true; agent.Kill(); }        // eternity
    // …drain events, handle user control keys, heartbeat the report
    Thread.Sleep(400);
}
```

Nothing clever. The cleverness is in what happens *next*, because the three
deaths deserve three different responses.

## Whose fault was it?

That's the question the outcome ladder answers, and it decides everything
downstream — [an agent session is not
pass/fail](/blog/an-agent-session-is-not-pass-fail):

**Stall or timeout — the agent's fault (probably).** Kill it, then *resume
the same session* — `claude --resume <session-id>` — so the work in progress
isn't discarded. Resumes are budgeted (`maxResumesPerSession`); when the
budget is spent, an attempt is burned and the stage's attempt counter moves
toward "ask a human".

**Usage limit — the world's fault.** The backend saying *rate limit*,
*usage limit*, *quota* is not evidence against the agent. It hides in free
text, so a regex hunts it in the result and the raw stream tail:

```csharp
if ((agent.ResultIsError || exit != 0) && LimitRx.IsMatch(limitEvidence))
{
    QueueResume(rec, "usage/rate limit backoff", countResume: false); // no attempt burned
    _backoffUntil = DateTime.UtcNow.AddMinutes(plan.Limits.BackoffMinutes);
    state.Status = RunStatus.Backoff;
}
```

Wait, resume the same session, burn nothing. But *consecutive* backoffs are
counted, and past a cap the loop parks itself as `NeedsHuman` — if the quota
is gone for the night, no amount of retrying fixes it, and the right move is
a notification, not a loop.

**Order matters.** A killed process also has a nonzero exit code. The ladder
checks *why we killed it* before it reads the exit code as "agent error" —
otherwise every stall gets misfiled as a crash.

## Details that earn their keep

- **The kill must be total.** Sessions spawn build servers and watchers that
  detach from the process tree; a Windows Job Object with `KILL_ON_JOB_CLOSE`
  reaps them. A watchdog that kills the parent and leaves a `dotnet watch`
  holding file locks has just sabotaged its own next session.
- **Keep the tail.** The last ten lines of output ride along with the outcome
  — a stall's tail usually names the tool it died in, and a limit's tail is
  the evidence the regex matched.
- **Judgement stays out of the watchdog.** It observes, kills, classifies.
  What a `Stalled` outcome *means* for the plan — fix session, advisor
  consult, human — belongs to the orchestrator's evaluation step, which also
  [refuses to trust](/blog/dont-trust-the-agent) whatever the session claimed.

The honest limitation: stall thresholds are a judgement call. Set them tight
and you'll kill an agent mid-think during a long compile; set them loose and
you donate twenty minutes to every genuine hang. Conductor defaults to
minutes, not seconds, and treats a stall-kill as recoverable — killed then
resumed — precisely because the detector is allowed to be wrong.

---

*Runnable, distilled version: [`05-agent-watchdog`](https://github.com/shaahink/blog-code/tree/main/05-agent-watchdog)
in [blog-code](https://github.com/shaahink/blog-code) — three misbehaving children, three different verdicts.
The real thing: [Orchestrator.cs](https://github.com/shaahink/conductor/blob/master/src/Conductor/Core/Orchestrator.cs)
in [Conductor](https://github.com/shaahink/conductor).*
