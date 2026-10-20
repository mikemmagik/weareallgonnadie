import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api } from '../core/api.ts';
import { Publisher, State, payloadKey } from '../core/state.ts';
import {
  normalizeUrl,
  publicHttp,
  isPublicAddress,
  retryRequest,
  RequestFailure,
  UnsafeUrlError,
} from '../core/http.ts';
import type { Http } from '../core/http.ts';
import {
  prepareUrl,
  extractMetadata,
  providerEmbed,
  linkPayload,
} from '../core/metadata.ts';
import { handleUpdate } from '../telegram/handler.ts';
import { telegramCall, pollTelegram } from '../telegram/poll.ts';
import { parseFeed, collect, collectSource } from '../discovery/sources.ts';
import type { Source } from '../discovery/sources.ts';
import { runDiscovery } from '../discovery/run.ts';
import { previousMonth, runChangelog, monthStart } from '../changelog/run.ts';
import { parseAgentOutput, OpenClawAI } from '../openclaw/ai.ts';
import { configuration } from '../config.ts';
import type { CreatePostInput, Post } from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';

const ID = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const OTHER_ID = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb13';
const now = new Date('2026-10-12T02:00:00.000Z');
const noSleep = async () => {};
const json = (value: unknown, status = 200) => Response.json(value, { status });
const payload = () =>
  linkPayload(
    'https://news.example/story',
    'Robots replace a department',
    'Test News',
    'auto',
    'item-1',
  );
const post = (
  input = payload(),
  published_at = '2026-09-15T00:00:00.000Z',
): Post => ({ ...input, id: ID, published_at, deleted_at: null });
const source: Source = {
  name: 'Test News',
  url: 'https://feeds.example/rss',
  format: 'feed',
  enabled: true,
};
const rss = (title = 'Robots replace a department') =>
  `<rss><channel><item><title>${title}</title><link>https://news.example/story</link><guid>item-1</guid><pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate><description><![CDATA[Real source summary.]]></description></item></channel></rss>`;
const update = (text: string, senderId = 123) => ({
  update_id: 1,
  message: {
    from: { id: senderId, is_bot: false },
    chat: { id: senderId, type: 'private' },
    text,
  },
});
async function fixture(t: TestContext, http: Http) {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const publisher = new Publisher(
    new Api('https://site.example', 'mock-token', http, noSleep),
    new State(dir),
  );
  // Legacy fixtures exercise the raw retry primitive; operator enablement is
  // explicit in production and separately tested below.
  await publisher.setPaused('auto', false);
  return publisher;
}
function backend(posts: Post[] = [], outcome = 'created'): Http {
  return async (_url, init) => {
    if (init?.method === 'POST')
      return json(
        {
          ok: true,
          data: {
            outcome,
            matched_by: 'canonical_url',
            post: post(
              JSON.parse(String(init.body)) as CreatePostInput,
              now.toISOString(),
            ),
          },
        },
        outcome === 'created' ? 201 : 200,
      );
    if (init?.method === 'DELETE')
      return json({
        ok: true,
        data: { id: ID, deleted_at: now.toISOString() },
      });
    return json({ ok: true, data: { posts, next_cursor: null } });
  };
}
const metadataHttp: Http = async () =>
  new Response(
    '<meta property="og:title" content="Unrelated human-approved headline"><meta property="og:image" content="/preview.jpg">',
    { headers: { 'Content-Type': 'text/html' } },
  );

