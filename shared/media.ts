/** Provider identities are parsed from URLs, never from arbitrary player markup. */
function providerUrl(value: unknown): URL | null {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value.trim() !== value
  )
    return null;
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url
      : null;
  } catch {
    return null;
  }
}

export function isTikTokUrl(value: unknown): boolean {
  const url = providerUrl(value);
  return (
    !!url &&
    (!!tikTokVideoId(value) ||
      (['vt.tiktok.com', 'vm.tiktok.com'].includes(url.hostname) &&
        /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)))
  );
}

export function tikTokVideoId(value: unknown): string | null {
  const url = providerUrl(value);
  if (
    !url ||
    !['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname)
  )
    return null;
  return (
    url.pathname.match(/^\/@[\w.-]+\/video\/([1-9]\d{14,24})\/?$/)?.[1] ?? null
  );
}

export interface RedditPost {
  id: string;
  url: string;
  short: boolean;
}
export function redditPost(value: unknown): RedditPost | null {
  const url = providerUrl(value);
  if (!url) return null;
  if (url.hostname === 'redd.it') {
    const id = url.pathname.match(/^\/([a-z0-9]{3,10})\/?$/)?.[1];
    return id ? { id, url: `https://redd.it/${id}`, short: true } : null;
  }
  if (
    !['reddit.com', 'www.reddit.com', 'old.reddit.com'].includes(url.hostname)
  )
    return null;
  const match = url.pathname.match(
    /^\/r\/([a-zA-Z0-9_]{2,21})\/comments\/([a-z0-9]{3,10})(?:\/[^/]*)?\/?$/,
  );
  return match
    ? {
        id: match[2]!,
        url: `https://www.reddit.com/r/${match[1]}/comments/${match[2]}/`,
        short: false,
      }
    : null;
}
