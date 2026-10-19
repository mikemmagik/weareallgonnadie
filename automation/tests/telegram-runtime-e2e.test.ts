import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api } from '../core/api.ts';
import { Publisher, State } from '../core/state.ts';
import { handleUpdate } from '../telegram/handler.ts';
import { ownerWorkflow } from '../telegram/runtime.ts';

const postId = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const sourceUrl = 'https://example.test/story';

function update(text: string, id: number) {
  return {
    update_id: id,
    message: {
      message_id: id,
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: 'private' },
      text,
    },
  };
}

test('fake Gateway, owner preview and journaled Worker post complete one idempotent journey', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-telegram-e2e-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const response = {
    status: 'ok',
    result: {
      payloads: [
        {
          text: JSON.stringify({
            schema_version: 1,
            decision: 'ready',
            payload: {
              type: 'article',
              origin: 'telegram',
              url: sourceUrl,
              canonical_url: sourceUrl,
              source_item_id: null,
              title: 'Gateway fixture',
              source: 'WAAGD',
              preview: null,
              embed: null,
              body: 'A fictional and bounded editorial fixture.',
              references: [],
            },
          }),
        },
      ],
      meta: { toolSummary: { calls: 0 } },
    },
  };
  const executable = join(directory, 'fake-gateway.mjs');
  await writeFile(
    executable,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(response))});\n`,
    { mode: 0o700 },
  );
  await chmod(executable, 0o700);
  let posts = 0;
  const state = new State(directory);
  const api = new Api(
    'https://site.example',
    'test-token',
    async (_url, init) => {
      assert.equal(init?.method, 'POST');
      posts++;
      const payload = JSON.parse(String(init.body));
      return Response.json(
        {
          ok: true,
          data: {
            outcome: 'created',
            post: {
              ...payload,
              id: postId,
              published_at: '2026-10-19T00:00:00.000Z',
              deleted_at: null,
            },
          },
        },
        { status: 201 },
      );
    },
  );
  const publisher = new Publisher(api, state);
  const workflow = ownerWorkflow(publisher, {
    executable,
    agent: 'waagd',
    enabled: true,
  });
  const staged = await handleUpdate(
    update(sourceUrl, 1),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  const id = staged!.text.match(/^STAGED ([a-f0-9]{24})/)![1]!;
  assert.match(staged!.text, /Status: READY/);
  const published = await handleUpdate(
    update(`/publish ${id}`, 2),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(published!.text, /^PUBLISHED/);
  assert.equal(posts, 1);
  const replay = await handleUpdate(
    update(`/publish ${id}`, 3),
    new Set(['123']),
    publisher,
    undefined,
    workflow,
  );
  assert.match(replay!.text, /^ALREADY PUBLISHED/);
  assert.equal(posts, 1);
});
