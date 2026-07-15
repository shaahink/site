export interface Project {
  name: string;
  blurb: string;
  tech: string[];
  status: 'public' | 'in-progress';
  href?: string;
  /** Surface on the home page. */
  featured?: boolean;
}

export const projects: Project[] = [
  {
    name: 'DevContext',
    blurb:
      'Open-source Roslyn CLI that analyses .NET solutions and generates structured architectural context — dependency graphs and call-tree traversal — for LLM-assisted development, refactoring, and onboarding.',
    tech: ['C#', '.NET 8', 'Roslyn', 'CLI', 'Prompt Engineering'],
    status: 'public',
    href: 'https://github.com/shaahink/DevContext',
    featured: true,
  },
  {
    name: 'DevContext v2 — Universal .NET Repo Lens',
    blurb:
      'The first thing you run on any .NET repo: point it at a clone, a .sln, or a GitHub URL and instantly browse it, trace any flow down through indirection (MediatR / DI / controllers), and pull entry points and stats. One queryable graph, three faces — CLI, browse UI, and MCP.',
    tech: ['C#', 'Roslyn', 'Angular', 'MCP', 'TypeScript'],
    status: 'in-progress',
    featured: true,
  },
  {
    name: 'Conductor',
    blurb:
      'A resilient orchestrator that drives multi-stage "mega plans" autonomously — spawning headless agent sessions, watchdogging for stalls, then independently verifying each with a gate battery, git diff, and tracker checkpoints. Event-sourced and fully resumable, with a live TUI and phone-friendly reporting.',
    tech: ['C#', '.NET', 'Go (Bubble Tea)', 'MCP', 'Spectre.Console'],
    status: 'in-progress',
    featured: true,
  },
  {
    name: 'Shamshir',
    blurb:
      'An event-driven algorithmic trading engine built around a pure reducer kernel — multi-symbol / multi-timeframe indicators, a risk and drawdown governor enforcing prop-firm (FTMO-style) constraints, and a backtest-replay path for benchmarking strategies.',
    tech: ['C#', '.NET', 'TypeScript', 'Event-Driven'],
    status: 'in-progress',
  },
];

export const featuredProjects = projects.filter((p) => p.featured);