test('manual Telegram publication preserves approval, origin, metadata and API auth', async (t) => {
  let submitted: unknown;
  const publisher = await fixture(t, async (url, init) => {
    assert.equal(url, 'https://site.example/api/posts');
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer mock-token',
    );
    submitted = JSON.parse(String(init?.body));
    return backend()(url, init);
  });
  const reply = await handleUpdate(
    update('https://news.example/story#section'),
    new Set(['123']),
    publisher,
    metadataHttp,
  );
  assert.match(reply!.text, /^PUBLISHED/);
  assert.match(reply!.text, new RegExp(ID));
  assert.match(reply!.text, /https:\/\/site.example\//);
  const result = validateCreatePostInput(submitted);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value.origin, 'telegram');
    assert.equal(result.value.title, 'Unrelated human-approved headline');
    assert.equal(result.value.url, 'https://news.example/story#section');
    assert.equal(result.value.canonical_url, 'https://news.example/story');
    assert.equal(
      result.value.preview?.image_url,
      'https://news.example/preview.jpg',
    );
  }
});
test('one owner event publishes independent URLs once and reports each receipt', async (t) => {
  let posts = 0;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST') posts++;
    return backend()(url, init);
  });
  const incoming = update('https://example.com/one https://example.org/two');
  const metadata: Http = async () =>
    new Response('', { headers: { 'content-type': 'text/html' } });
  const first = await handleUpdate(
    incoming,
    new Set(['123']),
    publisher,
    metadata,
  );
  assert.equal((first!.text.match(/PUBLISHED/g) ?? []).length, 2);
  assert.equal(posts, 2);
  const replay = await handleUpdate(
    incoming,
    new Set(['123']),
    publisher,
    metadata,
  );
  assert.equal((replay!.text.match(/PUBLISHED/g) ?? []).length, 2);
  assert.equal(posts, 2);
});
test('unauthorized, group, bot, malformed and edited updates cause no network operations', async (t) => {
  const fail: Http = async () => {
    assert.fail('No network permitted.');
  };
  const publisher = await fixture(t, fail);
  const group = update('https://example.com');
  group.message.chat.type = 'group';
  const bot = update('https://example.com');
  bot.message.from.is_bot = true;
  for (const value of [
    update('https://example.com', 456),
    update(`/delete ${ID}`, 456),
    group,
    bot,
    null,
    {},
    { edited_message: update('https://example.com').message },
  ]) {
    assert.equal(
      await handleUpdate(value, new Set(['123']), publisher, fail),
      null,
    );
  }
});
test('empty authorization list fails closed', async (t) => {
  const publisher = await fixture(t, async () => {
    assert.fail('No API call.');
  });
  assert.equal(
    await handleUpdate(
      update('https://example.com'),
      new Set(),
      publisher,
      metadataHttp,
    ),
    null,
  );
});
test('deletion command calls authenticated DELETE immediately with no confirmation', async (t) => {
  const publisher = await fixture(t, async (url, init) => {
    assert.equal(url, `https://site.example/api/posts/${ID}`);
    assert.equal(init?.method, 'DELETE');
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer mock-token',
    );
    assert.equal(init?.body, undefined);
    return backend()(url, init);
  });
  assert.equal(
    (await handleUpdate(update(`/delete ${ID}`), new Set(['123']), publisher))!
      .text,
    `DELETED\nPublication ID: ${ID}`,
  );
});
test('invalid URLs and invalid deletion commands return FAILED without publication', async (t) => {
  const publisher = await fixture(t, async () => {
    assert.fail('No API call.');
  });
  for (const text of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:password@example.com',
    '/delete nope',
    `/delete ${ID} extra`,
    'A text bulletin without a public URL',
  ]) {
    assert.match(
      (await handleUpdate(
        update(text),
        new Set(['123']),
        publisher,
        metadataHttp,
      ))!.text,
      /^FAILED/,
    );
  }
});
test('duplicates including tombstones return ALREADY EXISTS and remain processed', async (t) => {
  const publisher = await fixture(t, async (_url, init) =>
    json({
      ok: true,
      data: {
        outcome: 'duplicate',
        matched_by: 'canonical_url',
        post: {
          ...post(JSON.parse(String(init?.body)) as CreatePostInput),
          deleted_at: now.toISOString(),
        },
      },
    }),
  );
  const reply = await handleUpdate(
    update('https://news.example/story'),
    new Set(['123']),
    publisher,
    metadataHttp,
  );
  assert.match(reply!.text, /^ALREADY EXISTS/);
  assert.match(reply!.text, /remains deleted/);
  assert.equal((await publisher.processed()).length, 1);
  assert.equal(
    (await readdir(publisher.state.dir)).some((n) => n.startsWith('outgoing-')),
    false,
  );
});
test('news metadata handles attribute order, entities, title and missing preview', () => {
  assert.deepEqual(
    extractMetadata(
      '<title>Fallback</title><meta content="AI &amp; robots" property="og:title"><meta content="/image.png" name="twitter:image">',
      'https://news.example/story',
    ),
    { title: 'AI & robots', image: 'https://news.example/image.png' },
  );
  assert.equal(
    extractMetadata('<title>Plain &#35;1</title>', 'https://news.example')
      .title,
    'Plain #1',
  );
  assert.deepEqual(extractMetadata('', 'https://news.example'), {
    title: 'news.example',
    image: null,
  });
});
test('recognized embeds and unsupported paths degrade to contract-valid links', () => {
  for (const url of [
    'https://youtu.be/abcdefghijk',
    'https://www.reddit.com/r/test/comments/abc123/title/',
    'https://www.tiktok.com/@user/video/6718335390845095173',
    'https://www.instagram.com/reel/abc_DEF/',
  ])
    assert.equal(providerEmbed(url).kind, 'provider');
  for (const url of [
    'https://www.instagram.com/user/',
    'https://vm.tiktok.com/short/',
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://example.com/public-video',
  ]) {
    const value = linkPayload(url, 'A public page', 'Example', 'telegram');
    assert.equal(value.embed?.kind, 'link');
    assert.equal(validateCreatePostInput(value).valid, true);
  }
});
test('manual URLs publish with neutral fallback when metadata is unavailable', async () => {
  const result = await prepareUrl(
    'https://example.com/public-video',
    async () => new Response('', { headers: { 'Content-Type': 'text/html' } }),
  );
  assert.equal(result.embed?.kind, 'link');
  assert.equal(result.title, 'example.com');
  const fallback = await prepareUrl(
    'https://example.com/private',
    async () => new Response('', { status: 403 }),
  );
  assert.equal(fallback.title, 'example.com');
  assert.equal(fallback.url, 'https://example.com/private');
});
test('normalization preserves query ordering, path case and trailing slash', () => {
  assert.equal(
    normalizeUrl('HTTPS://Example.COM:443/Case/?b=2&a=1#fragment'),
    'https://example.com/Case/?b=2&a=1',
  );
});
test('SSRF defenses reject loopback, private, mapped, reserved and credential URLs', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.2',
    '192.168.1.1',
    '100.64.0.1',
    '198.18.0.1',
    '192.0.2.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '3fff::1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(publicHttp('http://127.0.0.1/'));
  await assert.rejects(publicHttp('http://[::1]/'));
  await assert.rejects(publicHttp('https://user:secret@example.com'));
});
test('API origin enforces HTTPS and credentials are never sent on public reads', async () => {
  assert.throws(() => new Api('http://example.com', 'token'));
  assert.throws(() => new Api('https://user:pass@example.com', 'token'));
  assert.throws(() => new Api('https://example.com', ''));
  await new Api('http://127.0.0.1:8787', 'token', async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.equal(init?.redirect, 'error');
    return json({ ok: true, data: { posts: [], next_cursor: null } });
  }).posts();
});
test('API sends a Cloudflare Access service token only when configured', async () => {
  await new Api(
    'https://site.example',
    'token',
    async (_url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('cf-access-client-id'), 'service-id');
      assert.equal(headers.get('cf-access-client-secret'), 'service-secret');
      assert.equal(headers.get('authorization'), 'Bearer token');
      return json({
        ok: true,
        data: { outcome: 'created', post: post(payload()) },
      });
    },
    noSleep,
    { clientId: 'service-id', clientSecret: 'service-secret' },
  ).publish(payload());
});
test('temporary network errors and 429/500/503 have bounded retries and Retry-After', async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await retryRequest(
    async () => {
      calls++;
      if (calls === 1) throw new Error('network');
      if (calls === 2)
        return new Response('', {
          status: 429,
          headers: { 'retry-after': '2' },
        });
      return json({});
    },
    'https://example.com',
    {},
    async (ms) => {
      waits.push(ms);
    },
  );
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.equal(waits[1], 2000);
  for (const status of [500, 503]) {
    let count = 0;
    await assert.rejects(
      retryRequest(
        async () => {
          count++;
          return new Response('', { status });
        },
        'https://example.com',
        {},
        noSleep,
      ),
      RequestFailure,
    );
    assert.equal(count, 3);
  }
});
test('permanent errors and 501 are never retried; long Retry-After is deferred', async () => {
  for (const status of [400, 401, 403, 501, 429]) {
    let calls = 0;
    await assert.rejects(
      retryRequest(
        async () => {
          calls++;
          return new Response('', {
            status,
            headers: { 'retry-after': '120' },
          });
        },
        'https://example.com',
        {},
        noSleep,
      ),
      RequestFailure,
    );
    assert.equal(calls, 1);
  }
});
test('outbox preserves uncertain writes, replays identical payloads and restricts file permissions', async (t) => {
  let ready = false;
  const bodies: string[] = [];
  const publisher = await fixture(t, async (url, init) => {
    bodies.push(String(init?.body));
    if (!ready) throw new Error('offline');
    return backend()(url, init);
  });
  await assert.rejects(publisher.submit(payload()));
  const name = (await readdir(publisher.state.dir)).find(
    (n) => n.startsWith('outgoing-') && n.endsWith('.json'),
  )!;
  assert.equal(
    (await stat(join(publisher.state.dir, name))).mode & 0o777,
    0o600,
  );
  ready = true;
  assert.deepEqual(await publisher.replay(), { sent: 1, failed: 0 });
  assert.equal(new Set(bodies).size, 1);
  assert.equal((await publisher.processed()).length, 1);
});
test('permanent publication errors leave no retry payload', async (t) => {
  const publisher = await fixture(
    t,
    async () => new Response('', { status: 501 }),
  );
  await assert.rejects(publisher.submit(payload()));
  assert.equal(
    (await readdir(publisher.state.dir)).filter((name) =>
      name.startsWith('outgoing-'),
    ).length,
    0,
  );
});
test('API validates envelopes, paginates opaque cursors and excludes deleted posts', async () => {
  let calls = 0;
  const api = new Api('https://site.example', 'mock', async (url) => {
    calls++;
    if (calls === 1)
      return json({
        ok: true,
        data: { posts: [post()], next_cursor: 'opaque_cursor' },
      });
    assert.match(url, /cursor=opaque_cursor/);
    return json({
      ok: true,
      data: {
        posts: [{ ...post(), id: OTHER_ID, deleted_at: now.toISOString() }],
        next_cursor: null,
      },
    });
  });
  assert.equal((await api.posts()).length, 1);
  assert.equal(calls, 2);
  await assert.rejects(
    new Api('https://site.example', 'mock', async () =>
      json({ ok: true, data: {} }),
    ).posts(),
  );
  await assert.rejects(
    new Api(
      'https://site.example',
      'mock',
      async () => new Response('not JSON'),
    ).publish(payload()),
  );
});
test('repeated pagination cursors fail instead of returning partial content', async () => {
  const api = new Api('https://site.example', 'mock', async () =>
    json({ ok: true, data: { posts: [], next_cursor: 'same' } }),
  );
  await assert.rejects(api.posts(), /Repeated cursor/);
});
test('RSS/Atom extraction preserves original URLs, titles and dates; rejects unsafe XML', () => {
  const results = parseFeed(rss('Robots &amp; humans'), source, now);
  assert.equal(results[0]?.payload.title, 'Robots & humans');
  assert.equal(results[0]?.summary, 'Real source summary.');
  const atom =
    '<feed><entry><title>Agent</title><link rel="alternate" href="https://example.com/agent"/><id>atom-1</id><updated>2026-10-12T00:00:00Z</updated></entry></feed>';
  assert.equal(
    parseFeed(atom, source, now)[0]?.payload.url,
    'https://example.com/agent',
  );
  assert.equal(
    parseFeed(rss().replace('12 Oct 2026', '01 Oct 2026'), source, now).length,
    0,
  );
  assert.throws(() => parseFeed('<!DOCTYPE rss><rss/>', source, now));
});
test('broken and disabled sources do not prevent healthy feed collection', async () => {
  const result = await collect(
    [
      { ...source, name: 'Broken', url: 'https://bad.example' },
      { ...source, name: 'Disabled', enabled: false },
      source,
    ],
    now,
    async (url) => {
      if (url === 'https://bad.example')
        return new Response('', { status: 404 });
      return new Response(rss());
    },
  );
  assert.deepEqual(result.failed, ['Broken']);
  assert.equal(result.candidates.length, 1);
});
test('HN and USGS use public JSON API metadata', async () => {
  const hn = await collectSource({ ...source, format: 'hn' }, now, async () =>
    json({
      hits: [
        {
          title: 'Autonomous agent',
          url: 'https://example.com/agent',
          created_at: now.toISOString(),
          objectID: '123',
        },
      ],
    }),
  );
  assert.equal(hn[0]?.payload.source_item_id, '123');
  const usgs = await collectSource(
    { ...source, format: 'usgs' },
    now,
    async () =>
      json({
        features: [
          {
            id: 'eq123',
            properties: {
              title: 'M 8 earthquake',
              url: 'https://earthquake.usgs.gov/earthquakes/eventpage/eq123',
              time: now.getTime(),
              mag: 8,
            },
          },
        ],
      }),
  );
  assert.match(usgs[0]!.summary, /magnitude 8/);
});
test('zero-selection discovery is valid and makes no publication request', async (t) => {
  const publisher = await fixture(t, async (_url, init) => {
    assert.equal(init?.method, 'GET');
    return json({ ok: true, data: { posts: [], next_cursor: null } });
  });
  const result = await runDiscovery(
    publisher,
    { run: async () => ({ selected: [] }) },
    [source],
    now,
    async () => new Response(rss()),
  );
  assert.equal(result.published, 0);
  assert.equal(result.candidates, 1);
});
test('all-source failure and known duplicates skip the AI and publish nothing', async (t) => {
  const publisher = await fixture(t, backend([post()]));
  const ai = {
    run: async () => {
      assert.fail('AI must not be called.');
    },
  };
  assert.equal(
    (
      await runDiscovery(
        publisher,
        ai,
        [source],
        now,
        async () => new Response(rss()),
      )
    ).candidates,
    0,
  );
  assert.deepEqual(
    (
      await runDiscovery(
        publisher,
        ai,
        [source],
        now,
        async () => new Response('', { status: 403 }),
      )
    ).failed,
    ['Test News'],
  );
});
test('AI selection boundary translates headlines but cannot replace source URLs or select unknown candidates', async (t) => {
  let submitted: CreatePostInput | undefined;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST')
      submitted = JSON.parse(String(init.body)) as CreatePostInput;
    return backend()(url, init);
  });
  const result = await runDiscovery(
    publisher,
    {
      run: async (_task, data) => {
        const candidates = (data as { candidates: { key: string }[] })
          .candidates;
        return {
          selected: [
            {
              key: candidates[0]!.key,
              english_title: 'Robots replace a department',
            },
          ],
        };
      },
    },
    [source],
    now,
    async () => new Response(rss('机器人取代部门')),
  );
  assert.equal(result.published, 1);
  assert.equal(submitted?.url, 'https://news.example/story');
  assert.equal(submitted?.origin, 'auto');
  const other = await fixture(t, backend());
  await assert.rejects(
    runDiscovery(
      other,
      {
        run: async () => ({
          selected: [{ key: 'invented', english_title: 'Invented event' }],
        }),
      },
      [source],
      now,
      async () => new Response(rss()),
    ),
    /Invalid AI candidate/,
  );
});
test('monthly generation uses only visible previous-month posts, exact citations and stable ID', async (t) => {
  let submitted: CreatePostInput | undefined;
  let aiCalls = 0;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST')
      submitted = JSON.parse(String(init.body)) as CreatePostInput;
    return backend([
      post(),
      { ...post(), id: OTHER_ID, deleted_at: now.toISOString() },
      post(payload(), now.toISOString()),
    ])(url, init);
  });
  const ai = {
    run: async (_task: 'discovery' | 'changelog', data: unknown) => {
      aiCalls++;
      assert.deepEqual(
        (data as { posts: { id: string }[] }).posts.map((p) => p.id),
        [ID],
      );
      return {
        body: `[ADDED] [post:${ID}] ${'Supported satire words '.repeat(80)}`,
        publication_ids: [ID],
      };
    },
  };
  await runChangelog(publisher, ai, '2026-09');
  assert.equal(submitted?.source_item_id, 'humanity-changelog:2026-09');
  assert.equal(submitted?.url, null);
  assert.equal(
    submitted?.references[0]?.url,
    `https://site.example/?post=${ID}`,
  );
  assert.match(submitted!.references[0]!.title!, new RegExp(ID));
  assert.deepEqual(await runChangelog(publisher, ai, '2026-09'), {
    outcome: 'already_exists',
  });
  assert.equal(aiCalls, 1);
});
test('monthly empty feed skips generation and an existing monthly post skips duplicate generation', async (t) => {
  const ai = {
    run: async () => {
      assert.fail('No AI required.');
    },
  };
  assert.deepEqual(
    await runChangelog(await fixture(t, backend()), ai, '2026-09'),
    { outcome: 'empty_month' },
  );
  const monthly: CreatePostInput = {
    ...payload(),
    type: 'changelog',
    url: null,
    canonical_url: null,
    source: 'We Are All Gonna Die',
    source_item_id: 'humanity-changelog:2026-09',
    body: 'Previously generated.',
  };
  assert.deepEqual(
    await runChangelog(
      await fixture(t, backend([post(monthly, now.toISOString())])),
      ai,
      '2026-09',
    ),
    { outcome: 'already_exists' },
  );
});
test('monthly rejects unknown, mismatched and missing citations or wrong word count', async (t) => {
  for (const output of [
    { body: '[ADDED] Too short.', publication_ids: [ID] },
    {
      body: `Unsupported ${'satire '.repeat(160)}`,
      publication_ids: [OTHER_ID],
    },
    {
      body: `Missing citations ${'satire '.repeat(160)}`,
      publication_ids: [ID],
    },
  ]) {
    const publisher = await fixture(t, backend([post()]));
    await assert.rejects(
      runChangelog(publisher, { run: async () => output }, '2026-09'),
    );
    assert.equal((await publisher.processed()).length, 0);
  }
});
test('monthly retries preserve the draft and recheck deleted references; generic replay skips monthly', async (t) => {
  let deleted = false;
  let ready = false;
  let aiCalls = 0;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST' && !ready) throw new Error('offline');
    return backend(deleted ? [] : [post()])(url, init);
  });
  const ai = {
    run: async () => {
      aiCalls++;
      return {
        body: `[ADDED] [post:${ID}] ${'Supported satire '.repeat(80)}`,
        publication_ids: [ID],
      };
    },
  };
  await assert.rejects(runChangelog(publisher, ai, '2026-09'));
  assert.deepEqual(await publisher.replay(), { sent: 0, failed: 0 });
  ready = true;
  await runChangelog(publisher, ai, '2026-09');
  assert.equal(aiCalls, 1);
  const another = await fixture(t, async (url, init) => {
    if (init?.method === 'POST') throw new Error('offline');
    return backend(deleted ? [] : [post()])(url, init);
  });
  await assert.rejects(runChangelog(another, ai, '2026-09'));
  deleted = true;
  assert.deepEqual(await runChangelog(another, ai, '2026-09'), {
    outcome: 'empty_month',
  });
});
test('previous-month calculation handles timezone boundaries and year rollover', () => {
  assert.equal(previousMonth(new Date('2026-12-31T18:00:00Z')), '2026-12');
  assert.equal(previousMonth(new Date('2026-10-31T18:00:00Z')), '2026-10');
});
test('OpenClaw envelopes support gateway and local shapes, reject errors and malformed output', () => {
  assert.deepEqual(
    parseAgentOutput(JSON.stringify({ ok: true, final: '{"selected":[]}' })),
    { selected: [] },
  );
  assert.deepEqual(
    parseAgentOutput(
      JSON.stringify({
        status: 'ok',
        result: { payloads: [{ text: '```json\n{"selected":[]}\n```' }] },
      }),
    ),
    { selected: [] },
  );
  assert.throws(() => parseAgentOutput('{"ok":false}'));
  assert.throws(() => parseAgentOutput('{"payloads":[{"text":"not json"}]}'));
});
test('existing OpenClaw CLI receives one dedicated agent run and a private input file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-ai-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'fake-openclaw');
  await writeFile(
    executable,
    `#!${process.execPath}\nimport {readFileSync, statSync} from 'node:fs';\nconst args = process.argv.slice(2);\nif(args[0] !== 'agent' || args[args.indexOf('--agent')+1] !== 'waagd-test') process.exit(2);\nconst file = args[args.indexOf('--message-file')+1];\nif((statSync(file).mode & 511) !== 384 || !readFileSync(file,'utf8').includes('UNTRUSTED INPUT DATA')) process.exit(3);\nconsole.log(JSON.stringify({ok:true,final:'{"selected":[]}'}));\n`,
    { mode: 0o700 },
  );
  assert.deepEqual(
    await new OpenClawAI(executable, 'waagd-test').run('discovery', {
      candidates: [],
    }),
    { selected: [] },
  );
});
test('Telegram transport uses Bot API JSON and rejects false success envelopes', async () => {
  assert.deepEqual(
    await telegramCall(
      async (url, init) => {
        assert.equal(url, 'https://api.telegram.org/botmock-token/getUpdates');
        assert.equal(init?.method, 'POST');
        return json({ ok: true, result: [] });
      },
      'mock-token',
      'getUpdates',
      {},
    ),
    [],
  );
  await assert.rejects(
    telegramCall(
      async () => json({ ok: false }),
      'mock-token',
      'sendMessage',
      {},
    ),
  );
});
test('Telegram polling checkpoints ignored unauthorized updates and handles shutdown without a real bot', async (t) => {
  const publisher = await fixture(t, async () => {
    assert.fail('No API writes.');
  });
  const controller = new AbortController();
  let calls = 0;
  await pollTelegram(
    publisher,
    new Set(['123']),
    'mock-token',
    controller.signal,
    async (_url, init) => {
      calls++;
      const data = JSON.parse(String(init?.body)) as { offset: number };
      if (calls === 1) {
        assert.equal(data.offset, 0);
        return json({ ok: true, result: [update('https://example.com', 456)] });
      }
      assert.equal(data.offset, 2);
      controller.abort();
      return json({ ok: true, result: [] });
    },
  );
  assert.deepEqual(await publisher.state.read('telegram-offset.json'), {
    offset: 2,
  });
});
test('configuration validates numeric IDs, origin inputs and absolute state path', () => {
  const env = {
    WAAGD_API_ORIGIN: 'https://site.example',
    WAAGD_API_WRITE_TOKEN: 'mock',
    WAAGD_STATE_DIR: '/tmp/private-state',
    WAAGD_TELEGRAM_ALLOWED_IDS: '123,456',
  };
  assert.equal(configuration(env).allowedIds.size, 2);
  assert.throws(() =>
    configuration({ ...env, WAAGD_TELEGRAM_ALLOWED_IDS: '@username' }),
  );
  assert.throws(() => configuration({ ...env, WAAGD_STATE_DIR: './local' }));
  assert.throws(() =>
    configuration({ ...env, WAAGD_CF_ACCESS_CLIENT_ID: 'service-id' }),
  );
  assert.deepEqual(
    configuration({
      ...env,
      WAAGD_CF_ACCESS_CLIENT_ID: 'service-id',
      WAAGD_CF_ACCESS_CLIENT_SECRET: 'service-secret',
    }).access,
    { clientId: 'service-id', clientSecret: 'service-secret' },
  );
});

