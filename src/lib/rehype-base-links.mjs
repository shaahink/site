/**
 * Rehype plugin: prefix app-absolute hrefs (`/blog/...`, `/projects#x`) inside
 * rendered Markdown with the configured base path. Without this, internal
 * links written naturally in posts would bypass the `/site` sub-path and 404
 * on the deployed project page. External URLs, anchors, and already-prefixed
 * paths pass through unchanged.
 *
 * Usage in astro.config: `rehypePlugins: [[rehypeBaseLinks, base]]`.
 */
export function rehypeBaseLinks(base = '') {
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;

  return function transform(node) {
    if (prefix === '') return;
    const href = node.tagName === 'a' ? node.properties?.href : undefined;
    if (
      typeof href === 'string' &&
      href.startsWith('/') &&
      href !== prefix &&
      !href.startsWith(`${prefix}/`)
    ) {
      node.properties.href = `${prefix}${href}`;
    }
    for (const child of node.children ?? []) transform(child);
  };
}
