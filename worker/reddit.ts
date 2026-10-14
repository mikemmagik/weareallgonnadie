import { redditPost } from '../shared/media.ts';
import { readBody } from './input.ts';
import { SECURITY_HEADERS } from './security.ts';

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}

/** Resolve short links using only the documented official endpoint, never scraped HTML. */
export async function redditWidgetUrl(
  original: string,
  http: typeof fetch = fetch,
): Promise<string | null> {
  const post = redditPost(original);
  if (!post) return null;
  if (!post.short) return post.url;
  try {
    const response = await http(
      `https://www.reddit.com/oembed?url=${encodeURIComponent(post.url)}`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const data: unknown = JSON.parse(
      new TextDecoder().decode(
        await readBody(
          new Request('https://adapter.invalid', {
            method: 'POST',
            body: response.body,
            duplex: 'half',
          } as RequestInit),
          64 * 1024,
        ),
      ),
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('html' in data) ||
      typeof data.html !== 'string'
    )
      return null;
    // Only a validated post URL is retained; all provider HTML/scripts are discarded.
    for (const match of data.html.matchAll(
      /<a\s[^>]*href=["']([^"']+)["']/gi,
    )) {
      const candidate = redditPost(match[1]);
      if (candidate && !candidate.short && candidate.id === post.id)
        return candidate.url;
    }
  } catch {
    /* Provider restrictions, timeouts and unavailable posts keep the source link. */
  }
  return null;
}

/** No arbitrary markup. The official widget executes only inside this opaque sandbox. */
export async function redditAdapter(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const original = params.get('url');
  const post = redditPost(original);
  const resolve = params.get('resolve') === '1';
  const valid =
    request.method === 'GET' &&
    params.size === (resolve ? 2 : 1) &&
    (!resolve || params.getAll('resolve').length === 1) &&
    params.getAll('url').length === 1 &&
    post;
  const widgetUrl = valid ? await redditWidgetUrl(post.url) : null;
  // Resolve identity only after frontend consent; no provider markup enters the host.
  if (resolve) {
    return Response.json(
      { url: widgetUrl },
      {
        status: valid ? 200 : 400,
        headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' },
      },
    );
  }
  const nonce = crypto.randomUUID();
  const source = post
    ? `<a href="${escape(post.url)}" target="_blank" rel="noopener noreferrer">Open original Reddit post ↗</a>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reddit embed</title>
<style>html{color-scheme:dark}body{margin:0;padding:8px;background:#101414;color:#d6ded9;font:14px system-ui}a{color:#e3eee8}iframe{max-width:100%}p{line-height:1.5}</style></head><body>
<p>Reddit · ${source}</p>
${widgetUrl ? `<blockquote class="reddit-embed-bq" data-embed-theme="dark" data-embed-showmedia="false" data-embed-height="500"><a href="${escape(widgetUrl)}">View post on Reddit</a></blockquote>` : ''}
<p id="status">${widgetUrl ? 'Reddit unavailable, deleted or restricted? Open the original post.' : 'Reddit embed unavailable or unsupported. Open the original post.'}</p>
${widgetUrl ? `<script nonce="${nonce}" async src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>` : ''}
</body></html>`;
  const headers = new Headers(SECURITY_HEADERS);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  // Nonce authorizes one fixed official script. 'self' would match the opaque origin
  // incorrectly in a sandbox. Inline styles are scoped here for widget sizing only.
  headers.set(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}' https://embed.reddit.com/widgets.js; style-src 'unsafe-inline'; frame-src https://embed.reddit.com; img-src 'none'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-popups`,
  );
  return new Response(html, { status: valid ? 200 : 400, headers });
}
