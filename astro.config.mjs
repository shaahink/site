// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { remarkReadingTime } from './src/lib/remark-reading-time.mjs';
import { rehypeBaseLinks } from './src/lib/rehype-base-links.mjs';

// Project page: served under /site/ on the user's github.io domain.
const base = '/site';

// https://astro.build
export default defineConfig({
  site: 'https://shaahink.github.io',
  base,
  integrations: [mdx(), sitemap()],
  redirects: {
    // The CV page became the About page in the 2026-07 redesign.
    // Astro does not base-prefix redirect destinations, so spell it out.
    '/cv': `${base}/about`,
  },
  markdown: {
    remarkPlugins: [remarkReadingTime],
    rehypePlugins: [[rehypeBaseLinks, base]],
    // Dual Shiki themes; the actual light/dark switch is driven by our
    // [data-theme] attribute in src/styles/global.css.
    shikiConfig: {
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
