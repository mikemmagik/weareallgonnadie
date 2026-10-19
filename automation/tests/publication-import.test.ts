import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api } from '../core/api.ts';
import { State } from '../core/state.ts';
import {
  PUBLICATION_INBOX,
  parsePublicationBatch,
  publishImported,
} from '../publishing/import.ts';
import {
  digestPayload,
  JournalPublisher,
  stableSourceItemId,
} from '../publishing/publisher.ts';

const id = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const candidateKey = 'a'.repeat(64);

function batch() {
  const identity = `auto:${candidateKey}:1`;
  const payload = {
    type: 'article' as const,
    origin: 'auto' as const,
    url: 'https://example.test/story',
    canonical_url: 'https://example.test/story',
    source_item_id: stableSourceItemId(identity),
    title: 'Checked satire',
    source: 'WAAGD',
    preview: null,
    embed: null,
    body: 'A bounded body from a verified editorial decision.',
    references: [{ url: 'https://example.test/evidence', title: 'Evidence' }],
  };
  return {
    schema_version: 1,
    producer: 'waagd-discovery-publication-v1',
    intents: [
      {
        identity,
        mode: 'verified_auto',
        candidate_key: candidateKey,
        decision_revision: 1,
        evidence_ids: ['b'.repeat(64)],
        source_url: payload.url,
        content_digest: digestPayload(payload),
        payload,
      },
    ],
  };
}

test('private v1 hand-off validates exact provenance and journal replay', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-publication-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  const input = batch();
  await state.write(PUBLICATION_INBOX, input);
  let posts = 0;
  const api = new Api(
    'https://site.example',
    'test-token',
    async (_url, init) => {
      assert.equal(init?.method, 'POST');
      posts++;
      return Response.json(
        {
          ok: true,
          data: {
            outcome: 'created',
            post: {
              ...input.intents[0]!.payload,
              id,
              published_at: '2026-10-19T00:00:00.000Z',
              deleted_at: null,
            },
          },
        },
        { status: 201 },
      );
    },
  );
  const publisher = new JournalPublisher({
    api,
    state,
    authorize: async () => true,
    enabled: () => true,
  });
  const first = await publishImported(state, publisher);
  const second = await publishImported(state, publisher);
  assert.equal(first.results[0]?.status, 'published');
  assert.equal(second.results[0]?.status, 'published');
  assert.equal(posts, 1);
});

test(
  'cross-repository Python publication envelope reaches the journal exactly once',
  { skip: !process.env.WAAGD_DISCOVERY_PUBLICATION_FIXTURE },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'waagd-cross-e2e-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const state = new State(directory);
    const input = JSON.parse(
      await readFile(process.env.WAAGD_DISCOVERY_PUBLICATION_FIXTURE!, 'utf8'),
    );
    await state.write(PUBLICATION_INBOX, input);
    let posts = 0;
    const publisher = new JournalPublisher({
      api: new Api('https://site.example', 'test-token', async (_url, init) => {
        assert.equal(init?.method, 'POST');
        posts++;
        const payload = JSON.parse(String(init?.body));
        return Response.json(
          {
            ok: true,
            data: {
              outcome: 'created',
              post: {
                ...payload,
                id,
                published_at: '2026-10-19T00:00:00.000Z',
                deleted_at: null,
              },
            },
          },
          { status: 201 },
        );
      }),
      state,
      authorize: async () => true,
      enabled: () => true,
    });
    await publishImported(state, publisher);
    await publishImported(state, publisher);
    assert.equal(posts, 1);
  },
);

test('invalid batch and kill switch cannot issue a Worker request', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-publication-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  const input = batch();
  input.intents[0]!.content_digest = '0'.repeat(64);
  await state.write(PUBLICATION_INBOX, input);
  assert.throws(() => parsePublicationBatch(input), /invalid_intent/);
  let calls = 0;
  const publisher = new JournalPublisher({
    api: new Api('https://site.example', 'test-token', async () => {
      calls++;
      throw new Error('No request expected.');
    }),
    state,
    authorize: async () => true,
  });
  await assert.rejects(publishImported(state, publisher), /invalid_intent/);
  assert.equal(calls, 0);
});
