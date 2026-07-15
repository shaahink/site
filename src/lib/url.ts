// Base-path helper. When deployed as a project page the site lives under a
// sub-path (e.g. `/site`), so every app-absolute link must be prefixed.
const RAW_BASE = import.meta.env.BASE_URL; // '/site/' in prod, '/' at root
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE;

/**
 * Prefix an app-absolute path (one that starts with `/`) with the configured
 * base path. External URLs, `mailto:`, anchors, and relative paths pass through
 * unchanged.
 */
export function withBase(path: string): string {
  if (!path.startsWith('/')) return path;
  return `${BASE}${path}` || '/';
}
