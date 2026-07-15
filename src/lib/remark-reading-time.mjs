import getReadingTime from 'reading-time';
import { toString } from 'mdast-util-to-string';

/**
 * Remark plugin: compute an integer "minutes to read" for each post and
 * expose it on the Astro frontmatter as `minutesRead`.
 * Read via `remarkPluginFrontmatter.minutesRead` when rendering an entry.
 */
export function remarkReadingTime() {
  return function (tree, { data }) {
    const textOnPage = toString(tree);
    const readingTime = getReadingTime(textOnPage);
    data.astro.frontmatter.minutesRead = Math.max(1, Math.round(readingTime.minutes));
  };
}
