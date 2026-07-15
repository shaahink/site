import { getCollection, render, type CollectionEntry } from 'astro:content';

export interface PostSummary {
  slug: string;
  data: CollectionEntry<'blog'>['data'];
  minutesRead: number;
}

/** Published posts (drafts hidden in production), newest first. */
export async function getPublishedPosts(): Promise<CollectionEntry<'blog'>[]> {
  const posts = await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true,
  );
  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
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
