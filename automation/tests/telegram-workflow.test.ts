import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api } from '../core/api.ts';
import { linkPayload } from '../core/metadata.ts';
import { Publisher, State } from '../core/state.ts';
import { handleUpdate } from '../telegram/handler.ts';
import { TelegramSubmissionWorkflow } from '../telegram/workflow.ts';

const POST_ID = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const PUBLICATION_URL = `https://site.example/?post=${POST_ID}`;

function update(text: string, updateId = 42, ownerId = 123) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: ownerId, is_bot: false },
      chat: { id: ownerId, type: 'private' },
      text,
    },
  };
}

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-telegram-workflow-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = new State(dir);
  const api = new Api('https://site.example', 'fake-token', async () => {
    assert.fail('No direct Worker request is allowed.');
  });
  return { state, publisher: new Publisher(api, state) };
}

test('owner submission is durable before preview and only publishes on explicit command', async (t) => {
  const { state, publisher } = await fixture(t);
  const calls: string[] = [];
  const workflow = new TelegramSubmissionWorkflow(
    state,
    async (input) => {
      assert.equal(input.kind, 'url');
      assert.equal(input.text, 'https://news.example/story');
      return {
        status: 'ready',
        payload: linkPayload(
          input.text,
          'Verified satirical title',
          'News',
          'telegram',
        ),
      };
    },
    async (payload, identity) => {
      assert.equal(payload.origin, 'telegram');
      calls.push(identity);
      return { url: PUBLICATION_URL, postId: POST_ID };
    },
  );
  const staged = await handleUpdate(
    update('https://news.example/story'),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(staged!.text, /^STAGED ([a-f0-9]{24})/);
  const id = staged!.text.match(/^STAGED ([a-f0-9]{24})/)![1]!;
  assert.match(staged!.text, /Verified satirical title/);
  assert.deepEqual(calls, []);
  assert.equal(
    (await state.read(`telegram-submission-${id}.json`)) !== null,
    true,
  );

  const preview = await handleUpdate(
    update(`/preview ${id}`, 43),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(preview!.text, /Status: READY/);
  assert.deepEqual(calls, []);
  const published = await handleUpdate(
    update(`/publish ${id}`, 44),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(published!.text, /^PUBLISHED/);
  assert.match(published!.text, /https:\/\/site.example/);
  assert.deepEqual(calls, [`telegram-${id}`]);

  const restarted = new TelegramSubmissionWorkflow(
    state,
    async () => assert.fail('Review must not run on replay.'),
    async () =>
      assert.fail('Publication must not repeat after receipt is saved.'),
  );
  const replay = await handleUpdate(
    update(`/publish ${id}`, 45),
    new Set(['123']),
    publisher,
    undefined,
    restarted,
  );
  assert.match(replay!.text, /^ALREADY PUBLISHED/);
  assert.match(replay!.text, new RegExp(POST_ID));
  const repeatedIngress = await handleUpdate(
    update('https://news.example/story'),
    new Set(['123']),
    publisher,
    undefined,
    restarted,
  );
  assert.match(repeatedIngress!.text, new RegExp(`^STAGED ${id}`));
});

test('ambiguous publication resumes with the same stable identity after restart', async (t) => {
  const { state, publisher } = await fixture(t);
  const identities: string[] = [];
  let uncertain = true;
  const review = async () => ({
    status: 'ready' as const,
    payload: linkPayload(
      'https://news.example/story',
      'Title',
      'News',
      'telegram',
    ),
  });
  const publish = async (_payload: unknown, identity: string) => {
    identities.push(identity);
    if (uncertain) {
      uncertain = false;
      throw new Error('Response lost after the POST.');
    }
    return { url: PUBLICATION_URL, postId: POST_ID };
  };
  const first = new TelegramSubmissionWorkflow(state, review, publish);
  const staged = await handleUpdate(
    update('https://news.example/story', 88),
    new Set(['123']),
    publisher,
    undefined,
    first,
  );
  const id = staged!.text.match(/^STAGED ([a-f0-9]{24})/)![1]!;
  const failed = await handleUpdate(
    update(`/publish ${id}`, 89),
    new Set(['123']),
    publisher,
    undefined,
    first,
  );
  assert.match(failed!.text, /^FAILED/);
  assert.equal(
    ((await state.read(`telegram-submission-${id}.json`)) as { status: string })
      .status,
    'publishing',
  );
  const restarted = new TelegramSubmissionWorkflow(state, review, publish);
  const recovered = await handleUpdate(
    update(`/publish ${id}`, 90),
    new Set(['123']),
    publisher,
    undefined,
    restarted,
  );
  assert.match(recovered!.text, /^PUBLISHED/);
  assert.deepEqual(identities, [`telegram-${id}`, `telegram-${id}`]);
});

test('owner authorization, binary media rejection and editorial holds fail closed', async (t) => {
  const { state, publisher } = await fixture(t);
  let reviewed = 0;
  const workflow = new TelegramSubmissionWorkflow(
    state,
    async () => {
      reviewed++;
      return { status: 'hold', reason: 'Unverified material claim.' };
    },
    async () => assert.fail('Held content cannot publish.'),
  );
  const unauthorized = update('Rumor', 1, 456);
  const group = update('Rumor', 2);
  group.message.chat.type = 'group';
  const bot = update('Rumor', 3);
  bot.message.from.is_bot = true;
  for (const raw of [unauthorized, group, bot])
    assert.equal(
      await handleUpdate(raw, new Set(['123']), publisher, undefined, workflow),
      null,
    );
  assert.equal(reviewed, 0);
  const binary = {
    update_id: 4,
    message: {
      from: { id: 123 },
      chat: { id: 123, type: 'private' },
      photo: [{ file_id: 'telegram-private-file' }],
      caption: 'https://news.example/story',
    },
  };
  assert.match(
    (await handleUpdate(
      binary,
      new Set(['123']),
      publisher,
      undefined,
      workflow,
    ))!.text,
    /Binary Telegram media is unsupported/,
  );
  assert.equal(reviewed, 0);
  const staged = await handleUpdate(
    update('This claim lacks evidence', 5),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(staged!.text, /Status: HOLD/);
  const id = staged!.text.match(/^STAGED ([a-f0-9]{24})/)![1]!;
  assert.match(
    (await handleUpdate(
      update(`/publish ${id}`, 6),
      new Set(['123']),
      publisher,
      undefined,
      workflow,
    ))!.text,
    /^FAILED: Submission is not approved/,
  );
  assert.match(
    (await handleUpdate(
      update(`/preview ${id}`, 7, 456),
      new Set(['123', '456']),
      publisher,
      undefined,
      workflow,
    ))!.text,
    /Submission was not found/,
  );
  assert.equal(reviewed, 1);
});

test('invalid saved state and replayed event with changed text cannot authorize publication', async (t) => {
  const { state, publisher } = await fixture(t);
  const workflow = new TelegramSubmissionWorkflow(
    state,
    async (input) => ({
      status: 'ready',
      payload: linkPayload(
        'https://news.example/story',
        input.text,
        'News',
        'telegram',
      ),
    }),
    async () => assert.fail('Corrupt state must fail closed.'),
  );
  const staged = await handleUpdate(
    update('https://news.example/story', 70),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  const id = staged!.text.match(/^STAGED ([a-f0-9]{24})/)![1]!;
  assert.match(
    (await handleUpdate(
      update('Different content', 70),
      new Set(['123']),
      publisher,
      undefined,
      workflow,
    ))!.text,
    /event ID was reused/,
  );
  const saved = (await state.read(`telegram-submission-${id}.json`)) as Record<
    string,
    unknown
  >;
  await state.write(`telegram-submission-${id}.json`, {
    ...saved,
    payload: { malicious: true },
  });
  assert.match(
    (await handleUpdate(
      update(`/publish ${id}`, 71),
      new Set(['123']),
      publisher,
      undefined,
      workflow,
    ))!.text,
    /Saved publication payload is invalid/,
  );
});
