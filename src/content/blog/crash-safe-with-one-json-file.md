---
title: 'Crash-safe orchestration with one JSON file'
description: "Conductor can be killed at any instant — Ctrl+C, reboot, power cut — and `conductor run` picks up where it left off. No database: a full snapshot on every transition, written atomically, with owed work modelled as data."
pubDate: 2026-07-16
tags: ['dotnet', 'architecture', 'orchestration']
---

An orchestrator that [runs agents unattended](/blog/drive-the-agent-like-a-process)
for hours has one non-negotiable property: you can kill it *anywhere* and lose
nothing. Not "it shuts down gracefully" — laptops sleep, terminals close,
Windows updates reboot. Killed mid-session, mid-write, mid-anything,
`conductor run` must continue as if nothing happened.

[Conductor](/projects#conductor) gets that property without a database, an
event store, or anything you'd put on a CV. It's one JSON file and three
habits.

## Habit 1: persist on every transition

`RunState` is the whole world: current stage, attempt counters, session
history with costs, pending work. Any time anything changes — session
started, session ended, gates evaluated, backoff begun — the entire state is
serialised and saved. There is no "we'll flush later"; later is when the
power goes.

Whole-file rewrites sound wasteful until you measure: the state is kilobytes,
transitions happen every few minutes, and the file doubles as a debugging
view — `cat state.json` *is* the admin UI.

## Habit 2: write atomically

```csharp
public void Save(string path)
{
    var tmp = path + ".tmp";
    File.WriteAllText(tmp, JsonSerializer.Serialize(this, JsonOpts));
    File.Move(tmp, path, overwrite: true);   // atomic rename
}
```

The write goes to a temp file; the rename is atomic on NTFS and ext4. The
file at `path` is always either the complete old state or the complete new
state — a torn half-write is structurally impossible, no matter when the
process dies. Loading is symmetrically paranoid: a file that fails to parse
is quarantined (`state.json.corrupt`), never fatal, because a corrupt state
file must not brick the orchestrator that's supposed to be self-healing.

This two-line pattern is criminally underused. It's the entire durability
story of a tool I trust with overnight runs.

## Habit 3: owed work is data, not context

The subtle failure mode of resumable systems isn't losing state — it's losing
*intent*. The process knew it was about to re-run a red gate; the restarted
process doesn't. Conductor models every such obligation as an explicit record
in the state:

```csharp
public PendingFix?       PendingFix { get; set; }       // failing gate output to embed
public PendingResume?    PendingResume { get; set; }    // claude session id to resume
public PendingPhaseGate? PendingPhaseGate { get; set; } // full battery owed for a stage
public PendingAudit?     PendingAudit { get; set; }     // audit owed after gates went green
```

Restart logic is then almost insultingly simple: load the state, look at
what's owed, do that. If Conductor was killed mid-session, the shutdown path
records `PendingResume` with the agent's session id — the next run resumes
that same session (`claude --resume`) rather than starting the stage over and
paying for the work twice.

One more record earns its place: `LastGreenGateSig`, a hash of git HEAD plus
the gate set from the last full green battery. On restart, if the tree hasn't
changed, the battery isn't re-run. Resumability shouldn't cost you a
twenty-minute test suite every time you Ctrl+C.

## Why not event sourcing?

[Shamshir](/blog/designing-a-kernel) journals every event; Conductor
snapshots. That's not inconsistency — it's matching the persistence to the
questions asked of it. The trading engine must answer *"why did it decide
this, byte for byte?"* — that's a log. The orchestrator must answer *"where
was I?"* — that's a snapshot, and the session history list inside it covers
the audit trail humans actually read. Single writer, small state, no
projections needed: the JSON file wins on every axis that matters here,
including the one where you can read it with your eyes.

The costs are the mirror image: no history of state *transitions* (only what
the history list records), and a single-writer assumption that out-of-process
commands respect by going through a control file rather than touching the
state. Both are prices happily paid for a durability model that fits in your
head.

---

*Runnable, distilled version: [`06-crash-safe-state`](https://github.com/shaahink/blog-code/tree/main/06-crash-safe-state)
in [blog-code](https://github.com/shaahink/blog-code) — a worker killed at step 4 resumes at step 5, obligations intact.
The real thing: [RunState.cs](https://github.com/shaahink/conductor/blob/master/src/Conductor/Models/RunState.cs)
in [Conductor](https://github.com/shaahink/conductor).*
