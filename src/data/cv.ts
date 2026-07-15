export interface SkillGroup {
  group: string;
  items: string[];
}

export interface ExperienceEntry {
  /** Sector / type of company — intentionally not the employer's name. */
  company: string;
  role: string;
  location?: string;
  period: string;
  tech?: string;
  highlights: string[];
}

export const summary = `Software Engineer with 10+ years' experience designing and delivering production systems across startups and scale-ups in FinTech, geospatial, and cybersecurity. Strong focus on backend and distributed systems, with hands-on delivery across the full stack using C#/.NET, Angular, and cloud platforms.

Most recently the sole engineer at an early-stage cybersecurity startup, owning the architecture and delivery of an AI-powered threat intelligence platform end-to-end — event-driven data pipelines, cloud infrastructure, and LLM integration (RAG, prompt orchestration, context management). I build the tooling and guardrails that make AI agents reliable on real codebases — not throwaway prompt scripts. Comfortable in ambiguous environments, making architectural decisions, and shipping iteratively.`;

export const skills: SkillGroup[] = [
  {
    group: 'Core Languages & Frameworks',
    items: ['C#', '.NET (ASP.NET Core, Web API)', 'TypeScript', 'JavaScript', 'Python', 'Angular', 'FastAPI', 'WPF'],
  },
  {
    group: 'Cloud & Infrastructure',
    items: ['Azure', 'GCP', 'Docker', 'Bicep', 'Terraform', 'CI/CD (Azure DevOps, GitHub Actions)', '.NET Aspire'],
  },
  {
    group: 'Data & Messaging',
    items: ['SQL Server', 'PostgreSQL', 'EF Core', 'Dapper', 'Cosmos DB', 'BigQuery', 'RabbitMQ', 'MassTransit', 'Azure Service Bus'],
  },
  {
    group: 'Distributed Systems',
    items: ['Microservices', 'Event-Driven Architecture', 'REST APIs', 'Scalable Data Pipelines', 'Message-Driven Systems'],
  },
  {
    group: 'AI Engineering & Dev Tooling',
    items: ['RAG Pipelines', 'LLM Integration', 'Agent Orchestration', 'MCP Servers', 'Context Management', 'Vector Databases', 'Code Analysis (Roslyn)'],
  },
  {
    group: 'Engineering Practices',
    items: ['System Design', 'Testing (Unit/Integration)', 'Code Reviews', 'Observability', 'Performance Optimisation', 'Secure API Design (JWT, IdentityServer)'],
  },
];

