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
import { digestPayload, JournalPublisher } from '../publishing/publisher.ts';

const id = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const fixtures = new URL('../publishing/fixtures/', import.meta.url);

async function batch(name = 'publication-intent-v1-valid.json') {
  return JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));
}

test('PublicationIntent v1 fixture validates exact metadata and journal replay', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-publication-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  const input = await batch();
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
              ...input.intents[0]!.post,
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
  const journal = await state.read(
    (await state.names()).find((name) =>
      /^publication-[a-f0-9]{64}\.json$/.test(name),
    )!,
  );
  assert.equal(
    (journal as { intent: { provenance: { deliveryId: string } } }).intent
      .provenance.deliveryId,
    input.intents[0].delivery_id,
  );
});

test('a new delivery ID redelivers the same intent without a content conflict', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-publication-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  const input = await batch();
  let posts = 0;
  const publisher = new JournalPublisher({
    api: new Api('https://site.example', 'test-token', async (_url, init) => {
      posts++;
      return Response.json(
        {
          ok: true,
          data: {
            outcome: 'created',
            post: {
              ...input.intents[0]!.post,
              id,
              published_at: '2026-10-19T00:00:00.000Z',
              deleted_at: null,
            },
          },
        },
        { status: init?.method === 'POST' ? 201 : 200 },
      );
    }),
    state,
    authorize: async () => true,
    enabled: () => true,
  });
  await state.write(PUBLICATION_INBOX, input);
  await publishImported(state, publisher);
  const redelivery = structuredClone(input);
  redelivery.intents[0].delivery_id = '6bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
  await state.write(PUBLICATION_INBOX, redelivery);
  const repeated = await publishImported(state, publisher);
  assert.equal(repeated.results[0]?.status, 'published');
  assert.equal(posts, 1);
});

test('v1 rejects modified content, metadata, risks and duplicate intent IDs', async () => {
  const valid = await batch();
  const invalidHash = await batch(
    'publication-intent-v1-invalid-content-hash.json',
  );
  assert.throws(() => parsePublicationBatch(invalidHash), /invalid_post/);

  const withoutPermission = structuredClone(valid);
  withoutPermission.intents[0].authorization.automatic = false;
  assert.throws(
    () => parsePublicationBatch(withoutPermission),
    /invalid_authorization/,
  );

  const unverified = structuredClone(valid);
  unverified.intents[0].verification_status = 'PARTIAL';
  assert.throws(() => parsePublicationBatch(unverified), /invalid_metadata/);

  const risky = structuredClone(valid);
  risky.intents[0].risks = [
    { code: 'unresolved-source', severity: 'critical' },
  ];
  assert.throws(() => parsePublicationBatch(risky), /publication_risk/);

  const duplicated = structuredClone(valid);
  duplicated.intents.push(structuredClone(duplicated.intents[0]));
  assert.throws(() => parsePublicationBatch(duplicated), /duplicate_intent_id/);
});

test('v1 uses stable intent IDs and fails closed on different content under one ID', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-publication-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  const input = await batch();
  await state.write(PUBLICATION_INBOX, input);
  const publisher = new JournalPublisher({
    api: new Api('https://site.example', 'test-token', async (_url, init) =>
      Response.json(
        {
          ok: true,
          data: {
            outcome: 'created',
            post: {
              ...input.intents[0]!.post,
              id,
              published_at: '2026-10-19T00:00:00.000Z',
              deleted_at: null,
            },
          },
        },
        { status: init?.method === 'POST' ? 201 : 200 },
      ),
    ),
    state,
    authorize: async () => true,
    enabled: () => true,
  });
  await publishImported(state, publisher);

  const altered = structuredClone(input);
  altered.intents[0].post.body = 'Different AI article under an old ID.';
  altered.intents[0].content_hash = digestPayload(altered.intents[0].post);
  await state.write(PUBLICATION_INBOX, altered);
  const outcome = await publishImported(state, publisher);
  assert.deepEqual(outcome.results, [
    {
      identity: input.intents[0].intent_id,
      status: 'held',
      error: 'identity_conflict',
    },
  ]);
});

test(
  'cross-repository Discovery fixture reaches the journal exactly once',
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
  const input = await batch('publication-intent-v1-invalid-content-hash.json');
  await state.write(PUBLICATION_INBOX, input);
  assert.throws(() => parsePublicationBatch(input), /invalid_post/);
  let calls = 0;
  const publisher = new JournalPublisher({
    api: new Api('https://site.example', 'test-token', async () => {
      calls++;
      throw new Error('No request expected.');
    }),
    state,
    authorize: async () => true,
  });
  await assert.rejects(publishImported(state, publisher), /invalid_post/);
  assert.equal(calls, 0);
});
