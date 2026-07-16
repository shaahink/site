import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { site } from '../data/site';
import { getPublishedPosts } from '../lib/posts';
import { withBase } from '../lib/url';

const parser = new MarkdownIt();

/** Posts write internal links as `/blog/...` — feed readers need them absolute. */
function absolutize(href: string | undefined): string {
  if (!href) return '';
  return href.startsWith('/') ? `${site.url}${withBase(href)}` : href;
}

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: `${site.name} — Blog`,
    description: site.description,
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: withBase(`/blog/${post.id}/`),
      categories: post.data.tags,
      // Full post body, so the feed is readable without a click-through.
      content: sanitizeHtml(parser.render(post.body ?? ''), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        transformTags: {
          a: (tagName, attribs) => ({
            tagName,
            attribs: { ...attribs, href: absolutize(attribs.href) },
          }),
          img: (tagName, attribs) => ({
            tagName,
            attribs: { ...attribs, src: absolutize(attribs.src) },
          }),
        },
      }),
    })),
  });
}
