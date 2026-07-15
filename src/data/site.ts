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
    "An orchestrator that re-runs the tests because the agent said “done” and was lying. A code map that has to cite file and line before I'll believe it. A trading engine that can replay its worst day in slow motion. Ten years of systems where being wrong costs money — mostly written in C#, though the language was never the hard part.",
  location: 'London, UK',
  /** Public contact address. */
  email: 'Shahin.Kiassat90@gmail.com',
  /** Canonical origin (matches astro.config `site`). */
  url: 'https://shaahink.github.io',
  description:
    'Shahin Kiassat — software engineer in London. Trading engines, agent orchestrators, code graphs, event pipelines: systems that have to prove what they did.',
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
