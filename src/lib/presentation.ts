import { isHttpUrl } from '../../shared/contracts.ts';
import type { Embed } from '../../shared/contracts.ts';
import { redditPost } from '../../shared/media.ts';
import { publicPreviewUrl } from '../../shared/preview.ts';
import { resolveSource } from '../../shared/source.ts';
import type { Post } from '../../shared/contracts.ts';

/** Same-origin assets may load normally; external previews retain the shared policy. */
export function previewFor(value: unknown, origin: string) {
  if (!safeUrl(value)) return null;
  const url = new URL(value as string);
  if (url.origin === origin)
    return { url: url.href, external: false, provider: url.hostname };
  const safe = publicPreviewUrl(value);
  return safe
    ? { url: safe, external: true, provider: new URL(safe).hostname }
    : null;
}

export function safeUrl(value: unknown): string | null {
  return isHttpUrl(value) ? value : null;
}

/** Repair legacy ingress attribution visually without mutating the stored post. */
export function sourceForDisplay(post: Post): string {
  if (post.source.trim().toLowerCase() !== 'telegram') return post.source;
  return (
    resolveSource(safeUrl(post.canonical_url) ?? safeUrl(post.url))?.source ??
    post.source
  );
}

export interface Player {
  src: string;
  shape: 'wide' | 'tiktok' | 'instagram-post' | 'instagram-reel' | 'reddit';
  provider: string;
}
/** Sources are constructed here, never taken from external iframe markup. */
export function playerFor(embed: Embed | null): Player | null {
  if (!embed || embed.kind !== 'provider' || !safeUrl(embed.url)) return null;
  const url = new URL(embed.url);
  const id = embed.id;
  if (
    embed.provider === 'youtube' &&
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
      url.hostname,
    ) &&
    /^[\w-]{11}$/.test(id)
  ) {
    const sourceId =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ??
          url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/)?.[1]);
    if (sourceId !== id) return null;
    return {
      src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`,
      shape: 'wide',
      provider: 'YouTube',
    };
  }
  if (
    embed.provider === 'tiktok' &&
    ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname) &&
    /^\d{15,25}$/.test(id) &&
    url.pathname.match(/\/video\/(\d+)\/?$/)?.[1] === id
  ) {
    return {
      src: `https://www.tiktok.com/player/v1/${id}?autoplay=0`,
      shape: 'tiktok',
      provider: 'TikTok',
    };
  }
  if (
    embed.provider === 'instagram' &&
    ['instagram.com', 'www.instagram.com'].includes(url.hostname)
  ) {
    const match = url.pathname.match(/^\/(p|reel|tv)\/([\w-]+)\/?$/);
    const shortcode = id.replace(/^(p|reel|tv)\//, '');
    if (!match || match[2] !== shortcode || !/^[\w-]{5,64}$/.test(shortcode))
      return null;
    return {
      src: `https://www.instagram.com/${match[1]}/${shortcode}/embed/?autoplay=0`,
      shape: match[1] === 'p' ? 'instagram-post' : 'instagram-reel',
      provider: 'Instagram',
    };
  }
  if (embed.provider === 'reddit') {
    const post = redditPost(embed.url);
    if (!post || post.id !== id) return null;
    return {
      src: post.short
        ? `/embed/reddit?url=${encodeURIComponent(post.url)}&resolve=1`
        : `https://embed.reddit.com${new URL(post.url).pathname}?embed=true&theme=dark&showmedia=false&ref_source=embed&ref=share`,
      shape: 'reddit',
      provider: 'Reddit',
    };
  }
  // Short/ambiguous URLs without a verified provider identity retain original links.
  return null;
}

export interface TextBlock {
  kind: 'heading' | 'item' | 'paragraph';
  text: string;
}

/**
 * Split an article into readable plain-text paragraphs. Rendering keeps these
 * strings as text nodes, so supplied markup never becomes page content.
 */
export function articleBlocks(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Small readable plain-text/Markdown subset, with no HTML or inline execution. */
export function changelogBlocks(body: string): TextBlock[] {
  return body
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const heading =
        line.match(/^\s*#{1,6}\s+(.+)$/) ?? line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (heading) return { kind: 'heading', text: heading[1] ?? '' };
      const item = line.match(/^\s*[-+*]\s+(.+)$/);
      return item
        ? { kind: 'item', text: item[1] ?? '' }
        : { kind: 'paragraph', text: line.trim() };
    });
}

export function relativeDate(date: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days}d ago`
    : new Date(date).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}
