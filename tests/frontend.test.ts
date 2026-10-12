import assert from 'node:assert/strict';
import test from 'node:test';
import type { Embed, ListPostsResponse, Post } from '../shared/contracts.ts';
import {
  FeedError,
  FeedSession,
  fetchPage,
  parsePage,
} from '../src/lib/feed.ts';
import {
  changelogBlocks,
  playerFor,
  relativeDate,
  safeUrl,
} from '../src/lib/presentation.ts';

export function fixture(index = 1): Post & { type: 'news'; url: string } {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    published_at: `2026-10-12T${String(15 - index).padStart(2, '0')}:00:00.000Z`,
    deleted_at: null,
    type: 'news',
    origin: 'auto',
    url: 'https://example.com/article',
    canonical_url: null,
    source_item_id: null,
    title: 'Evidence',
    source: 'Example',
    preview: null,
    embed: null,
    body: null,
    references: [],
  };
}
function envelope(
  posts: Post[],
  next_cursor: string | null = null,
): ListPostsResponse {
  return { ok: true, data: { posts, next_cursor } };
}

test('wire parsing uses shared types, supports all four kinds and nullable metadata', () => {
  const posts: Post[] = [
    fixture(),
    { ...fixture(2), type: 'video' },
    { ...fixture(3), type: 'meme' },
    { ...fixture(4), type: 'changelog', url: null, body: '[ADDED]\n- Panic' },
  ];
  assert.deepEqual(parsePage(envelope(posts)).posts, posts);
  assert.equal(
    parsePage(envelope([{ ...fixture(), title: '' }])).posts[0]?.title,
    'Untitled transmission',
  );
  assert.equal(
    parsePage(
      envelope([{ ...fixture(), deleted_at: '2026-10-12T15:00:00.000Z' }]),
    ).posts.length,
    0,
  );
});
test('malformed response, invalid dates, unsafe URLs and raw embeds fail safely', () => {
  for (const input of [
    null,
    {},
    { ok: true, data: { posts: [], next_cursor: 1 } },
    envelope([{ ...fixture(), published_at: '2026-02-30T00:00:00.000Z' }]),
    envelope([{ ...fixture(), url: 'javascript:alert(1)' }]),
    envelope([
      {
        ...fixture(),
        embed: {
          kind: 'provider',
          provider: 'youtube',
          id: '123',
          url: 'https://evil.example',
          html: '<script>bad</script>',
        },
      } as unknown as Post,
    ]),
  ]) {
    assert.throws(() => parsePage(input), FeedError);
  }
});
test('pagination appends older content, deduplicates within/across pages and preserves chronology', async () => {
  const cursors: (string | null)[] = [];
  const session = new FeedSession(async (cursor) => {
    cursors.push(cursor);
    return cursor === null
      ? parsePage(envelope([fixture(2), fixture(1), fixture(1)], 'opaque/+?'))
      : parsePage(envelope([fixture(2), fixture(3)]));
  });
  await session.load();
  await session.load();
  await session.load();
  assert.deepEqual(cursors, [null, 'opaque/+?']);
  assert.deepEqual(
    session.posts.map((post) => post.id),
    [fixture(1).id, fixture(2).id, fixture(3).id],
  );
  assert.equal(session.status, 'end');
});
test('same-time publications use descending UUID order', async () => {
  const session = new FeedSession(async () => ({
    posts: [
      fixture(1),
      { ...fixture(2), published_at: fixture(1).published_at },
    ],
    next_cursor: null,
  }));
  await session.load();
  assert.equal(session.posts[0]?.id, fixture(2).id);
});
test('empty feed, empty intermediate page, in-flight lock and retry preserve cursor', async () => {
  const empty = new FeedSession(async () => ({ posts: [], next_cursor: null }));
  await empty.load();
  assert.equal(empty.status, 'empty');
  let calls = 0;
  const session = new FeedSession(async (cursor) => {
    calls++;
    await Promise.resolve();
    if (calls === 2) throw new FeedError('HTTP_503');
    return cursor === null
      ? { posts: [fixture()], next_cursor: 'next' }
      : { posts: [], next_cursor: null };
  });
  const pending = session.load();
  await session.load();
  await pending;
  assert.equal(calls, 1);
  await session.load();
  assert.equal(session.status, 'error');
  assert.equal(session.cursor, 'next');
  assert.equal(session.posts.length, 1);
  await session.load();
  assert.equal(session.status, 'end');
  const intermediate = new FeedSession(async () => ({
    posts: [],
    next_cursor: 'keep-going',
  }));
  await intermediate.load();
  assert.equal(intermediate.status, 'ready');
});
test('repeated/cyclic cursors stop automatic requests', async () => {
  let i = 0;
  const session = new FeedSession(async () => ({
    posts: [],
    next_cursor: ['a', 'b', 'a'][i++] ?? null,
  }));
  await session.load();
  await session.load();
  await session.load();
  assert.equal(session.status, 'error');
  assert.equal(session.errorCode, 'CURSOR_STALLED');
});
test('API uses anonymous same-origin GET with encoded opaque cursor and handles non-JSON errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), '/api/posts?limit=20&cursor=opaque%2F%2B%3F');
      assert.equal(init?.cache, 'no-store');
      assert.deepEqual(init?.headers, { Accept: 'application/json' });
      return Response.json(envelope([]));
    };
    await fetchPage('opaque/+?');
    globalThis.fetch = async () =>
      new Response('<html>Unavailable</html>', { status: 503 });
    await assert.rejects(fetchPage(null), FeedError);
    globalThis.fetch = async () =>
      Response.json(
        {
          ok: false,
          error: { code: 'NOT_IMPLEMENTED', message: '<script>bad</script>' },
        },
        { status: 501 },
      );
    await assert.rejects(
      fetchPage(null),
      (error: unknown) =>
        error instanceof FeedError && error.code === 'NOT_IMPLEMENTED',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('allowlisted players load without autoplay and reject mismatched provider IDs or hosts', () => {
  const embeds: Embed[] = [
    {
      kind: 'provider',
      provider: 'youtube',
      id: 'abcdefghijk',
      url: 'https://youtu.be/abcdefghijk',
    },
    {
      kind: 'provider',
      provider: 'tiktok',
      id: '7420000000000000001',
      url: 'https://www.tiktok.com/@test/video/7420000000000000001',
    },
    {
      kind: 'provider',
      provider: 'instagram',
      id: 'reel/Abc_def123',
      url: 'https://www.instagram.com/reel/Abc_def123/',
    },
  ];
  for (const embed of embeds) {
    const player = playerFor(embed);
    assert.ok(player);
    assert.equal(new URL(player.src).searchParams.get('autoplay'), '0');
  }
  for (const embed of [
    null,
    { kind: 'link', url: 'https://example.com', label: null },
    {
      ...embeds[0],
      url: 'https://youtube.com.evil.example/watch?v=abcdefghijk',
    },
    { ...embeds[0], id: 'otherid12345' },
    { ...embeds[1], url: 'https://vm.tiktok.com/short/' },
    { ...embeds[2], id: '../../evil' },
    {
      kind: 'provider',
      provider: 'reddit',
      id: 'abc',
      url: 'https://reddit.com/r/test/comments/abc',
    },
  ]) {
    assert.equal(playerFor(embed as Embed | null), null);
  }
});
test('changelog text stays inert, external links reject executable URLs, relative dates remain readable', () => {
  assert.deepEqual(
    changelogBlocks(
      '[ADDED]\n- New risks\n## FIXED\n<script>alert(1)</script>',
    ),
    [
      { kind: 'heading', text: 'ADDED' },
      { kind: 'item', text: 'New risks' },
      { kind: 'heading', text: 'FIXED' },
      { kind: 'paragraph', text: '<script>alert(1)</script>' },
    ],
  );
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,bad',
    '//evil.example',
    'https://user:pass@example.com',
  ])
    assert.equal(safeUrl(url), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com');
  assert.equal(
    relativeDate(
      fixture().published_at,
      Date.parse('2026-10-12T16:00:00.000Z'),
    ),
    '2h ago',
  );
});

test('permalink API consumes the real item envelope and handles missing or malformed publications', async (t) => {
  const { fetchPost, FeedError } = await import('../src/lib/feed.ts');
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const post = fixture(1);
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `/api/posts/${post.id}`);
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return Response.json({ ok: true, data: post });
  };
  assert.deepEqual(await fetchPost(post.id), post);
  globalThis.fetch = async () =>
    Response.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Missing' } },
      { status: 404 },
    );
  await assert.rejects(
    fetchPost(post.id),
    (error: unknown) =>
      error instanceof FeedError && error.code === 'NOT_FOUND',
  );
  await assert.rejects(
    fetchPost('invalid'),
    (error: unknown) =>
      error instanceof FeedError && error.code === 'VALIDATION_ERROR',
  );
  globalThis.fetch = async () =>
    Response.json({
      ok: true,
      data: {
        ...post,
        title: 'ok',
        embed: { kind: 'link', url: 'javascript:alert(1)', label: null },
      },
    });
  await assert.rejects(fetchPost(post.id), /unavailable/);
});
