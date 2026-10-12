import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  Post,
  CreatePostInput,
  CreatePostResult,
  PostsPage,
  DeletePostResult,
} from '../shared/contracts.ts';
import { encodeCursor } from '../worker/cursor.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture: CreatePostInput = {
  type: 'news',
  origin: 'telegram',
  url: 'https://example.com/news',
  canonical_url: null,
  source_item_id: 'news-123',
  title: 'Robots request a day off',
  source: 'Example News',
  preview: { image_url: 'https://example.com/image.jpg', alt_text: null },
  embed: { kind: 'link', url: 'https://example.com/news', label: null },
  body: null,
  references: [{ url: 'https://example.org/reference', title: 'Reference' }],
};
const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

test(
  'local D1 migrations and real Worker HTTP integration',
  { timeout: 120_000 },
  async (t) => {
    // All bindings are local; credentials are stripped before importing Wrangler.
    for (const key of Object.keys(process.env))
      if (/^(CLOUDFLARE_|CF_)/.test(key)) delete process.env[key];
    process.env.WRANGLER_SEND_METRICS = 'false';
    const directory = await mkdtemp(join(tmpdir(), 'waagd-backend-test-'));
    process.env.XDG_CONFIG_HOME = join(directory, 'config');
    process.env.WRANGLER_LOG_PATH = join(directory, 'logs');
    const persist = join(directory, 'state');
    const config = join(directory, 'wrangler.json');
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'assets', 'index.html'),
      '<!doctype html><title>Test assets</title>',
    );
    await writeFile(
      config,
      JSON.stringify({
        name: 'waagd-backend-local-test',
        main: join(root, 'worker/index.ts'),
        compatibility_date: '2026-10-12',
        workers_dev: false,
        assets: {
          directory: join(directory, 'assets'),
          binding: 'ASSETS',
          run_worker_first: ['/api', '/api/*'],
        },
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'waagd-local',
            database_id: '00000000-0000-0000-0000-000000000000',
            migrations_dir: join(root, 'db/migrations'),
            remote: false,
          },
        ],
        vars: { API_WRITE_TOKEN: 'integration-test-only' },
      }),
    );
    const { getPlatformProxy, unstable_dev } = await import('wrangler');
    let proxy:
      | Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>
      | undefined;
    let server: Awaited<ReturnType<typeof unstable_dev>> | undefined;
    try {
      const migrate = () =>
        execFileSync(
          process.execPath,
          [
            join(root, 'node_modules/wrangler/bin/wrangler.js'),
            'd1',
            'migrations',
            'apply',
            'DB',
            '--local',
            '--persist-to',
            persist,
            '--config',
            config,
          ],
          { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' } },
        );
      assert.match(migrate(), /0001_posts.sql/);
      assert.match(migrate(), /No migrations to apply/);
      proxy = await getPlatformProxy<{ DB: D1Database }>({
        configPath: config,
        persist: { path: join(persist, 'v3') },
        remoteBindings: false,
        envFiles: [],
      });
      const db = proxy.env.DB;
      server = await unstable_dev(join(root, 'worker/index.ts'), {
        config,
        local: true,
        persist: true,
        persistTo: persist,
        ip: '127.0.0.1',
        port: 0,
        inspectorPort: 0,
        logLevel: 'error',
        envFiles: [],
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false,
        },
      });
      const base = `http://${server.address}:${server.port}`;
      const headers = {
        Authorization: 'Bearer integration-test-only',
        'Content-Type': 'application/json',
      };
      const api = async <T>(
        path: string,
        init?: RequestInit,
      ): Promise<{
        status: number;
        data: T;
        response: Response;
        error?: { code: string };
      }> => {
        const response = await fetch(`${base}/api/posts${path}`, init);
        assert.equal(
          response.headers.get('content-type'),
          'application/json; charset=utf-8',
        );
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await response.json();
        assert.equal(body.ok, response.ok);
        return {
          status: response.status,
          data: body.data as T,
          response,
          error: body.error,
        };
      };
      const create = (input: CreatePostInput = fixture) =>
        api<CreatePostResult>('', {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        });
      const reset = () => db.prepare('DELETE FROM posts').run();

      await t.test(
        'schema, constraints, immutable keys, and indexed feed',
        async () => {
          const result = await create();
          assert.equal(result.status, 201);
          assert.match(result.data.post.id, /^[0-9a-f-]+$/);
          assert.equal(
            await db
              .prepare('SELECT COUNT(*) AS count FROM d1_migrations')
              .first<number>('count'),
            1,
          );
          await assert.rejects(
            db
              .prepare('UPDATE posts SET published_at = ? WHERE id = ?')
              .bind('2026-10-01T00:00:00.000Z', result.data.post.id)
              .run(),
          );
          await assert.rejects(
            db
              .prepare('UPDATE posts SET source_item_id = ? WHERE id = ?')
              .bind('changed', result.data.post.id)
              .run(),
          );
          await assert.rejects(
            db
              .prepare("UPDATE posts SET type = 'invalid' WHERE id = ?")
              .bind(result.data.post.id)
              .run(),
          );
          await assert.rejects(
            db
              .prepare("UPDATE posts SET embed = '<script>' WHERE id = ?")
              .bind(result.data.post.id)
              .run(),
          );
          await assert.rejects(
            db.prepare('INSERT INTO posts SELECT * FROM posts').run(),
          );
          const plans = await db
            .prepare(
              'EXPLAIN QUERY PLAN SELECT * FROM posts WHERE deleted_at IS NULL AND (published_at, id) < (?, ?) ORDER BY published_at DESC, id DESC LIMIT ?',
            )
            .bind('2026-10-12T00:00:00.000Z', missingId, 21)
            .all<{ detail: string }>();
          assert.ok(
            plans.results.some((row) => /posts_visible_feed/.test(row.detail)),
          );
          assert.ok(
            plans.results.every((row) => !/TEMP B-TREE/.test(row.detail)),
          );
        },
      );
      await reset();
      await t.test(
        'CRUD preserves complete metadata and returns idempotent deletion',
        async () => {
          const empty = await api<PostsPage>('');
          assert.deepEqual(empty.data, { posts: [], next_cursor: null });
          const created = await create();
          assert.equal(created.status, 201);
          const post = created.data.post;
          assert.equal(
            created.response.headers.get('location'),
            `/api/posts/${post.id}`,
          );
          assert.deepEqual(post, {
            ...fixture,
            canonical_url: fixture.url,
            id: post.id,
            published_at: post.published_at,
            deleted_at: null,
          });
          assert.deepEqual((await api<Post>(`/${post.id}`)).data, post);
          assert.deepEqual((await api<PostsPage>('')).data.posts, [post]);
          const removed = await api<DeletePostResult>(`/${post.id}`, {
            method: 'DELETE',
            headers,
          });
          assert.equal(removed.status, 200);
          assert.deepEqual(
            (
              await api<DeletePostResult>(`/${post.id}`, {
                method: 'DELETE',
                headers,
              })
            ).data,
            removed.data,
          );
          assert.equal((await api(`/${post.id}`)).status, 404);
          assert.deepEqual((await api<PostsPage>('')).data.posts, []);
          const retry = await create({
            ...fixture,
            title: 'Must not overwrite',
            origin: 'auto',
          });
          assert.equal(retry.status, 200);
          assert.equal(retry.data.outcome, 'duplicate');
          assert.deepEqual(retry.data.post, {
            ...post,
            deleted_at: removed.data.deleted_at,
          });
          await assert.rejects(
            db
              .prepare('UPDATE posts SET deleted_at = NULL WHERE id = ?')
              .bind(post.id)
              .run(),
          );
          assert.equal((await api(`/${missingId}`)).status, 404);
          assert.equal(
            (await api(`/${missingId}`, { method: 'DELETE', headers })).status,
            404,
          );
        },
      );
      await reset();
      await t.test(
        'concurrent canonical and source duplicates create exactly one record',
        async () => {
          for (const input of [
            fixture,
            { ...fixture, source_item_id: null },
            {
              ...fixture,
              type: 'changelog' as const,
              url: null,
              canonical_url: null,
              source_item_id: 'humanity-changelog:2026-10',
              body: '## Still here',
            },
          ]) {
            const responses = await Promise.all(
              Array.from({ length: 12 }, () => create(input)),
            );
            assert.equal(
              responses.filter((result) => result.status === 201).length,
              1,
            );
            assert.equal(
              responses.filter((result) => result.status === 200).length,
              11,
            );
            assert.equal(
              new Set(responses.map((result) => result.data.post.id)).size,
              1,
            );
            for (const response of responses)
              if (response.data.outcome === 'duplicate')
                assert.equal(
                  response.data.matched_by,
                  input.url === null ? 'source_item_id' : 'canonical_url',
                );
            assert.equal(
              await db
                .prepare('SELECT COUNT(*) AS count FROM posts')
                .first<number>('count'),
              1,
            );
            await reset();
          }
        },
      );
      await t.test(
        'source namespaces remain exact and conflicting keys do not merge',
        async () => {
          const first = await create();
          const second = await create({
            ...fixture,
            url: 'https://example.com/other',
            source_item_id: 'news-456',
          });
          assert.equal(second.status, 201);
          const conflict = await create({
            ...fixture,
            source_item_id: 'news-456',
          });
          assert.equal(conflict.status, 400);
          assert.equal(conflict.error?.code, 'VALIDATION_ERROR');
          const bySource = await create({
            ...fixture,
            url: 'https://example.com/changed-url',
          });
          assert.equal(bySource.data.outcome, 'duplicate');
          if (bySource.data.outcome === 'duplicate')
            assert.equal(bySource.data.matched_by, 'source_item_id');
          assert.deepEqual(bySource.data.post, first.data.post);
          assert.equal(
            (
              await create({
                ...fixture,
                source: 'example news',
                url: 'https://example.com/case',
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await create({
                ...fixture,
                source_item_id: 'another-article',
                url: 'https://elsewhere.example/same-event',
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await create({
                ...fixture,
                url: 'HTTPS://EXAMPLE.COM:443/news#fragment',
                source_item_id: null,
              })
            ).status,
            200,
          );
        },
      );
      await reset();
      await t.test(
        'URL-less changelogs, all content kinds and provider metadata round-trip',
        async () => {
          const changelog: CreatePostInput = {
            ...fixture,
            type: 'changelog',
            url: null,
            canonical_url: null,
            body: '## Humanity Changelog\nStill here.',
            source_item_id: 'humanity-changelog:2026-10',
          };
          const created = await create(changelog);
          assert.equal(created.status, 201);
          assert.equal(created.data.post.canonical_url, null);
          assert.equal((await create(changelog)).status, 200);
          for (const type of ['video', 'meme'] as const) {
            const input: CreatePostInput = {
              ...fixture,
              type,
              url: `https://example.com/${type}`,
              source_item_id: type,
              embed: {
                kind: 'provider' as const,
                provider: 'youtube' as const,
                id: 'video_123',
                url: 'https://youtu.be/video_123',
              },
            };
            const result = await create(input);
            assert.equal(result.status, 201);
            assert.deepEqual(result.data.post.embed, input.embed);
          }
          const noKey = { ...changelog, source_item_id: null };
          assert.equal((await create(noKey)).status, 201);
          assert.equal((await create(noKey)).status, 201);
        },
      );
      await reset();
      await t.test(
        'keyset pagination handles timestamp ties, insertions and deleted cursor rows',
        async () => {
          const timestamp = '2026-10-12T00:00:00.000Z';
          const ids = Array.from(
            { length: 5 },
            (_, index) => `00000000-0000-4000-8000-00000000000${index}`,
          );
          for (const id of ids)
            await db
              .prepare(
                `INSERT INTO posts (id, type, url, canonical_url, title, source, origin, "references", published_at) VALUES (?, 'news', ?, ?, 'Tie', 'test', 'auto', '[]', ?)`,
              )
              .bind(
                id,
                `https://example.com/${id}`,
                `https://example.com/${id}`,
                timestamp,
              )
              .run();
          const first = await api<PostsPage>('?limit=2');
          assert.deepEqual(
            first.data.posts.map((post) => post.id),
            [ids[4], ids[3]],
          );
          assert.ok(first.data.next_cursor);
          await api(`/${ids[3]}`, { method: 'DELETE', headers });
          await db
            .prepare(
              `INSERT INTO posts (id, type, url, canonical_url, title, source, origin, "references", published_at) VALUES (?, 'news', 'https://example.com/new', 'https://example.com/new', 'New', 'test', 'auto', '[]', ?)`,
            )
            .bind(missingId, '2026-10-13T00:00:00.000Z')
            .run();
          const second = await api<PostsPage>(
            `?limit=2&cursor=${first.data.next_cursor}`,
          );
          assert.deepEqual(
            second.data.posts.map((post) => post.id),
            [ids[2], ids[1]],
          );
          const third = await api<PostsPage>(
            `?limit=2&cursor=${second.data.next_cursor}`,
          );
          assert.deepEqual(
            third.data.posts.map((post) => post.id),
            [ids[0]],
          );
          assert.equal(third.data.next_cursor, null);
          assert.equal(
            (await api<PostsPage>('?limit=1')).data.posts[0]?.id,
            missingId,
          );
          assert.equal(
            (
              await api<PostsPage>(
                `?cursor=${encodeCursor({ published_at: timestamp, id: ids[0]! })}`,
              )
            ).data.posts.length,
            0,
          );
        },
      );
      await reset();
      await t.test(
        'auth and validation failures leave storage unchanged; errors are consistent',
        async () => {
          const unauthorized = await api('', {
            method: 'POST',
            body: 'invalid',
          });
          assert.equal(unauthorized.status, 401);
          assert.equal(unauthorized.error?.code, 'UNAUTHORIZED');
          const malformed = await api('', {
            method: 'POST',
            headers,
            body: '{',
          });
          assert.equal(malformed.error?.code, 'INVALID_JSON');
          const invalid = await create({
            ...fixture,
            embed: { kind: 'link', url: 'javascript:alert(1)', label: null },
          });
          assert.equal(invalid.error?.code, 'VALIDATION_ERROR');
          const oversized = await api('', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...fixture, body: 'é'.repeat(140000) }),
          });
          assert.equal(oversized.status, 413);
          assert.equal(
            (await api('?cursor=invalid')).error?.code,
            'INVALID_CURSOR',
          );
          assert.equal(
            (await api('?limit=20&limit=1')).error?.code,
            'VALIDATION_ERROR',
          );
          assert.equal((await api('/bad-id')).error?.code, 'VALIDATION_ERROR');
          assert.equal(
            await db
              .prepare('SELECT COUNT(*) AS count FROM posts')
              .first<number>('count'),
            0,
          );
          await db.prepare('DROP TABLE posts').run();
          const failure = await api('');
          assert.equal(failure.status, 500);
          assert.equal(failure.error?.code, 'INTERNAL_ERROR');
          assert.doesNotMatch(
            JSON.stringify(failure.error),
            /SQL|table|integration-test-only/,
          );
        },
      );
    } finally {
      await server?.stop();
      await proxy?.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
