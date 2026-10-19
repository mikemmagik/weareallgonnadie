import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Api } from '../core/api.ts';
import { State } from '../core/state.ts';
import type { Http } from '../core/http.ts';
import {
  canonicalPayloadJson,
  digestPayload,
  JournalPublisher,
  PublicationError,
  stableSourceItemId,
} from '../publishing/publisher.ts';
import type { PublicationIntent } from '../publishing/publisher.ts';
import type { CreatePostInput, Post } from '../../shared/contracts.ts';

const ID = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const at = new Date('2026-10-19T03:00:00.000Z');
const noSleep = async () => {};

function intent(): PublicationIntent {
  const identity = 'auto:news-123:1';
  const payload: CreatePostInput = {
    url: 'https://news.example/story',
    canonical_url: null,
    source_item_id: stableSourceItemId(identity),
    title: 'The robots applied for leave',
    source: 'WAAGD',
    type: 'news',
    origin: 'auto',
    preview: null,
    embed: null,
    body: 'Satirical article with a checked factual basis.',
    references: [{ url: 'https://news.example/story', title: 'Original' }],
  };
  return {
    identity,
    mode: 'verified_auto',
    candidateKey: 'news-123',
    decisionRevision: 1,
    evidenceIds: ['a'.repeat(64)],
    sourceUrl: payload.url,
    contentDigest: digestPayload(payload),
    payload,
  };
}

function post(input: CreatePostInput, deleted_at: string | null = null): Post {
  return {
    ...input,
    canonical_url: 'https://news.example/story',
    id: ID,
    published_at: at.toISOString(),
    deleted_at,
  };
}

function created(input: CreatePostInput, outcome = 'created', deleted = false) {
  return Response.json(
    {
      ok: true,
      data: {
        outcome,
        matched_by: 'source_item_id',
        post: post(input, deleted ? at.toISOString() : null),
      },
    },
    { status: outcome === 'created' ? 201 : 200 },
  );
}

async function fixture(
  context: { after: (fn: () => Promise<void>) => void },
  http: Http,
  options: { enabled?: boolean; authorized?: boolean; now?: () => Date } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-publish-test-'));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const api = new Api(
    'https://site.example',
    'private-test-token',
    http,
    noSleep,
  );
  const state = new State(dir);
  return {
    api,
    state,
    publisher: new JournalPublisher({
      api,
      state,
      authorize: async () => options.authorized ?? true,
      enabled: () => options.enabled ?? true,
      ...(options.now ? { now: options.now } : {}),
    }),
  };
}

test('publication is default-off and trusted authorization is mandatory', async (t) => {
  let calls = 0;
  const http: Http = async () => {
    calls++;
    throw new Error('No call expected.');
  };
  const { api, state } = await fixture(t, http);
  const off = new JournalPublisher({
    api,
    state,
    authorize: async () => true,
  });
  await assert.rejects(off.publish(intent()), /kill_switch_off/);
  const denied = new JournalPublisher({
    api,
    state,
    authorize: async () => false,
    enabled: () => true,
  });
  await assert.rejects(denied.publish(intent()), /not_authorized/);
  assert.equal(calls, 0);
  assert.deepEqual(
    (await state.names()).filter((name) => name.startsWith('publication-')),
    [],
  );
});

test('created post is journaled and a replay returns the same link without another POST', async (t) => {
  const value = intent();
  let posts = 0;
  const { publisher, state } = await fixture(t, async (_url, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(
      new Headers(init.headers).get('authorization'),
      'Bearer private-test-token',
    );
    posts++;
    return created(JSON.parse(String(init.body)) as CreatePostInput);
  });
  const first = await publisher.publish(value);
  const second = await publisher.publish(value);
  assert.deepEqual(first, second);
  assert.equal(posts, 1);
  assert.equal(first.url, `https://site.example/?post=${ID}`);
  assert.equal(first.outcome, 'created');
  assert.equal(first.visible, true);
  assert.equal(
    (await state.names()).filter((n) => n.endsWith('.lock')).length,
    0,
  );
});

test('timeout after Worker commit reconciles by public GET before retrying POST', async (t) => {
  const value = intent();
  let postCalls = 0;
  let getCalls = 0;
  const http: Http = async (_url, init) => {
    if (init?.method === 'POST') {
      postCalls++;
      if (postCalls === 1) throw new Error('Connection dropped after commit');
      assert.fail('A second POST would duplicate the uncertain request.');
    }
    getCalls++;
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    return Response.json({
      ok: true,
      data: { posts: [post(value.payload)], next_cursor: null },
    });
  };
  const { publisher } = await fixture(t, http);
  await assert.rejects(publisher.publish(value), /uncertain_post/);
  const receipt = await publisher.publish(value);
  assert.equal(receipt.reconciled, true);
  assert.equal(receipt.outcome, 'duplicate');
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 1);
});

