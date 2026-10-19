import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api } from '../core/api.ts';
import type { PublicationIntent } from '../core/intent.ts';
import { Publisher, State } from '../core/state.ts';
import { handleUpdate } from '../telegram/handler.ts';

const postId = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';

function intent(): PublicationIntent {
  return {
    version: 1,
    intent_id: 'discovery-12345678',
    origin: 'auto',
    authorization: { kind: 'discovery', approved: true },
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
  };
}

test('PublicationIntent requires an in-memory authority and retains a durable receipt', async (t) => {
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
  );
  await assert.rejects(
    publisher.submitIntent(intent(), { origin: 'auto' } as never),
    /Untrusted publication authority/,
  );
  assert.equal(
    (await publisher.submitIntent(intent(), publisher.authority('auto')))
      .outcome,
    'created',
  );
  assert.equal(
    (await publisher.submitIntent(intent(), publisher.authority('auto')))
      .outcome,
    'created',
  );
  assert.equal(calls, 1);
  assert.ok(await publisher.state.read('receipt-discovery-12345678.json'));
});

test('Telegram text is URL-less news and remains available while auto is paused', async (t) => {
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
      update(2, 'A short bulletin'),
      new Set(['123']),
      publisher,
    ))!.text,
    /^PUBLISHED/,
  );
  assert.deepEqual(submissions[0], {
    type: 'news',
    url: null,
    canonical_url: null,
    source_item_id: (submissions[0] as { source_item_id: string })
      .source_item_id,
    title: 'A short bulletin',
    source: 'Telegram',
    origin: 'telegram',
    preview: null,
    embed: null,
    body: 'A short bulletin',
    references: [],
  });
});
