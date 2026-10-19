import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHashForPost } from '../core/intent.ts';
import { importDiscoveryPublicationExportV1 } from '../discovery/importer.ts';
import { DiscoveryImportError } from '../discovery/importer.ts';

function exportFixture() {
  const post = {
    type: 'news' as const,
    origin: 'auto' as const,
    url: 'https://example.test/story',
    canonical_url: 'https://example.test/story',
    source_item_id:
      'waagd:c2a93f27c78582b570f57734face0287fb4a4f076a10edc15cc92acd3b4709e5',
    title: 'Checked satire',
    source: 'WAAGD',
    preview: null,
    embed: null,
    body: 'A bounded body from a verified editorial decision.',
    references: [{ url: 'https://example.test/evidence', title: 'Evidence' }],
  };
  return {
    version: 1,
    producer: 'waagd-discovery',
    intents: [
      {
        version: 1,
        intent_id:
          'auto:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:1',
        origin: 'waagd-discovery',
        authorization: { kind: 'trusted_publication_policy', automatic: true },
        post,
        candidate_key:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        delivery_id: '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12',
        decision_revision: 1,
        verification_status: 'VERIFIED',
        editorial_status: 'READY_FOR_REVIEW',
        publisher: 'waagd-discovery',
        published_at_source: '2026-10-19T00:00:00.000Z',
        risks: [] as Array<{ code: string; severity: string }>,
        evidence_ids: [
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ],
        content_hash: contentHashForPost(post),
        publication_policy_version: 'policy-v1',
      },
    ],
  };
}

test('Discovery export v1 maps to the sole core PublicationIntent v1', () => {
  const exported = exportFixture();
  const imported = importDiscoveryPublicationExportV1(exported);
  assert.equal(imported.length, 1);
  assert.deepEqual(imported[0]!.authorization, {
    kind: 'discovery',
    approved: true,
  });
  assert.equal(imported[0]!.origin, 'auto');
  assert.equal(imported[0]!.content_hash, exported.intents[0]!.content_hash);
  assert.equal(imported[0]!.editorial?.publication_policy.version, 'policy-v1');
});

test('Discovery import rejects a changed post, delivery metadata misuse, or blocking risk', () => {
  const changed = exportFixture();
  changed.intents[0]!.post.body = 'Changed after producer hashing.';
  assert.throws(
    () => importDiscoveryPublicationExportV1(changed),
    DiscoveryImportError,
  );

  const blocking = exportFixture();
  blocking.intents[0]!.risks = [{ code: 'unresolved', severity: 'high' }];
  assert.throws(
    () => importDiscoveryPublicationExportV1(blocking),
    DiscoveryImportError,
  );

  const duplicate = exportFixture();
  duplicate.intents.push(structuredClone(duplicate.intents[0]!));
  assert.throws(
    () => importDiscoveryPublicationExportV1(duplicate),
    DiscoveryImportError,
  );
});