test('outgoing retries respect persisted Retry-After and stop after ten cycles', async (t) => {
  let calls = 0;
  const publisher = await fixture(t, async () => {
    calls++;
    return new Response('', { status: 429, headers: { 'retry-after': '120' } });
  });
  await assert.rejects(publisher.submit(payload()));
  assert.equal(calls, 1);
  assert.deepEqual(await publisher.replay(), { sent: 0, failed: 0 });
  await assert.rejects(publisher.submit(payload()), RequestFailure);
  assert.equal(calls, 1);
  await publisher.state.write(`outgoing-${payloadKey(payload())}.json`, {
    payload: payload(),
    attempts: 10,
  });
  assert.deepEqual(await publisher.replay(), { sent: 0, failed: 0 });
  await assert.rejects(publisher.submit(payload()), /retry limit/);
  assert.equal(calls, 1);
});

test('daily cap persists across reruns and every selected candidate is validated before writes', async (t) => {
  let writes = 0;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST') writes++;
    return backend()(url, init);
  });
  let maximum = 0;
  const ai = {
    run: async (_task: 'discovery' | 'changelog', data: unknown) => {
      const input = data as {
        maximum: number;
        candidates: { key: string; payload: CreatePostInput }[];
      };
      maximum = input.maximum;
      return {
        selected: input.candidates
          .slice(0, input.maximum)
          .map((c) => ({ key: c.key, english_title: c.payload.title })),
      };
    },
  };
  const feed = `<rss><channel>${Array.from({ length: 8 }, (_v, i) => `<item><title>AI event ${i}</title><link>https://news.example/${i}</link><guid>event-${i}</guid><pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;
  await publisher.state.write('discovery-2026-10-12.json', { selected: 3 });
  assert.equal(
    (
      await runDiscovery(
        publisher,
        ai,
        [source],
        now,
        async () => new Response(feed),
      )
    ).published,
    2,
  );
  assert.equal(maximum, 2);
  assert.equal(
    (
      await runDiscovery(
        publisher,
        ai,
        [source],
        now,
        async () => new Response(feed),
      )
    ).published,
    0,
  );
  assert.equal(writes, 2);
  const bad = await fixture(t, async (url, init) => {
    assert.notEqual(init?.method, 'POST');
    return backend()(url, init);
  });
  await assert.rejects(
    runDiscovery(
      bad,
      {
        run: async (_task, data) => {
          const input = data as { candidates: { key: string }[] };
          return {
            selected: [
              {
                key: input.candidates[0]!.key,
                english_title: 'Faithful headline',
              },
              { key: 'unknown', english_title: 'Fabricated' },
            ],
          };
        },
      },
      [source],
      now,
      async () => new Response(feed),
    ),
  );
});

