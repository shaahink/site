# shaahink.github.io

Personal website and technical blog of **Shahin Kiassat** — built with
[Astro](https://astro.build), styled with Tailwind CSS v4, and deployed to
GitHub Pages via GitHub Actions.

**Live:** https://shaahink.github.io

## Stack

- **Astro 5** — static output, zero JS by default, Shiki syntax highlighting
- **Tailwind CSS v4** — design tokens in `src/styles/global.css`, dark-first with a toggle
- **Markdown / MDX** — typed content collections (`src/content.config.ts`)
- **@astrojs/sitemap + @astrojs/rss** — SEO sitemap and an RSS feed at `/rss.xml`
- **pnpm** + **Node 22+**

## Develop

```bash
pnpm install      # install dependencies
pnpm dev          # local dev server at http://localhost:4321
pnpm check        # astro type check
pnpm build        # production build to ./dist
pnpm preview      # preview the built site
```

## Project layout

```
src/
  components/   UI building blocks (Header, Footer, cards, theme toggle…)
  layouts/      BaseLayout, PostLayout
  pages/        Routes: /, /blog, /blog/[slug], /projects, /cv, /tags/[tag], 404, rss.xml
  content/blog/ Blog posts (Markdown/MDX)
  data/         Single source of truth — site.ts, cv.ts, projects.ts
  lib/          posts helper + reading-time remark plugin
  styles/       global.css (design tokens + prose + Shiki theming)
public/         Static assets — favicon, robots.txt, CV PDF
```

## Editing content

- **Add a blog post:** create `src/content/blog/my-post.md` with frontmatter
  (`title`, `description`, `pubDate`, `tags`, optional `draft: true`). It appears
  automatically in `/blog`, the tag pages, the RSS feed, and the home page.
- **Update the CV / projects / links:** edit `src/data/cv.ts`,
  `src/data/projects.ts`, and `src/data/site.ts`. Replace the PDF at
  `public/cv/Shahin-Kiassat-CV.pdf`.

## Deployment (one-time setup)

The repo **must** be named `shaahink.github.io` (a GitHub user site).

1. Create the repo on GitHub named `shaahink.github.io` and push `main`.
2. In **Settings → Pages → Build and deployment**, set **Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml` (type check → build →
   deploy). The site publishes to https://shaahink.github.io.

### Custom domain (optional, later)

Add a file `public/CNAME` containing your domain (e.g. `shahinkiassat.com`),
point DNS at GitHub Pages, and set the domain under Settings → Pages.

## License

Content © Shahin Kiassat. Code is free to reuse.
