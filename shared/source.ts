import type { EmbedProvider } from './contracts.ts';

export interface SourceResolution {
  source: string;
  domain: string;
  provider: EmbedProvider | null;
}

const providerHosts: Record<EmbedProvider, ReadonlySet<string>> = {
  youtube: new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ]),
  reddit: new Set([
    'reddit.com',
    'www.reddit.com',
    'old.reddit.com',
    'redd.it',
  ]),
  tiktok: new Set([
    'tiktok.com',
    'www.tiktok.com',
    'm.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
  ]),
  instagram: new Set(['instagram.com', 'www.instagram.com']),
};

const sourceNames = new Map<string, string>([
  ['bangkokpost.com', 'Bangkok Post'],
  ['www.bangkokpost.com', 'Bangkok Post'],
]);

const providerNames: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

function hostname(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value.trim() !== value
  )
    return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    return url.hostname.replace(/\.$/, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizedDomain(host: string): string {
  return host.replace(/^(?:www|m|mobile|amp)\./, '');
}

/**
 * Presentation/ingestion attribution comes from exact public hostnames only.
 * A lookalike such as `youtube.com.example` therefore stays a domain fallback.
 */
export function resolveSource(value: unknown): SourceResolution | null {
  const host = hostname(value);
  if (!host) return null;
  for (const provider of Object.keys(providerHosts) as EmbedProvider[]) {
    if (providerHosts[provider].has(host))
      return {
        source: providerNames[provider],
        domain: normalizedDomain(host),
        provider,
      };
  }
  return {
    source: sourceNames.get(host) ?? normalizedDomain(host),
    domain: normalizedDomain(host),
    provider: null,
  };
}

export function recognizedEmbedProvider(value: unknown): EmbedProvider | null {
  return resolveSource(value)?.provider ?? null;
}