test('discovery continues after a failed outgoing publication', async (t) => {
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST' && String(init.body).includes('story'))
      return new Response('', { status: 503 });
    return backend()(url, init);
  });
  const feed = rss().replace(
    '</channel>',
    '<item><title>Robots operate independently</title><link>https://news.example/other</link><guid>other</guid><pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate></item></channel>',
  );
  const result = await runDiscovery(
    publisher,
    {
      run: async (_task, data) => ({
        selected: (data as { candidates: { key: string }[] }).candidates.map(
          (c) => ({
            key: c.key,
            english_title: 'Robots operate independently',
          }),
        ),
      }),
    },
    [source],
    now,
    async () => new Response(feed),
  );
  assert.equal(result.published, 1);
  assert.deepEqual(result.failed, ['publication:Test News']);
  assert.equal(
    (await readdir(publisher.state.dir)).filter((n) =>
      /^outgoing-.*\.json$/.test(n),
    ).length,
    1,
  );
});

test('monthly invalidates a retry draft if one referenced post was deleted', async (t) => {
  let deleted = false;
  const posts = [post(), { ...post(), id: OTHER_ID }];
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST') throw new Error('offline');
    return backend(deleted ? [posts[1]!] : posts)(url, init);
  });
  const ai = {
    run: async () => ({
      body: `[ADDED] [post:${ID}] ${'Supported satire '.repeat(80)}`,
      publication_ids: [ID],
    }),
  };
  await assert.rejects(runChangelog(publisher, ai, '2026-09'));
  deleted = true;
  await assert.rejects(
    runChangelog(publisher, ai, '2026-09'),
    /references changed/,
  );
  assert.equal(await publisher.state.read('changelog-2026-09.json'), null);
});

