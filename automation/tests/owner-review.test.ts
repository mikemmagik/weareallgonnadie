import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GatewayOwnerReviewer } from '../openclaw/owner-review.ts';

const payload = {
  type: 'article',
  origin: 'telegram',
  url: 'https://example.test/story',
  canonical_url: 'https://example.test/story',
  source_item_id: 'owner-fixture',
  title: 'Owner fixture',
  source: 'WAAGD',
  preview: null,
  embed: null,
  body: 'This is a bounded fictional editorial fixture.',
  references: [],
};

async function executable(
  t: { after: (fn: () => Promise<void>) => void },
  reply: unknown,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'waagd-owner-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'fake-gateway.mjs');
  await writeFile(
    file,
    `#!/usr/bin/env node
if (process.env.DANGEROUS_TEST_TOKEN) process.exit(92);
process.stdout.write(${JSON.stringify(JSON.stringify(reply))});
`,
    { mode: 0o700 },
  );
  await chmod(file, 0o700);
  return file;
}

test('owner Gateway adapter strips unrelated secrets and accepts only tool-free JSON', async (t) => {
  const previous = process.env.DANGEROUS_TEST_TOKEN;
  process.env.DANGEROUS_TEST_TOKEN = 'must-not-reach-agent';
  t.after(() => {
    if (previous === undefined) delete process.env.DANGEROUS_TEST_TOKEN;
    else process.env.DANGEROUS_TEST_TOKEN = previous;
  });
  const reply = {
    status: 'ok',
    payloads: [
      {
        text: JSON.stringify({ schema_version: 1, decision: 'ready', payload }),
      },
    ],
    meta: { toolSummary: { calls: 0 } },
  };
  const reviewer = new GatewayOwnerReviewer({
    executable: await executable(t, reply),
    agent: 'waagd',
  });
  assert.deepEqual(
    await reviewer.review({
      ownerId: 123,
      updateId: 1,
      messageId: 1,
      text: 'https://example.test/story',
      kind: 'url',
    }),
    { status: 'ready', payload },
  );
});

test('owner Gateway adapter fails closed when the agent reports a tool call', async (t) => {
  const reply = {
    status: 'ok',
    payloads: [
      {
        text: JSON.stringify({
          schema_version: 1,
          decision: 'hold',
          reason: 'Hold.',
        }),
      },
    ],
    meta: { toolSummary: { calls: 1 } },
  };
  const reviewer = new GatewayOwnerReviewer({
    executable: await executable(t, reply),
    agent: 'waagd',
  });
  await assert.rejects(
    reviewer.review({
      ownerId: 123,
      updateId: 1,
      messageId: 1,
      text: 'Text submission',
      kind: 'text',
    }),
    /tool-free/,
  );
});