test('restart retries the exact saved identity after a negative reconciliation', async (t) => {
  const value = intent();
  let current = at;
  let postCalls = 0;
  const bodies: string[] = [];
  const http: Http = async (_url, init) => {
    if (init?.method === 'GET')
      return Response.json({
        ok: true,
        data: { posts: [], next_cursor: null },
      });
    postCalls++;
    bodies.push(String(init?.body));
    if (postCalls === 1) throw new Error('Timeout');
    return created(value.payload, 'duplicate');
  };
  const { api, state, publisher } = await fixture(t, http, {
    now: () => current,
  });
  await assert.rejects(publisher.publish(value), /uncertain_post/);
  current = new Date(at.getTime() + 5_000);
  const restarted = new JournalPublisher({
    api,
    state,
    authorize: async () => true,
    enabled: () => true,
    now: () => current,
  });
  const receipt = await restarted.publish(value);
  assert.equal(receipt.outcome, 'duplicate');
  assert.equal(postCalls, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(await restarted.replay(), { published: 0, held: 0 });
});

test('failed reconciliation does not blindly repeat an uncertain POST', async (t) => {
  const value = intent();
  let posts = 0;
  let reads = 0;
  const { publisher } = await fixture(t, async (_url, init) => {
    if (init?.method === 'GET') {
      reads++;
      throw new Error('Site read unavailable');
    }
    posts++;
    throw new Error('Ambiguous write');
  });
  await assert.rejects(publisher.publish(value), /uncertain_post/);
  await assert.rejects(publisher.publish(value), /reconcile_unavailable/);
  assert.equal(posts, 1);
  assert.equal(reads, 1);
});

test('same identity cannot be silently repurposed and a tombstone is reported as invisible', async (t) => {
  const value = intent();
  let posts = 0;
  const { publisher } = await fixture(t, async (_url, init) => {
    posts++;
    return created(
      JSON.parse(String(init?.body)) as CreatePostInput,
      'duplicate',
      true,
    );
  });
  const receipt = await publisher.publish(value);
  assert.equal(receipt.visible, false);
  assert.equal(receipt.url, null);
  assert.equal(receipt.outcome, 'duplicate');
  const changed = structuredClone(value);
  changed.payload.title = 'Different article';
  changed.contentDigest = digestPayload(changed.payload);
  await assert.rejects(publisher.publish(changed), /identity_conflict/);
  assert.equal(posts, 1);
});

test('permanent API errors hold the journal and never retry', async (t) => {
  let posts = 0;
  const { publisher } = await fixture(t, async () => {
    posts++;
    return Response.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Denied.' } },
      { status: 401 },
    );
  });
  await assert.rejects(publisher.publish(intent()), /terminal_post_401/);
  await assert.rejects(publisher.publish(intent()), /held/);
  assert.equal(posts, 1);
});

test('daily request budget persists across publisher instances', async (t) => {
  let posts = 0;
  const { api, state } = await fixture(t, async (_url, init) => {
    posts++;
    return created(JSON.parse(String(init?.body)) as CreatePostInput);
  });
  const options = {
    api,
    state,
    authorize: async () => true,
    enabled: () => true,
    limits: { requestsPerDay: 1 },
    now: () => at,
  };
  await new JournalPublisher(options).publish(intent());
  const next = intent();
  next.identity = 'auto:news-124:1';
  next.candidateKey = 'news-124';
  next.payload = {
    ...next.payload,
    url: 'https://news.example/second',
    source_item_id: stableSourceItemId(next.identity),
  };
  next.sourceUrl = next.payload.url;
  next.contentDigest = digestPayload(next.payload);
  await assert.rejects(
    new JournalPublisher(options).publish(next),
    /daily_budget_exhausted/,
  );
  assert.equal(posts, 1);
});

test('a dead process lock is recovered without changing a live lock', async (t) => {
  let posts = 0;
  const { publisher, state } = await fixture(t, async (_url, init) => {
    posts++;
    return created(JSON.parse(String(init?.body)) as CreatePostInput);
  });
  const lock = state.path('publication-journal.lock');
  await mkdir(lock, { mode: 0o700 });
  await writeFile(
    join(lock, 'owner.json'),
    JSON.stringify({ pid: 2147483647 }),
    {
      mode: 0o600,
    },
  );
  await publisher.publish(intent());
  assert.equal(posts, 1);
  await mkdir(lock, { mode: 0o700 });
  await writeFile(
    join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid }),
    {
      mode: 0o600,
    },
  );
  await assert.rejects(publisher.publish(intent()), /busy/);
  assert.equal(posts, 1);
});

test('invalid evidence and changed digest fail before any request', async (t) => {
  const { publisher } = await fixture(t, async () =>
    assert.fail('No request.'),
  );
  const broken = intent();
  broken.evidenceIds = [];
  await assert.rejects(publisher.publish(broken), /invalid_auto_identity/);
  const tampered = intent();
  tampered.payload.body = 'Altered after approval';
  await assert.rejects(publisher.publish(tampered), (error) => {
    assert.ok(error instanceof PublicationError);
    assert.equal(error.code, 'invalid_intent');
    return true;
  });
  const oversized = intent();
  oversized.payload.body = '漢'.repeat(100_000);
  oversized.contentDigest = digestPayload(oversized.payload);
  await assert.rejects(publisher.publish(oversized), /invalid_intent/);
});

test('publication payload digest has a Python-compatible canonical JSON test vector', () => {
  const payload: CreatePostInput = {
    url: 'https://example.org/story',
    canonical_url: null,
    source_item_id: 'waagd:test',
    title: 'Satire',
    source: 'WAAGD',
    type: 'news',
    origin: 'auto',
    preview: null,
    embed: null,
    body: 'Café ☕\n"quote"',
    references: [{ url: 'https://example.org/fact', title: 'Source' }],
  };
  assert.equal(
    canonicalPayloadJson(payload),
    '{"body":"Café ☕\\n\\"quote\\"","canonical_url":null,"embed":null,"origin":"auto","preview":null,"references":[{"title":"Source","url":"https://example.org/fact"}],"source":"WAAGD","source_item_id":"waagd:test","title":"Satire","type":"news","url":"https://example.org/story"}',
  );
  assert.equal(
    digestPayload(payload),
    '2325466ef9967ee35bfaff58a192fe3a97cc65a963ba49ac7c9dabd7c4b7e2ca',
  );
});
