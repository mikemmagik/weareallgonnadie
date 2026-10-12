import type {
  CreatePostInput,
  Embed,
  PostOrigin,
} from '../../shared/contracts.ts';
import { isHttpUrl } from '../../shared/contracts.ts';
import {
  normalizeUrl,
  publicHttp,
  publicUrl,
  RequestFailure,
  retryRequest,
} from './http.ts';
import type { Http } from './http.ts';

export function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, n: string) => {
      const number = n.startsWith('x') ? parseInt(n.slice(1), 16) : Number(n);
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : '';
    })
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_match, key: string) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key] ?? '',
    )
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map((m) => [
      m[1]!.toLowerCase(),
      decode(m[3]!),
    ]),
  );
}
export function extractMetadata(
  html: string,
  url: string,
): { title: string; image: string | null } {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content) meta.set(key.toLowerCase(), attrs.content);
  }
  const title =
    (
      meta.get('og:title') ??
      meta.get('twitter:title') ??
      decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    ).trim() || new URL(url).hostname;
  let image: string | null = null;
  try {
    const candidate = new URL(
      meta.get('og:image') ?? meta.get('twitter:image') ?? '',
      url,
    ).toString();
    if (meta.get('og:image') || meta.get('twitter:image'))
      image = isHttpUrl(candidate) ? candidate : null;
  } catch {
    /* Missing preview is valid. */
  }
  return { title: title.slice(0, 300), image };
}
export function providerEmbed(input: string): Embed {
  const url = new URL(input);
  const host = url.hostname;
  let provider: 'youtube' | 'reddit' | 'tiktok' | 'instagram' | undefined;
  let id: string | undefined;
  if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
      host,
    )
  ) {
    provider = 'youtube';
    id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ??
          url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1]);
    if (!id || !/^[\w-]{11}$/.test(id)) id = undefined;
  } else if (
    ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'redd.it'].includes(host)
  ) {
    provider = 'reddit';
    id =
      host === 'redd.it'
        ? url.pathname.match(/^\/([a-z0-9]+)\/?$/)?.[1]
        : url.pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/)?.[1];
  } else if (['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(host)) {
    provider = 'tiktok';
    id = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/)?.[1];
  } else if (['instagram.com', 'www.instagram.com'].includes(host)) {
    provider = 'instagram';
    id = url.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)\/?$/)?.[1];
  }
  return provider && id
    ? { kind: 'provider', provider, id, url: input }
    : { kind: 'link', url: input, label: 'Open original' };
}
export function linkPayload(
  url: string,
  title: string,
  source: string,
  origin: PostOrigin,
  sourceId: string | null = null,
): CreatePostInput {
  const normalized = normalizeUrl(url);
  const embed = providerEmbed(normalized);
  return {
    url,
    canonical_url: normalized,
    source_item_id: sourceId,
    title: title.slice(0, 300),
    source: source.slice(0, 100),
    origin,
    type:
      embed.kind === 'provider' &&
      ['youtube', 'tiktok', 'instagram'].includes(embed.provider)
        ? 'video'
        : 'news',
    preview: null,
    embed,
    body: null,
    references: [],
  };
}
export async function prepareUrl(
  input: string,
  http: Http = publicHttp,
): Promise<CreatePostInput> {
  const url = publicUrl(input).toString();
  let html = '';
  try {
    const response = await retryRequest(http, url);
    if (
      (response.headers.get('content-type') ?? '')
        .toLowerCase()
        .includes('text/html')
    )
      html = await response.text();
  } catch (error) {
    // Metadata availability is optional. Unsafe targets remain failures; never bypass them.
    if (!(error instanceof RequestFailure)) throw error;
  }
  const metadata = extractMetadata(html, url);
  const payload = linkPayload(
    input,
    metadata.title,
    new URL(url).hostname,
    'telegram',
  );
  payload.preview = metadata.image
    ? { image_url: metadata.image, alt_text: null }
    : null;
  return payload;
}
