export interface Project {
  /** Stable anchor on /projects (e.g. `/projects#conductor`). */
  slug: string;
  name: string;
  status: 'public' | 'building';
  /** One-line concept for the home now-board. */
  oneLiner: string;
  /** Narrative paragraphs for the projects page: the itch, the idea, the engineering. */
  story: string[];
  /** Quiet stack line — rendered small, not as keyword chips. */
  stack: string;
  /** External link (GitHub) when something is public. */
  href?: string;
  /** Short caveat shown next to the link, e.g. which part is public. */
  linkNote?: string;
}

export const projects: Project[] = [
  {
    slug: 'conductor',
    name: 'Conductor',
    status: 'building',
    oneLiner: 'An orchestrator that runs coding agents unattended — and never believes them.',
    story: [
      'Long multi-stage plans turn you into a babysitter: pick the next stage, spawn an agent session, watch for stalls, check the work, repeat until midnight. Conductor mechanises that loop — one session at a time, resumable at any point, watchable from a phone.',
      "The core design decision is the trust model: an agent's report of its own work is never evidence. After every session Conductor independently re-runs the gate battery and reads the real exit codes, checks git for new commits, and diffs the progress tracker. A checkpoint counts only when all three agree. Red gates spawn a fix session with the actual failing output embedded in the prompt.",
      "Under the hood it's event-sourced: an append-only events.jsonl is the truth and the run state is just a projection, so you can kill the process anywhere — Ctrl+C, reboot, power cut — and `conductor run` picks up where it left off. Sessions resolve to one of eight outcomes rather than pass/fail, a watchdog catches stalls and token-budget exhaustion with clean handoffs, and a cheap second-model advisor is consulted only at genuine dead ends. A live TUI dashboard runs in-process, with a separate Go companion app attaching over SSE.",
    ],
    stack: 'C# / .NET · Go (Bubble Tea) · MCP · Spectre.Console · Telegram bot',
  },
  {
    slug: 'devcontext',
    name: 'DevContext',
    status: 'building',
    oneLiner: 'Point it at any .NET repo and get a map you can trust — every edge cites file and line.',
    story: [
      "Coding agents re-explore a codebase from cold at the start of every session — grep, open, follow, forget. And the naive alternative, a call graph, dead-ends at exactly the places modern .NET hides its wiring: MediatR handlers, DI registrations, message-bus consumers. Nothing calls anything; everything is connected by convention.",
      'DevContext analyses a solution once into a typed code graph and answers two questions: the Map (what is here — architecture style, topology, entry points) and the Trace (how things connect — an endpoint through handlers, events, consumers, entities). Edges are built by joining detections rather than following calls, and each one carries provenance (file:line), a resolution kind, and a confidence. A priority ladder makes semantic edges outrank raw syntactic calls, so the trace follows meaning, not text.',
      'It has three faces over the same graph: a CLI, a desktop app with an explore workbench and a context studio that assembles LLM-ready context packs against a token budget, and an MCP server so agents can query the graph instead of grepping. Version 1 — the original Roslyn CLI — is public; v2 is the ground-up rebuild.',
    ],
    stack: 'C# · Roslyn · Angular · Tauri · gRPC · MCP',
    href: 'https://github.com/shaahink/DevContext',
    linkNote: 'v1 on GitHub — v2 in progress',
  },
  {
    slug: 'shamshir',
    name: 'Shamshir',
    status: 'building',
    oneLiner: 'A trading engine whose every decision can be replayed, byte for byte.',
    story: [
      "Algorithmic trading under prop-firm rules is an unforgiving environment: breach the daily drawdown once and the account is gone. You cannot learn those lessons against a live broker, and a backtester that's a separate implementation of the strategy proves nothing about the code that actually trades.",
      'So the engine is built around a pure reducer kernel: (state, market event) → (new state, intents). No I/O, no clock, no randomness inside — every side effect lives at the edges. Backtesting is not a parallel code path; it is the same reducer fed recorded events, which means a backtest exercises the exact logic that runs live, and any trading day can be replayed deterministically to inspect why a decision happened.',
      'Strategy output passes through a risk governor before it becomes an order — position sizing, exposure caps, and prop-firm constraints (daily and total drawdown) modelled as first-class domain objects with the power of veto. Around the kernel: multi-symbol, multi-timeframe indicators, an event log in SQLite, a cTrader adapter, a web dashboard, and a simulation test tier that runs credential-free.',
    ],
    stack: 'C# / .NET 10 · EF Core + SQLite · ASP.NET Core · cTrader',
  },
];
