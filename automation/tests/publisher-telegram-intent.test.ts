import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api } from '../core/api.ts';
import {
  validatePublicationIntent,
  withPublicationIntentContentHash,
} from '../core/intent.ts';
import type { PublicationIntent } from '../core/intent.ts';
import { Publisher, State, StateError } from '../core/state.ts';
import {
  handleOpenClawTelegramInbound,
  handleUpdate,
} from '../telegram/handler.ts';

const postId = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';

function intent(): PublicationIntent {
  return withPublicationIntentContentHash({
    version: 1,
    intent_id: 'discovery-12345678',
    origin: 'auto',
    authorization: { kind: 'discovery', approved: true },
    editorial: {
      decision_id: 'decision-123',
      source_event_id: 'event-123',
      source_attribution: 'Example reporting',
      approved_at: '2026-10-19T00:00:00.000Z',
      publication_policy: {
        version: 'discovery-policy-v1',
        outcome: 'approved',
      },
    },
    post: {
      type: 'news',
      url: 'https://example.com/story',
      canonical_url: 'https://example.com/story',
      source_item_id: 'source-1',
      title: 'A verified headline',
      source: 'Example',
      origin: 'auto',
      preview: null,
      embed: null,
      body: 'A complete editorial article.',
      references: [{ url: 'https://example.com/story', title: 'Example' }],
    },
  });
}

test('PublicationIntent requires authenticated Discovery ingress and retains a durable receipt', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-intent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const publisher = new Publisher(
    new Api('https://site.example', 'test-token', async (_url, init) => {
      calls++;
      const input = JSON.parse(String(init?.body));
      return Response.json({
        ok: true,
        data: {
          outcome: 'created',
          post: {
            ...input,
            id: postId,
            published_at: '2026-10-19T00:00:00.000Z',
            deleted_at: null,
          },
        },
      });
    }),
    new State(dir),
    { discoveryIngressToken: 'discovery-ingress-test-token' },
  );
  await assert.rejects(
    publisher.submitDiscoveryIntent(intent(), 'wrong-token'),
    /Untrusted Discovery ingress/,
  );
  await publisher.setPaused('auto', false);
  assert.equal(
    (
      await publisher.submitDiscoveryIntent(
        intent(),
        'discovery-ingress-test-token',
      )
    ).outcome,
    'created',
  );
  assert.equal(
    (
      await publisher.submitDiscoveryIntent(
        intent(),
        'discovery-ingress-test-token',
      )
    ).outcome,
    'created',
  );
  assert.equal(calls, 1);
  const receiptName = (await publisher.state.names()).find((name) =>
    name.startsWith('receipt-'),
  );
  assert.ok(receiptName);
  assert.ok(await publisher.state.read(receiptName!));

  const changed = withPublicationIntentContentHash({
    ...intent(),
    post: { ...intent().post, body: 'A different complete editorial article.' },
  });
  await assert.rejects(
    publisher.submitDiscoveryIntent(changed, 'discovery-ingress-test-token'),
    StateError,
  );
});

test('PublicationIntent v2 keeps trusted publisher provenance distinct from independent verification', () => {
  const trusted = withPublicationIntentContentHash({
    version: 2 as const,
    intent_id: 'auto-trusted-publisher-20261022',
    origin: 'auto' as const,
    authorization: { kind: 'discovery' as const, approved: true as const },
    editorial: {
      decision_id: 'decision-trusted-1',
      source_event_id: 'candidate:trusted-1;revision:1',
      source_attribution: 'The Guardian',
      approved_at: '2026-10-22T00:00:00.000Z',
      publication_policy: {
        version: 'trusted-policy-v1',
        outcome: 'approved' as const,
      },
      review_route: 'trusted_publisher' as const,
      trusted_publisher: {
        publisher_id: 'guardian',
        publisher_name: 'The Guardian',
        trusted_rss_url: 'https://www.theguardian.com/world/rss',
        article_url: 'https://www.theguardian.com/world/2026/oct/22/example',
        article_host: 'www.theguardian.com',
        verified_at: '2026-10-22T00:00:00.000Z',
        safety_gates: {
          publisher_identity: true,
          safe_retrieval: true,
          sensitive_content: 'clear' as const,
        },
      },
    },
    post: {
      ...intent().post,
      canonical_url: 'https://www.theguardian.com/world/2026/oct/22/example',
      url: 'https://www.theguardian.com/world/2026/oct/22/example',
    },
  });
  assert.equal(validatePublicationIntent(trusted).valid, true);
  const forged = structuredClone(trusted);
  (forged.editorial as { review_route: string }).review_route =
    'independently_verified';
  forged.content_hash = withPublicationIntentContentHash({
    ...forged,
    editorial: forged.editorial,
  }).content_hash;
  assert.equal(validatePublicationIntent(forged).valid, false);
});