test('request cancellation stops retries immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    retryRequest(
      async () => {
        calls++;
        controller.abort();
        throw new Error('aborted');
      },
      'https://example.com',
      { signal: controller.signal },
      noSleep,
    ),
  );
  assert.equal(calls, 1);
});

test('manual metadata fallback never permits a private target, including unsafe redirects', async (t) => {
  const publisher = await fixture(t, async () => {
    assert.fail('No publication for unsafe target.');
  });
  for (const url of [
    'http://127.1/',
    'http://2130706433/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:127.0.0.1]/',
    'http://localhost./',
    'http://box.local/',
    'http://10.0.0.1/',
  ]) {
    let fetched = false;
    const reply = await handleUpdate(
      update(url),
      new Set(['123']),
      publisher,
      async () => {
        fetched = true;
        return new Response('');
      },
    );
    assert.match(reply!.text, /^FAILED/);
    assert.equal(fetched, false, url);
  }
  await assert.rejects(
    prepareUrl('https://example.com/redirect', async () => {
      throw new UnsafeUrlError();
    }),
    UnsafeUrlError,
  );
  const fallback = await prepareUrl(
    'https://youtu.be/abcdefghijk',
    async () => new Response('', { status: 403 }),
  );
  assert.equal(fallback.title, 'youtu.be');
  assert.equal(fallback.type, 'video');
  assert.equal(fallback.url, 'https://youtu.be/abcdefghijk');
});