export const experience: ExperienceEntry[] = [
  {
    company: 'AI Cybersecurity Startup',
    role: 'Software Engineer (Sole Engineer)',
    location: 'Remote',
    period: 'Mar 2024 – Mar 2026',
    tech: 'C#, .NET Core, Angular, TypeScript, Azure, Docker, Bicep, Azure DevOps, RabbitMQ, Azure Service Bus, MassTransit, .NET Aspire, EF Core, Dapper',
    highlights: [
      'Sole full-stack engineer at an early-stage cybersecurity startup, taking end-to-end ownership of an AI-powered threat intelligence platform designed to augment security teams with continuous, dialogue-based analysis.',
      'Designed and built scalable, event-driven ingestion pipelines handling high-frequency feeds — from firewall logs to 500K-record datasets and 50GB dumps — with horizontal scaling via queue backlog.',
      'Integrated a RAG-based AI engine end-to-end: session management, prompt construction, context extraction, and vector database integration.',
      'Built a responsive Angular SPA with conversational UI, interactive dashboards, and graph visualisations focused on smooth real-time AI interactions.',
      'Led the Azure migration — containerised with Docker, defined infrastructure as code in Bicep, and established Azure DevOps CI/CD for confident weekly releases.',
      'Built open-source developer tooling (a Roslyn-based CLI that extracts structured architectural context from .NET solutions) to make LLM-assisted development reliable rather than guesswork.',
    ],
  },
  {
    company: 'Navigation & Accessibility Startup',
    role: 'Software Engineer',
    location: 'London',
    period: 'Nov 2023 – Jan 2024',
    highlights: [
      'Led the redesign of a legacy client-server application to C#/.NET and Angular/TypeScript, reducing technical debt by 60% and enabling twice-weekly releases.',
      'Transitioned the system from monolithic to loosely-coupled microservices, improving scalability and reducing deployment risk.',
      'Resolved 70% of the accumulated bug backlog through targeted refactoring and increased automated test coverage.',
    ],
  },
  {
    company: 'Data Platform Consultancy',
    role: 'Software Engineer (Contract)',
    location: 'London · Remote',
    period: 'Nov 2023 – Sep 2024',
    tech: 'C#, .NET Core, GCP, React, Dapper, Docker, Web API, Terraform',
    highlights: [
      'Designed high-throughput .NET Core APIs integrated with GCP (Pub/Sub, Cloud Storage, Compute Engine) processing 500K+ daily transactions.',
      'Migrated long-running batch jobs to an event-driven architecture with RabbitMQ, reducing failure rates by 40%.',
      'Built GCP infrastructure as code with Terraform, streamlining provisioning and accelerating delivery.',
      'Integrated ML pipeline components into a large-scale data-processing initiative, enabling 2× throughput without performance degradation.',
    ],
  },
  {
    company: 'Algorithmic Trading Firm',
    role: 'Software Engineer / Algo Trader',
    location: 'London · Contract',
    period: 'Nov 2022 – Sep 2023',
    tech: 'C#, .NET Core, Entity Framework, Web API, Python, FastAPI, SQL Server, Angular',
    highlights: [
      'Developed two core microservices for an algorithmic trading platform and real-time data analytics using SOLID principles and clean architecture.',
      'Prototyped ML-based trading models in Python (pandas, scikit-learn) with robust backtesting frameworks for pattern recognition and signal validation.',
      'Created Angular dashboards for real-time trading performance monitoring and portfolio analytics.',
    ],
  },
  {
    company: 'Geospatial Software Company',
    role: 'Software Engineer',
    location: 'Guildford',
    period: 'Jul 2019 – Aug 2022',
    tech: 'C#, .NET Core, TDD, Angular, SQL Server, Azure DevOps, Docker, Python',
    highlights: [
      'Delivered a scalable queue-management and deferred-results system using TDD, increasing throughput by 30%.',
      'Developed a centralised SSO service using IdentityServer and JWT for secure multi-application authentication.',
      'Mentored the team on CI/CD pipelines, Git workflows, and test-driven development.',
    ],
  },
  {
    company: 'Logistics SaaS Company',
    role: 'Senior Software Developer',
    location: 'High Wycombe',
    period: 'Sep 2017 – Jun 2019',
    tech: 'C#, ASP.NET Web API, Angular, Entity Framework, TypeScript, Microservices, Xamarin',
    highlights: [
      'Built a SaaS courier-management platform handling high-volume, real-time logistics transactions with 99.9% uptime.',
      'Applied Dependency Injection and SOLID principles to create maintainable, testable microservices.',
      'Achieved high test coverage through unit and integration testing, reducing production defects by 50%.',
    ],
  },
  {
    company: 'Geospatial Software Company',
    role: 'Senior Software Developer',
    location: 'Guildford',
    period: 'Feb 2015 – Sep 2017',
    tech: 'ASP.NET MVC, C#, WPF, SQL Server, AngularJS, Dapper, GIS Integration',
    highlights: [
      'Led development of flagship mapping and transport-accessibility analysis tools used by government and commercial clients.',
      'Contributed core features and performance optimisations to a market-leading transport-accessibility analysis platform.',
      'Designed multi-tenant architecture and GIS integration for scalable public-sector deployment.',
    ],
  },
];

export const earlier = `Earlier (2011–2015): full-stack developer roles delivering ASP.NET and WPF solutions in C# and SQL Server — building automation tools and contributing to early single-page application development with AngularJS.`;