test('automatic intents fail closed, reject article type, and replay only after resume', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-kill-switch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let online = false;
  let calls = 0;
  const publisher = new Publisher(
    new Api(
      'https://site.example',
      'test-token',
      async (_url, init) => {
        calls++;
        if (!online) return new Response('', { status: 503 });
        const input = JSON.parse(String(init?.body));
        return Response.json({
          ok: true,
          data: {
            outcome: 'created',
            post: {
              ...input,
              id: postId,
              published_at: '2026-10-19T00:00:00.000Z',
              deleted_at: null,
            },
          },
        });
      },
      async () => {},
    ),
    new State(dir),
    { discoveryIngressToken: 'discovery-ingress-test-token' },
  );
  assert.equal(await publisher.isPaused('auto'), true);
  await assert.rejects(
    publisher.submitDiscoveryIntent(intent(), 'discovery-ingress-test-token'),
    /paused/,
  );
  assert.equal(calls, 0);

  const article = withPublicationIntentContentHash({
    ...intent(),
    post: { ...intent().post, type: 'article' as never },
  });
  assert.equal(validatePublicationIntent(article).valid, false);

  await publisher.setPaused('auto', false);
  await assert.rejects(
    publisher.submitDiscoveryIntent(intent(), 'discovery-ingress-test-token'),
  );
  assert.equal(calls, 3);
  await publisher.setPaused('auto', true);
  assert.deepEqual(await publisher.replay(), { sent: 0, failed: 0 });
  assert.equal(calls, 3);

  online = true;
  await publisher.setPaused('auto', false);
  assert.deepEqual(await publisher.replay(), { sent: 1, failed: 0 });
  assert.equal(calls, 4);
  const receiptName = (await publisher.state.names()).find((name) =>
    name.startsWith('receipt-'),
  );
  assert.match(
    JSON.stringify(await publisher.state.read(receiptName!)),
    /"status":"published"/,
  );
});

test('Telegram owner URLs remain available while auto is paused and redelivery is idempotent', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-telegram-intent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const submissions: unknown[] = [];
  const publisher = new Publisher(
    new Api('https://site.example', 'test-token', async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      submissions.push(input);
      return Response.json({
        ok: true,
        data: {
          outcome: 'created',
          post: {
            ...input,
            id: postId,
            published_at: '2026-10-19T00:00:00.000Z',
            deleted_at: null,
          },
        },
      });
    }),
    new State(dir),
  );
  const update = (updateId: number, text: string) => ({
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: 'private' },
      text,
    },
  });
  assert.match(
    (await handleUpdate(update(1, '/pause auto'), new Set(['123']), publisher))!
      .text,
    /Telegram owner submissions remain available/,
  );
  assert.match(
    (await handleUpdate(
      update(2, 'https://example.com/owner-link'),
      new Set(['123']),
      publisher,
      async () =>
        new Response('', { headers: { 'content-type': 'text/html' } }),
    ))!.text,
    /^PUBLISHED/,
  );
  assert.deepEqual(submissions[0], {
    type: 'news',
    url: 'https://example.com/owner-link',
    canonical_url: 'https://example.com/owner-link',
    source_item_id: (submissions[0] as { source_item_id: string })
      .source_item_id,
    title: 'example.com',
    source: 'example.com',
    origin: 'telegram',
    preview: null,
    embed: {
      kind: 'link',
      url: 'https://example.com/owner-link',
      label: 'Open original',
    },
    body: null,
    references: [],
  });
  assert.match(
    (await handleUpdate(
      update(2, 'https://example.com/owner-link'),
      new Set(['123']),
      publisher,
      async () =>
        new Response('', { headers: { 'content-type': 'text/html' } }),
    ))!.text,
    /^PUBLISHED/,
  );
  assert.equal(submissions.length, 1);
  assert.match(
    (await handleUpdate(
      update(3, 'a plain text message'),
      new Set(['123']),
      publisher,
      async () =>
        new Response('', { headers: { 'content-type': 'text/html' } }),
    ))!.text,
    /^FAILED: Send one or more public URLs/,
  );
});

test('OpenClaw ingress projection accepts only direct numeric Telegram owner events', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-openclaw-inbound-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const publisher = new Publisher(
    new Api('https://site.example', 'test-token', async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      return Response.json({
        ok: true,
        data: {
          outcome: 'created',
          post: {
            ...input,
            id: postId,
            published_at: '2026-10-19T00:00:00.000Z',
            deleted_at: null,
          },
        },
      });
    }),
    new State(dir),
  );
  assert.equal(
    await handleOpenClawTelegramInbound(
      {
        channel: 'telegram',
        direct: false,
        senderId: 123,
        messageId: 1,
        providerUpdate: 1,
        content: 'not direct',
      },
      new Set(['123']),
      publisher,
    ),
    null,
  );
  assert.match(
    (await handleOpenClawTelegramInbound(
      {
        channel: 'telegram',
        direct: true,
        senderId: '123',
        messageId: '2',
        providerUpdate: '2',
        content: 'https://example.com/through-openclaw',
      },
      new Set(['123']),
      publisher,
      async () =>
        new Response('', { headers: { 'content-type': 'text/html' } }),
    ))!.text,
    /^PUBLISHED/,
  );
  let posts = 0;
  const mediaDir = await mkdtemp(join(tmpdir(), 'waagd-openclaw-media-'));
  t.after(() => rm(mediaDir, { recursive: true, force: true }));
  const mediaPublisher = new Publisher(
    new Api('https://site.example', 'test-token', async () => {
      posts++;
      return new Response('', { status: 500 });
    }),
    new State(mediaDir),
  );
  assert.match(
    (await handleOpenClawTelegramInbound(
      {
        channel: 'telegram',
        direct: true,
        senderId: '123',
        messageId: '3',
        providerUpdate: '3',
        content: 'https://example.com/media',
        media: [{}],
      },
      new Set(['123']),
      mediaPublisher,
    ))!.text,
    /^UNSUPPORTED MEDIA/,
  );
  assert.equal(posts, 0);
});
