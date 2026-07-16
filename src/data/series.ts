export interface SeriesInfo {
  /** Referenced by the `series` frontmatter field on posts. */
  id: string;
  title: string;
  /** One-liner shown in the series box on each post. */
  blurb: string;
}

export const seriesIndex: Record<string, SeriesInfo> = {
  'workshop-systems': {
    id: 'workshop-systems',
    title: 'Systems from the workshop',
    blurb:
      'Ten posts drawn from the source of Shamshir, Conductor, and DevContext — each with a runnable sample in the blog-code repo.',
  },
};
