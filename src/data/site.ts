export interface NavItem {
  label: string;
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: 'github' | 'linkedin' | 'stackoverflow' | 'mail' | 'rss';
}

export const site = {
  name: 'Shahin Kiassat',
  role: 'Software Engineer',
  tagline: "I build systems that don't take your word for it.",
  taglineDetail:
    'An orchestrator that re-runs the tests instead of believing the agent. A code map where every edge cites file and line. A trading engine that can replay any decision it ever made. Ten years of shipping production .NET — currently spent making autonomous tooling earn trust.',
  location: 'London, UK',
  /** Public contact address. */
  email: 'Shahin.Kiassat90@gmail.com',
  /** Canonical origin (matches astro.config `site`). */
  url: 'https://shaahink.github.io',
  description:
    'Shahin Kiassat — software engineer in London. Distributed systems, .NET, and the tooling that makes AI agents verifiable: agent orchestration, code-graph analysis, deterministic trading engines.',
} as const;

export const nav: NavItem[] = [
  { label: 'home', href: '/' },
  { label: 'writing', href: '/blog' },
  { label: 'projects', href: '/projects' },
  { label: 'about', href: '/about' },
];

export const socials: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/shaahink', icon: 'github' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/shahinkiassat/', icon: 'linkedin' },
  {
    label: 'Stack Overflow',
    href: 'https://stackoverflow.com/users/369161/shahin',
    icon: 'stackoverflow',
  },
  { label: 'Email', href: `mailto:${site.email}`, icon: 'mail' },
];
