import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Api } from '../core/api.ts';
import { withPublicationIntentContentHash } from '../core/intent.ts';
import type { PublicationIntent } from '../core/intent.ts';
import { Publisher, State } from '../core/state.ts';
import {
  assertPublishImportOrigin,
  parsePublishImportArguments,
  publishImport,
  publishImportExitCode,
  readIngressTokenFile,
} from '../discovery/file-import.ts';

const postId = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
const ingressToken = 'discovery-ingress-test-token';

function intent(id = 'discovery-import-12345678'): PublicationIntent {
  return withPublicationIntentContentHash({
    version: 1,
    intent_id: id,
    origin: 'auto',
    authorization: { kind: 'discovery', approved: true },
    editorial: {
      decision_id: `decision-${id}`,
      source_event_id: `event-${id}`,
      source_attribution: 'Example reporting',
      approved_at: '2026-10-19T00:00:00.000Z',
      publication_policy: {
        version: 'discovery-policy-v1',
        outcome: 'approved',
      },
    },
    post: {
      type: 'news',
      url: `https://example.com/${id}`,
      canonical_url: `https://example.com/${id}`,
      source_item_id: `source-${id}`,
      title: 'A verified headline',
      source: 'Example',
      origin: 'auto',
      preview: null,
      embed: null,
      body: 'A complete editorial article.',
      references: [{ url: 'https://example.com/evidence', title: 'Evidence' }],
    },
  });
}

async function privateFile(
  dir: string,
  name: string,
  value: string,
): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, value, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

function publisher(
  dir: string,
  request: (input: Record<string, unknown>) => Promise<Response>,
): Publisher {
  return new Publisher(
    new Api(
      'https://waagd-staging.waagd.workers.dev',
      'worker-test-token',
      async (_url, init) => request(JSON.parse(String(init?.body))),
      async () => {},
    ),
    new State(dir),
    { discoveryIngressToken: ingressToken },
  );
}

function created(input: Record<string, unknown>): Response {
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
}

test('publish-import accepts secure v1 and trusted-publisher v2 files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-import-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenFile = await privateFile(
    dir,
    'ingress.token',
    `${ingressToken}\n`,
  );
  const v1File = await privateFile(dir, 'v1.json', JSON.stringify(intent()));
  const trusted = await readFile(
    new URL(
      './fixtures/publication-intent-v2-trusted-publisher.json',
      import.meta.url,
    ),
    'utf8',
  );
  const v2File = await privateFile(dir, 'v2.json', trusted);
  let calls = 0;
  const site = publisher(dir, async (input) => {
    calls++;
    return created(input);
  });
  await site.setPaused('auto', false);
  const token = await readIngressTokenFile(tokenFile);
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: v1File, ingressTokenFile: tokenFile },
      token,
    ),
    { outcome: 'created' },
  );
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: v2File, ingressTokenFile: tokenFile },
      token,
    ),
    { outcome: 'created' },
  );
  assert.equal(calls, 2);
});

test('publish-import rejects bad input, ingress credentials, insecure files, and production by default', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-import-input-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenFile = await privateFile(dir, 'ingress.token', ingressToken);
  const validFile = await privateFile(
    dir,
    'intent.json',
    JSON.stringify(intent()),
  );
  let calls = 0;
  const site = publisher(dir, async (input) => {
    calls++;
    return created(input);
  });
  await site.setPaused('auto', false);

  const invalid = { ...intent(), content_hash: '0'.repeat(64) };
  const invalidFile = await privateFile(
    dir,
    'invalid.json',
    JSON.stringify(invalid),
  );
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: invalidFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'failed' },
  );
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: validFile, ingressTokenFile: tokenFile },
      'wrong-token',
    ),
    { outcome: 'failed' },
  );
  await chmod(validFile, 0o644);
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: validFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'failed' },
  );
  await chmod(validFile, 0o600);
  const link = join(dir, 'intent-link.json');
  await symlink(validFile, link);
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile: link, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'failed' },
  );
  assert.throws(() =>
    assertPublishImportOrigin('https://weareallgonnadie.example', false),
  );
  assert.doesNotThrow(() =>
    assertPublishImportOrigin('https://weareallgonnadie.example', true),
  );
  assert.throws(() =>
    parsePublishImportArguments(['--intent-file', validFile]),
  );
  assert.equal(calls, 0);
});

