import assert from 'node:assert/strict';
import test from 'node:test';
import { redditPost, tikTokVideoId } from '../shared/media.ts';
import { redditAdapter, redditWidgetUrl } from '../worker/reddit.ts';
import { playerFor } from '../src/lib/presentation.ts';

const original = 'https://www.reddit.com/r/aww/comments/crpjwk/example/';
test('Reddit supports only public post-shaped URLs and matching structured identifiers', () => {
  for (const url of [
    original,
    original.replace('www.', ''),
    original.replace('www.', 'old.'),
    'https://redd.it/crpjwk',
  ]) {
    assert.equal(redditPost(url)?.id, 'crpjwk');
    const player = playerFor({
      kind: 'provider',
      provider: 'reddit',
      id: 'crpjwk',
      url,
    });
    assert.ok(
      player?.src.startsWith(
        url.includes('redd.it')
          ? '/embed/reddit?url='
          : 'https://embed.reddit.com/r/aww/comments/crpjwk/',
      ),
    );
  }
  for (const url of [
    'https://reddit.com/r/aww/',
    'https://reddit.com/r/aww/comments/bad!/',
    'https://redd.it/abc/extra',
    'https://reddit.com/r/aww/comments/abc123/title/commentid',
    'https://reddit.com.evil.example/r/aww/comments/abc123/',
    'https://reddit.com:8443/r/aww/comments/abc123/',
    'https://user:pass@reddit.com/r/aww/comments/abc123/',
  ])
    assert.equal(redditPost(url), null);
  assert.equal(
    playerFor({
      kind: 'provider',
      provider: 'reddit',
      id: 'wrong',
      url: original,
    }),
    null,
  );
  assert.equal(
    tikTokVideoId('https://www.tiktok.com/@user/video/0000000000000000000'),
    null,
  );
});

test('short Reddit URL resolves through official oEmbed without executing any returned markup', async () => {
  const http = async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(
      String(url),
      'https://www.reddit.com/oembed?url=https%3A%2F%2Fredd.it%2Fcrpjwk',
    );
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    return Response.json({
      html: `<script>alert(1)</script><a href="https://evil.example/x">bad</a><a href="${original}">post</a>`,
    });
  };
  assert.equal(
    await redditWidgetUrl('https://redd.it/crpjwk', http as typeof fetch),
    'https://www.reddit.com/r/aww/comments/crpjwk/',
  );
  for (const response of [
    new Response('', { status: 403 }),
    new Response('', { status: 404 }),
    Response.json({
      html: '<a href="https://www.reddit.com/r/test/comments/other1/">other</a>',
    }),
    Response.json({ html: '<iframe src="javascript:bad"></iframe>' }),
    new Response('x'.repeat(65537)),
  ]) {
    assert.equal(
      await redditWidgetUrl(
        'https://redd.it/crpjwk',
        (async () => response) as typeof fetch,
      ),
      null,
    );
  }
  assert.equal(
    await redditWidgetUrl('https://redd.it/crpjwk', (async () => {
      throw new Error('provider unavailable');
    }) as typeof fetch),
    null,
  );
});

test('adapter constructs the official widget with opaque sandbox, scoped CSP and fallback links', async () => {
  const response = await redditAdapter(
    new Request(
      `https://monitor.test/embed/reddit?url=${encodeURIComponent(original)}`,
    ),
  );
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy')!;
  assert.match(csp, /sandbox allow-scripts allow-popups/);
  assert.doesNotMatch(csp, /allow-same-origin|unsafe-eval/);
  assert.match(csp, /frame-src https:\/\/embed.reddit.com;/);
  assert.match(response.headers.get('permissions-policy')!, /autoplay=\(\)/);
  const html = await response.text();
  assert.match(html, /class="reddit-embed-bq"/);
  assert.match(html, /https:\/\/embed.reddit.com\/widgets.js/);
  assert.match(html, /Open original Reddit post/);
  assert.match(html, /unavailable, deleted or restricted/);
  assert.doesNotMatch(html, /onerror=|<iframe|autoplay/);
  for (const query of [
    'url=javascript:alert(1)',
    'url=https://evil.example/',
    `url=${encodeURIComponent(original)}&html=%3Cscript%3Ealert(1)`,
    `url=${encodeURIComponent(original)}&url=${encodeURIComponent(original)}`,
  ]) {
    const invalid = await redditAdapter(
      new Request(`https://monitor.test/embed/reddit?${query}`),
    );
    assert.equal(invalid.status, 400);
    assert.doesNotMatch(await invalid.text(), /<script/);
  }
});

test('MEDIA-UX-001 resolver returns only validated Reddit identity as inert JSON', async () => {
  const response = await redditAdapter(
    new Request(
      `https://monitor.test/embed/reddit?url=${encodeURIComponent(original)}&resolve=1`,
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: 'https://www.reddit.com/r/aww/comments/crpjwk/',
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(
    response.headers.get('content-security-policy')!,
    /script-src 'self'/,
  );
  assert.doesNotMatch(
    response.headers.get('content-security-policy')!,
    /nonce|unsafe-inline|widgets.js/,
  );
  for (const query of [
    'url=https://evil.example/&resolve=1',
    `url=${encodeURIComponent(original)}&resolve=1&resolve=1`,
    `url=${encodeURIComponent(original)}&resolve=1&html=x`,
  ]) {
    const invalid = await redditAdapter(
      new Request(`https://monitor.test/embed/reddit?${query}`),
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { url: null });
  }
});

test('MEDIA-UX-001 provider layouts distinguish TikTok, Instagram Reel and post URLs', () => {
  for (const [provider, id, url, shape] of [
    [
      'tiktok',
      '6718335390845095173',
      'https://www.tiktok.com/@scout2015/video/6718335390845095173',
      'tiktok',
    ],
    [
      'instagram',
      'reel/Abc_def123',
      'https://www.instagram.com/reel/Abc_def123/',
      'instagram-reel',
    ],
    [
      'instagram',
      'p/Abc_def123',
      'https://www.instagram.com/p/Abc_def123/',
      'instagram-post',
    ],
  ] as const) {
    assert.equal(
      playerFor({ kind: 'provider', provider, id, url })?.shape,
      shape,
    );
  }
});