test('monthly input includes more than 100 publications and respects timezone calendar boundaries', async (t) => {
  assert.equal(
    monthStart('2026-09', 'Asia/Bangkok').toISOString(),
    '2026-08-31T17:00:00.000Z',
  );
  assert.equal(
    monthStart('2026-03', 'America/New_York').toISOString(),
    '2026-03-01T05:00:00.000Z',
  );
  const rows = Array.from({ length: 155 }, (_, i) => ({
    ...post(),
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  }));
  const boundary = {
    ...post(),
    id: OTHER_ID,
    published_at: '2026-08-31T17:00:00.000Z',
  };
  const excluded = {
    ...post(),
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    published_at: '2026-09-30T17:00:00.000Z',
  };
  rows.push(boundary, excluded);
  rows.sort(
    (a, b) =>
      b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id),
  );
  let pageCalls = 0;
  const publisher = await fixture(t, async (url, init) => {
    if (init?.method === 'POST') return backend()(url, init);
    pageCalls++;
    const cursor = new URL(url).searchParams.get('cursor');
    return json({
      ok: true,
      data: {
        posts: cursor ? rows.slice(100) : rows.slice(0, 100),
        next_cursor: cursor ? null : 'page-two',
      },
    });
  });
  await runChangelog(
    publisher,
    {
      run: async (_task, data) => {
        const input = data as { posts: { id: string }[]; timezone: string };
        assert.equal(input.posts.length, 156);
        assert.equal(input.timezone, 'Asia/Bangkok');
        assert.ok(input.posts.some((p) => p.id === OTHER_ID));
        assert.ok(!input.posts.some((p) => p.id === excluded.id));
        return {
          body: `[ADDED] [post:${OTHER_ID}] ${'Supported satire '.repeat(80)}`,
          publication_ids: [OTHER_ID],
        };
      },
    },
    '2026-09',
  );
  assert.equal(pageCalls, 2);
});