test('publish-import preserves the pause policy, receipt identity, and output safety', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-import-receipt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenFile = await privateFile(dir, 'ingress.token', ingressToken);
  const original = intent();
  const intentFile = await privateFile(
    dir,
    'intent.json',
    JSON.stringify(original),
  );
  let calls = 0;
  const site = publisher(dir, async (input) => {
    calls++;
    return created(input);
  });
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'held' },
  );
  assert.equal(calls, 0);
  await site.setPaused('auto', false);
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'created' },
  );
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'created' },
  );
  assert.equal(calls, 1);
  const conflicting = withPublicationIntentContentHash({
    ...original,
    post: {
      ...original.post,
      body: 'Changed after the first accepted intent.',
    },
  });
  await writeFile(intentFile, JSON.stringify(conflicting));
  assert.deepEqual(
    await publishImport(
      site,
      { intentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'failed' },
  );
  const output = JSON.stringify({ outcome: 'failed' });
  assert.ok(!output.includes(ingressToken));
  assert.ok(!output.includes(intentFile));
  assert.ok(!output.includes(conflicting.post.body!));
});

test('publish-import keeps retryable and quota outcomes non-successful across restart and concurrency', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-import-recovery-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenFile = await privateFile(dir, 'ingress.token', ingressToken);
  const intentFile = await privateFile(
    dir,
    'intent.json',
    JSON.stringify(intent()),
  );
  let committed = false;
  const first = publisher(dir, async () => {
    committed = true;
    throw new Error('response lost after commit');
  });
  await first.setPaused('auto', false);
  assert.deepEqual(
    await publishImport(
      first,
      { intentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'uncertain' },
  );
  assert.equal(committed, true);

  let replayCalls = 0;
  const restarted = publisher(dir, async (input) => {
    replayCalls++;
    return Response.json({
      ok: true,
      data: {
        outcome: 'duplicate',
        matched_by: 'canonical_url',
        post: {
          ...input,
          id: postId,
          published_at: '2026-10-19T00:00:00.000Z',
          deleted_at: null,
        },
      },
    });
  });
  assert.deepEqual(await restarted.replay(), { sent: 1, failed: 0 });
  assert.equal(replayCalls, 1);

  const quotaFile = await privateFile(
    dir,
    'quota.json',
    JSON.stringify(intent('discovery-import-quota-12345678')),
  );
  const quota = publisher(dir, async () => new Response('', { status: 429 }));
  assert.deepEqual(
    await publishImport(
      quota,
      { intentFile: quotaFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    { outcome: 'held' },
  );
  assert.equal(publishImportExitCode({ outcome: 'held' }), 2);
  assert.equal(publishImportExitCode({ outcome: 'uncertain' }), 3);

  const concurrentFile = await privateFile(
    dir,
    'concurrent.json',
    JSON.stringify(intent('discovery-import-concurrent-12345678')),
  );
  let concurrentCalls = 0;
  const concurrent = publisher(dir, async (input) => {
    concurrentCalls++;
    return created(input);
  });
  const outcomes = await Promise.all([
    publishImport(
      concurrent,
      { intentFile: concurrentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
    publishImport(
      concurrent,
      { intentFile: concurrentFile, ingressTokenFile: tokenFile },
      ingressToken,
    ),
  ]);
  assert.equal(concurrentCalls, 1);
  assert.ok(outcomes.some((outcome) => outcome.outcome === 'created'));
});
