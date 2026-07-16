/**
 * Rehype plugin: prefix app-absolute URLs inside rendered Markdown with the
 * configured base path — `<a href>` (`/blog/...`, `/projects#x`) and
 * `<img src>` (`/images/...`). Without this, internal links and images
 * written naturally in posts would bypass the `/site` sub-path and 404 on
 * the deployed project page. External URLs, anchors, and already-prefixed
 * paths pass through unchanged.
 *
 * Usage in astro.config: `rehypePlugins: [[rehypeBaseLinks, base]]`.
 */
export function rehypeBaseLinks(base = '') {
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;

  return function transform(node) {
    if (prefix === '') return;
    const prop = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : undefined;
    const value = prop ? node.properties?.[prop] : undefined;
    if (
      typeof value === 'string' &&
      value.startsWith('/') &&
      value !== prefix &&
      !value.startsWith(`${prefix}/`)
    ) {
      node.properties[prop] = `${prefix}${value}`;
    }
    for (const child of node.children ?? []) transform(child);
  };
}
