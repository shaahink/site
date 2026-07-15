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
  role: 'Full-Stack Software Engineer',
  tagline:
    'I build backend and distributed systems in C#/.NET — and the developer tooling that makes AI agents reliable on real codebases. Engineering discipline, not vibe coding.',
  location: 'London, UK',
  /** Public contact address. */
  email: 'Shahin.Kiassat90@gmail.com',
  /** Canonical origin (matches astro.config `site`). */
  url: 'https://shaahink.github.io',
  description:
    'Personal site and technical blog of Shahin Kiassat — a full-stack software engineer specialising in .NET, distributed systems, and applied AI/LLM tooling.',
} as const;

export const nav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Projects', href: '/projects' },
  { label: 'CV', href: '/cv' },
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
