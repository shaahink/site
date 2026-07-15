---
title: "Don't trust the agent — verify it"
description: "Autonomous coding agents lie by omission: they report success they didn't earn. The fix isn't a better prompt — it's an orchestrator that independently checks every claim."
pubDate: 2026-06-20
tags: ['ai', 'agents', 'architecture']
---

If you let a coding agent run unattended across a long plan, you eventually hit
the core problem: **an agent's report of its own work is not evidence.** It will
tell you a stage is done. Sometimes it is. Sometimes it edited the wrong file,
sometimes the build is red, sometimes it wrote no code at all and narrated
progress anyway.

You can't prompt your way out of this. The report and the work come from the same
model in the same session — there's no independent witness. So I built one.

## Evidence, or it didn't happen

The orchestrator I've been working on ([Conductor](/projects#conductor)) treats every
session's claims as unverified until it checks them itself, out of process. After
a session exits, it looks at three independent signals:

1. **The gate battery** — it re-runs build, tests, and lint itself and reads the
   real exit codes. Not the agent's summary of them.
2. **Git** — did new commits actually appear?
3. **The tracker** — did a checkpoint's status genuinely flip to `DONE`?

A checkpoint only counts when all three agree:

```text
gates green  +  new commits exist  +  a checkpoint flipped to DONE
        →  Advanced (move on)

any required gate red
        →  GatesRed (next session is a *fix* session, with the
           failing output embedded in its prompt)

gates green, no commits
        →  NoProgress (the attempt is burned)
```

The asymmetry is deliberate. Advancing requires *positive evidence from every
source*. Failing requires only *one* source to disagree.

## "All done" is confirmed, not believed

The nicest bug this caught: an agent that marked the whole plan complete while the
final integration test was quietly failing. Because "the plan is done" triggers
one more **full** gate battery before declaring victory, the orchestrator caught
the red test and kicked off a fix session instead of celebrating.

That's the whole philosophy in one line: *deterministic first, model second.* Use
the cheap, boring, reliable checks — exit codes, git, a status table — as the
source of truth. Only consult the model when you've genuinely hit a dead end, and
even then, validate its answer against a fixed vocabulary of actions.

## Why this generalises

You don't need an agent orchestrator to use this. Any time you're automating
something with an LLM in the loop, ask: *what's my independent witness?* If the
only thing telling you the work succeeded is the same thing that did the work,
you don't have verification. You have a vibe.
