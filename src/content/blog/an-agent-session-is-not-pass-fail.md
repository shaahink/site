---
title: 'An agent session is not pass/fail'
description: "The first version of my orchestrator judged agent sessions as success or failure. Reality needed eight outcomes — and the distinction that matters most is whose fault the failure was."
pubDate: 2026-07-15
tags: ['ai', 'agents', 'orchestration']
---

The first version of [Conductor](/projects#conductor) — my orchestrator for
running coding agents unattended across multi-stage plans — judged every
session the obvious way: did it succeed or fail?

That model survived contact with reality for about two days. What do you call
a session that ran for forty minutes, kept the build green, and committed
nothing? A session that made real commits but didn't finish the checkpoint? A
session that died because the API rate-limited it? "Failure" lumps together
things that demand completely different responses — and an unattended loop *is*
its responses. Get the reaction wrong and the loop either gives up on plans it
could have finished, or burns money re-running work that was never broken.

## The taxonomy

Conductor now resolves every session to one of eight outcomes. None of them
come from the agent's own report — they're computed from three independent
signals after the session exits: the gate battery (build/tests/lint, re-run by
the orchestrator, real exit codes), the git log (did commits appear?), and the
plan tracker (did a checkpoint genuinely flip to `DONE`?).

| Observation | Outcome | Response |
|---|---|---|
| Gates green, new commits, checkpoint flipped | `Advanced` | Next checkpoint, attempts reset |
| Gates green, new commits, nothing flipped | `Progress` | Another delivery session |
| Gates green, no commits | `NoProgress` | Fix session; attempt burned |
| Any required gate red | `GatesRed` | Fix session with the failing output embedded |
| No output for N minutes | `Stalled` | Kill, resume the same session |
| Hard time limit hit | `TimedOut` | Same as stalled |
| Backend says rate/usage limit | `LimitBackoff` | Wait, resume — **no attempt burned** |
| Session token budget exceeded | `RolledOver` | Fresh session with handoff — **no attempt burned** |

Plus one park state that outranks them all: **NeedsHuman**. If the agent
writes `HUMAN:` in its handoff, or a checkpoint flips to `BLOCKED`, or the
loop detects two consecutive zero-output stalls, the run parks, publishes a
report, and notifies me. More on why that's a success in a moment.

## Whose fault was it?

The load-bearing distinction in that table isn't green versus red — it's
**agent-caused versus environment-caused**.

Every stage has an attempt budget (expected sessions × a slack factor). Burn
through it and the stage escalates. Early on, everything decremented that
budget, and I watched a plan die overnight because the provider rate-limited
for an hour and the orchestrator dutifully recorded strike after strike
against a stage that had done nothing wrong.

So the taxonomy encodes blame. `NoProgress` and `GatesRed` are on the agent —
they burn an attempt. `LimitBackoff` and `RolledOver` are weather — the loop
backs off or rolls over with a handoff, and the budget is untouched. A rate
limit is not evidence about the difficulty of the work.

`RolledOver` deserves a note, because naive token exhaustion is nasty: the
session dies mid-edit with no summary and the next session inherits a
half-finished mystery. Conductor watches spend, and at 80% of the budget it
injects a cooperative nudge: *stop opening new work, commit what's coherent,
write the handoff.* Exhaustion becomes a planned landing instead of a crash.

## The outcome picks the next prompt

The second thing the taxonomy buys: the outcome determines what *kind* of
session runs next, not just whether one runs.

- `GatesRed` spawns a **fix session** whose prompt embeds the actual failing
  gate output — the agent starts from the compiler error, not from "something
  is wrong, please investigate".
- `Stalled` doesn't start over; it **resumes the same session** (bounded per
  session), because mid-task context is expensive to rebuild.
- Budget exhausted → an **advisor** — a second, cheap model — reads the
  history and picks from a closed vocabulary: retry, resume, skip, or human.
  It's consulted only at genuine dead ends, and its answer is validated
  against that vocabulary. Deterministic first, model second.

## Parking is not failing

The early instinct is to treat "the loop stopped and asked for me" as defeat —
the whole point was autonomy. That's wrong. For an unattended system the real
failure modes are silent: retrying a doomed stage at 3am, or skipping past a
wrong assumption baked into the plan. `NeedsHuman` is the loop recognising the
limit of its evidence and saying so loudly, with a report of everything it
knows. I'll take that over confident thrashing every time.

Autonomy for coding agents doesn't come from a better model or a cleverer
prompt. It comes from the boring machinery around the model knowing exactly
what just happened — and having a specific, evidence-based reaction to each way
a session can end. Pass/fail was never going to carry that weight. A taxonomy
does.
