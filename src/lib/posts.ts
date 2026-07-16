import { getCollection, render, type CollectionEntry } from 'astro:content';

export interface PostSummary {
  slug: string;
  data: CollectionEntry<'blog'>['data'];
  minutesRead: number;
}

/** Published posts (drafts hidden in production), newest first.
 * Same-day ties break on series reading order, then title, so the order is stable
 * across builds (a series published in one day lists part 1 first). */
export async function getPublishedPosts(): Promise<CollectionEntry<'blog'>[]> {
  const posts = await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true,
  );
  return posts.sort(
    (a, b) =>
      b.data.pubDate.getTime() - a.data.pubDate.getTime() ||
      (a.data.seriesOrder ?? 0) - (b.data.seriesOrder ?? 0) ||
      a.data.title.localeCompare(b.data.title),
  );
}

export interface SeriesPart {
  slug: string;
  title: string;
  order: number;
}

/** Published posts belonging to a series, in reading order. */
export async function getSeriesParts(seriesId: string): Promise<SeriesPart[]> {
  const posts = await getPublishedPosts();
  return posts
    .filter((p) => p.data.series === seriesId)
    .map((p) => ({ slug: p.id, title: p.data.title, order: p.data.seriesOrder ?? 0 }))
    .sort((a, b) => a.order - b.order);
}

/** Published posts enriched with computed reading time, newest first. */
export async function getPostSummaries(): Promise<PostSummary[]> {
  const posts = await getPublishedPosts();
  return Promise.all(
    posts.map(async (post) => {
      const { remarkPluginFrontmatter } = await render(post);
      return {
        slug: post.id,
        data: post.data,
        minutesRead: (remarkPluginFrontmatter.minutesRead as number | undefined) ?? 1,
      };
    }),
  );
}

/** Unique tags across published posts, alphabetically sorted. */
export async function getAllTags(): Promise<string[]> {
  const posts = await getPublishedPosts();
  const tags = new Set<string>();
  for (const post of posts) for (const tag of post.data.tags) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}
