import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isHttpUrl,
  validateCreatePostInput,
  CONTENT_LIMITS,
} from '../shared/contracts.ts';
import type { CreatePostInput } from '../shared/contracts.ts';

const publication: CreatePostInput = {
  type: 'news',
  origin: 'auto',
  url: 'https://example.com/news',
  canonical_url: null,
  source_item_id: null,
  title: 'Robots request a day off',
  source: 'Example News',
  preview: null,
  embed: null,
  body: null,
  references: [],
};

test('regular publications require an original URL for every origin and type', () => {
  for (const origin of ['auto', 'telegram']) {
    for (const type of ['news', 'video', 'meme']) {
      assert.equal(
        validateCreatePostInput({ ...publication, origin, type }).valid,
        true,
      );
      assert.equal(
        validateCreatePostInput({ ...publication, origin, type, url: null })
          .valid,
        false,
      );
    }
  }
});

test('changelogs allow no external URL but require their own content', () => {
  const changelog = {
    ...publication,
    type: 'changelog',
    url: null,
    body: '## Humanity Changelog\nStill here.',
  };
  assert.equal(validateCreatePostInput(changelog).valid, true);
  for (const body of [null, '', '  ', undefined])
    assert.equal(validateCreatePostInput({ ...changelog, body }).valid, false);
  assert.equal(
    validateCreatePostInput({
      ...changelog,
      canonical_url: 'https://example.com',
    }).valid,
    false,
  );
});

test('URLs reject executable schemes, credentials, relative URLs, whitespace, and overlong values', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hello',
    '/news',
    'https://user:pass@example.com',
    ' https://example.com',
    'https://example.com/' + 'x'.repeat(CONTENT_LIMITS.url),
  ]) {
    assert.equal(isHttpUrl(url), false, url);
    assert.equal(validateCreatePostInput({ ...publication, url }).valid, false);
  }
  assert.equal(isHttpUrl('https://example.com/news?x=1'), true);
  assert.equal(isHttpUrl('http://example.com/news'), true);
});

test('structured embeds accept known hosts and links, reject arbitrary HTML and spoofed providers', () => {
  assert.equal(
    validateCreatePostInput({
      ...publication,
      embed: {
        kind: 'provider',
        provider: 'youtube',
        id: 'video_123',
        url: 'https://youtu.be/video_123',
      },
    }).valid,
    true,
  );
  assert.equal(
    validateCreatePostInput({
      ...publication,
      embed: { kind: 'link', url: publication.url, label: null },
    }).valid,
    true,
  );
  for (const embed of [
    '<iframe src="https://example.com"></iframe>',
    {
      kind: 'provider',
      provider: 'youtube',
      id: '123',
      url: 'https://youtube.com.evil.example/123',
    },
    { kind: 'provider', provider: 'unknown', id: '123', url: publication.url },
    {
      kind: 'link',
      url: publication.url,
      label: null,
      html: '<script>alert(1)</script>',
    },
  ])
    assert.equal(
      validateCreatePostInput({ ...publication, embed }).valid,
      false,
    );
});

test('untrusted input rejects missing, malformed, oversized and server-owned fields', () => {
  for (const input of [
    null,
    [],
    'text',
    {},
    { ...publication, id: 'client-id' },
    { ...publication, published_at: '2026-10-12T00:00:00.000Z' },
    { ...publication, deleted_at: null },
    { ...publication, origin: 'web' },
    { ...publication, title: 'x'.repeat(CONTENT_LIMITS.title + 1) },
    { ...publication, body: 'x'.repeat(CONTENT_LIMITS.body + 1) },
    {
      ...publication,
      preview: { image_url: 'javascript:alert(1)', alt_text: null },
    },
    { ...publication, references: [{ url: '/relative', title: null }] },
    {
      ...publication,
      references: Array(CONTENT_LIMITS.references + 1).fill({
        url: publication.url,
        title: null,
      }),
    },
  ])
    assert.equal(validateCreatePostInput(input).valid, false);
  const result = validateCreatePostInput({ ...publication, title: '' });
  if (!result.valid)
    assert.ok(result.issues.some((issue) => issue.path === 'title'));
});

test('preview and reference metadata accept explicit nulls and valid URLs', () => {
  assert.equal(
    validateCreatePostInput({
      ...publication,
      preview: {
        image_url: 'https://example.com/preview.jpg',
        alt_text: 'Robot taking a break',
      },
      references: [{ url: 'https://example.org/source', title: null }],
    }).valid,
    true,
  );
});
