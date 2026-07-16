import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';
import { site } from '../../data/site';

// One social card per post, plus a default card ('site') used by non-post pages.
// Generated at build time as /og/<slug>.png (1200×630).
const posts = await getCollection('blog');

const pages: Record<string, { title: string; description: string }> = Object.fromEntries(
  posts.map((post) => [post.id, { title: post.data.title, description: post.data.description }]),
);
pages['site'] = { title: site.tagline, description: site.description };

// House style: warm near-black, amber accent bar, JetBrains Mono (TTFs — CanvasKit
// can't read the woff2 files @fontsource ships, so these come from the JetBrains repo).
export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[15, 14, 12]],
    border: { color: [226, 162, 74], width: 14, side: 'inline-start' },
    padding: 72,
    font: {
      title: {
        size: 60,
        weight: 'Bold',
        lineHeight: 1.2,
        families: ['JetBrains Mono'],
        color: [250, 248, 243],
      },
      description: {
        size: 28,
        lineHeight: 1.5,
        families: ['JetBrains Mono'],
        color: [176, 168, 152],
      },
    },
    fonts: [
      'https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Bold.ttf',
      'https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Regular.ttf',
    ],
  }),
});
