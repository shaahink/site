export interface SeriesInfo {
  /** Referenced by the `series` frontmatter field on posts. */
  id: string;
  title: string;
  /** One-liner shown in the series box on each post. */
  blurb: string;
}

// No active series right now. The machinery (series box, series-aware prev/next,
// seriesOrder sorting) stays wired up in posts.ts and PostLayout — register a new
// series here and set `series`/`seriesOrder` in post frontmatter to revive it.
export const seriesIndex: Record<string, SeriesInfo> = {};
