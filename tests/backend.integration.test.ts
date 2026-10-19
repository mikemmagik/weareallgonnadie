import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
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
import { Api } from '../automation/core/api.ts';
import { withPublicationIntentContentHash } from '../automation/core/intent.ts';
import { Publisher, State } from '../automation/core/state.ts';
import { handleUpdate } from '../automation/telegram/handler.ts';
import { runDiscovery } from '../automation/discovery/run.ts';
import { runChangelog } from '../automation/changelog/run.ts';
import { encodeCursor } from '../worker/cursor.ts';
import { SECURITY_HEADERS } from '../worker/security.ts';
import { prepareUrl } from '../automation/core/metadata.ts';

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
    const writeConfig = (migrationsDir: string) =>
      writeFile(
        config,
        JSON.stringify({
          name: 'waagd-backend-local-test',
          main: join(root, 'worker/index.ts'),
          compatibility_date: '2026-10-12',
          workers_dev: false,
          assets: {
            directory: join(root, 'dist'),
            binding: 'ASSETS',
            run_worker_first: ['/api', '/api/*', '/embed/reddit'],
          },
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'waagd-local',
              database_id: '00000000-0000-0000-0000-000000000000',
              migrations_dir: migrationsDir,
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
      const legacyMigrations = join(directory, 'legacy-migrations');
      await mkdir(legacyMigrations);
      await copyFile(
        join(root, 'db/migrations/0001_posts.sql'),
        join(legacyMigrations, '0001_posts.sql'),
      );
      await writeConfig(legacyMigrations);
      assert.match(migrate(), /0001_posts.sql/);
      proxy = await getPlatformProxy<{ DB: D1Database }>({
        configPath: config,
        persist: { path: join(persist, 'v3') },
        remoteBindings: false,
        envFiles: [],
      });
      const legacyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const legacyTimestamp = '2026-10-01T00:00:00.000Z';
      await proxy.env.DB.prepare(
        `INSERT INTO posts (id, type, url, canonical_url, source_item_id, title, source, origin, preview, embed, body, "references", published_at, deleted_at)
         VALUES (?, 'news', ?, ?, ?, 'Legacy row', 'Legacy importer', 'auto', NULL, NULL, NULL, '[]', ?, ?)`,
      )
        .bind(
          legacyId,
          'https://example.com/legacy',
          'https://example.com/legacy',
          'legacy-1',
          legacyTimestamp,
          legacyTimestamp,
        )
        .run();
      await proxy.dispose();
      proxy = undefined;
      await writeConfig(join(root, 'db/migrations'));
      assert.match(migrate(), /0002_url_less_news.sql/);
      assert.match(migrate(), /No migrations to apply/);
      proxy = await getPlatformProxy<{ DB: D1Database }>({
        configPath: config,
        persist: { path: join(persist, 'v3') },
        remoteBindings: false,
        envFiles: [],
      });
      const db = proxy.env.DB;
      assert.deepEqual(
        await db
          .prepare(
            'SELECT id, url, canonical_url, source_item_id, deleted_at FROM posts WHERE id = ?',
          )
          .bind(legacyId)
          .first(),
        {
          id: legacyId,
          url: 'https://example.com/legacy',
          canonical_url: 'https://example.com/legacy',
          source_item_id: 'legacy-1',
          deleted_at: legacyTimestamp,
        },
      );
      await assert.rejects(
        db
          .prepare('UPDATE posts SET source_item_id = ? WHERE id = ?')
          .bind('changed', legacyId)
          .run(),
      );
      await assert.rejects(
        db
          .prepare('UPDATE posts SET deleted_at = NULL WHERE id = ?')
          .bind(legacyId)
          .run(),
      );
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
        'security headers cover real assets and Worker success/error responses',
        async () => {
          const home = await fetch(base);
          const html = await home.text();
          const script = html.match(/<script[^>]*src="([^"]+)"/)?.[1];
          const style = html.match(/<link[^>]*href="([^"]+\.css)"/)?.[1];
          assert.ok(script);
          assert.ok(style);
          for (const [path, init] of [
            ['/', undefined],
            ['/legal', undefined],
            ['/privacy', undefined],
            [script, undefined],
            [style, undefined],
            ['/favicon.svg', undefined],
            ['/missing-asset', undefined],
            ['/api/posts', undefined],
            ['/api/unknown', undefined],
            ['/api/posts', { method: 'POST' }],
            ['/api/posts', { method: 'POST', headers, body: '{}' }],
          ] as const) {
            const response = await fetch(`${base}${path}`, init);
            for (const [name, value] of Object.entries(SECURITY_HEADERS))
              assert.equal(
                response.headers.get(name),
                value,
                `${path}: ${name}`,
              );
            await response.body?.cancel();
          }
        },
      );

      await t.test(
        'FIX-002 TikTok cross-form identities, races, namespaces and tombstones in real D1',
        async () => {
          const videoId = '6718335390845095173';
          const final = `https://www.tiktok.com/@test/video/${videoId}`;
          const urls = [
            'https://vt.tiktok.com/fix002/',
            'https://vm.tiktok.com/fix002/',
            final,
          ];
          const prepare = (url: string) =>
            prepareUrl(url, async () => {
              const response = new Response('');
              Object.defineProperty(response, 'url', { value: final });
              return response;
            });
          for (const order of [
            urls,
            [...urls].reverse(),
            urls.map((url) => `${url}?utm_source=telegram`),
          ]) {
            await reset();
            let first: Post | undefined;
            for (const [index, url] of order.entries()) {
              const result = await create(await prepare(url));
              assert.equal(result.status, index ? 200 : 201);
              assert.equal(
                result.data.outcome,
                index ? 'duplicate' : 'created',
              );
              if (!first) first = result.data.post;
              assert.equal(result.data.post.id, first.id);
              assert.equal(result.data.post.url, order[0]);
              assert.equal(result.data.post.source, 'TikTok');
              assert.equal(result.data.post.source_item_id, videoId);
            }
            assert.equal(
              await db
                .prepare('SELECT COUNT(*) AS n FROM posts')
                .first<number>('n'),
              1,
            );
          }
          await reset();
          const payloads = await Promise.all(urls.map(prepare));
          const race = await Promise.all(
            Array.from({ length: 18 }, (_, i) =>
              create({
                ...payloads[i % 3]!,
                source: ['vt.tiktok.com', 'tiktok', 'arbitrary'][i % 3]!,
              }),
            ),
          );
          assert.equal(race.filter((r) => r.status === 201).length, 1);
          assert.equal(race.filter((r) => r.status === 200).length, 17);
          assert.equal(
            await db
              .prepare('SELECT COUNT(*) AS n FROM posts')
              .first<number>('n'),
            1,
          );
          const id = race[0]!.data.post.id;
          await api(`/${id}`, { method: 'DELETE', headers });
          const tombstone = await create(payloads[1]!);
          assert.equal(tombstone.status, 200);
          assert.ok(tombstone.data.post.deleted_at);
          assert.equal((await api<PostsPage>('')).data.posts.length, 0);
          await reset();
          const first = await create(payloads[0]!);
          assert.equal(first.status, 201);
          assert.equal(
            (
              await create({
                ...payloads[0]!,
                url: 'https://www.tiktok.com/@other/video/7420000000000000001',
                canonical_url: null,
                source_item_id: null,
                embed: null,
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await create({
                ...fixture,
                url: 'https://example.com/different-provider',
                canonical_url: null,
                source: 'Other provider',
                source_item_id: videoId,
                embed: null,
              })
            ).status,
            201,
          );
          for (const invalid of [
            { ...payloads[0]!, source_item_id: 'invalid' },
            {
              ...payloads[0]!,
              embed: {
                kind: 'provider',
                provider: 'tiktok',
                id: '123',
                url: final,
              },
            },
            {
              ...payloads[0]!,
              embed: {
                kind: 'provider',
                provider: 'tiktok',
                id: videoId,
                url: 'https://vm.tiktok.com/unresolved/',
              },
            },
            { ...payloads[0]!, url: 'https://example.com/spoof' },
            {
              ...payloads[0]!,
              url: 'https://www.tiktok.com/@test/video/7420000000000000001',
            },
            {
              ...payloads[0]!,
              canonical_url:
                'https://www.tiktok.com/@test/video/7420000000000000001',
            },
            {
              ...fixture,
              source: 'TikTok',
              source_item_id: videoId,
              embed: null,
            },
          ])
            assert.equal(
              (await create(invalid as CreatePostInput)).status,
              400,
            );
          const noMetadata = await create({
            ...fixture,
            url: 'https://www.tiktok.com/@test/video/7420000000000000002',
            canonical_url: null,
            source_item_id: null,
            embed: null,
          });
          assert.equal(noMetadata.status, 201);
          assert.equal(
            noMetadata.data.post.source_item_id,
            '7420000000000000002',
          );
          const unresolved = await create({
            ...fixture,
            url: 'https://vt.tiktok.com/unresolved/',
            canonical_url: null,
            source_item_id: null,
            embed: null,
          });
          assert.equal(unresolved.status, 201);
          assert.equal(unresolved.data.post.source_item_id, null);
        },
      );
      await reset();

      await t.test(
        'FIX-002 immutable legacy TikTok claims deduplicate or fail closed without new rows',
        async () => {
          const videoId = '6718335390845095173';
          const final = `https://www.tiktok.com/@test/video/${videoId}`;
          const payload = await prepareUrl(final, async () => new Response(''));
          const seed = async (suffix: string, embedUrl = final) => {
            const result = await create({
              ...fixture,
              url: `https://vt.tiktok.com/legacy-${suffix}/`,
              canonical_url: null,
              source: `vt.tiktok.com-${suffix}`,
              source_item_id: null,
              embed: null,
            });
            await db
              .prepare('UPDATE posts SET embed = ? WHERE id = ?')
              .bind(
                JSON.stringify({
                  kind: 'provider',
                  provider: 'tiktok',
                  id: videoId,
                  url: embedUrl,
                }),
                result.data.post.id,
              )
              .run();
            return result.data.post.id;
          };
          // Simulate an older canonical record without embed metadata or stable namespace.
          const canonicalLegacy = await create({
            ...fixture,
            url: final,
            canonical_url: null,
            source_item_id: null,
            embed: null,
          });
          // Direct SQL insert is necessary because the new ingestion normalizes identities.
          await reset();
          await db
            .prepare(
              `INSERT INTO posts (id,type,url,canonical_url,source_item_id,title,source,origin,preview,embed,body,"references",published_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              canonicalLegacy.data.post.id,
              'video',
              final,
              final,
              null,
              'Legacy',
              'www.tiktok.com',
              'telegram',
              null,
              null,
              null,
              '[]',
              new Date().toISOString(),
              null,
            )
            .run();
          const legacyDuplicate = await create({
            ...payload,
            url: 'https://vm.tiktok.com/canonical-legacy/',
            canonical_url: null,
          });
          assert.equal(legacyDuplicate.status, 200);
          assert.equal(
            legacyDuplicate.data.post.id,
            canonicalLegacy.data.post.id,
          );
          await reset();
          const old = await seed('one');
          for (const url of [final, 'https://vm.tiktok.com/new-legacy/']) {
            const duplicate = await create({ ...payload, url });
            assert.equal(duplicate.status, 200);
            assert.equal(duplicate.data.post.id, old);
          }
          await api(`/${old}`, { method: 'DELETE', headers });
          assert.ok((await create(payload)).data.post.deleted_at);
          await seed('two');
          assert.equal((await create(payload)).status, 400);
          assert.equal(
            await db
              .prepare('SELECT COUNT(*) AS n FROM posts')
              .first<number>('n'),
            2,
          );
          await reset();
          await seed(
            'bad',
            'https://www.tiktok.com/@test/video/7420000000000000001',
          );
          assert.equal((await create(payload)).status, 400);
          assert.equal(
            await db
              .prepare('SELECT COUNT(*) AS n FROM posts')
              .first<number>('n'),
            1,
          );
        },
      );
      await reset();

      await t.test(
        'FIX-003 every legacy TikTok identity agrees, including tombstones and concurrent aliases',
        async (s) => {
          const videoA = '6718335390845095173';
          const videoB = '7420000000000000001';
          const canonical = (id: string) =>
            `https://www.tiktok.com/@legacy/video/${id}`;
          const embed = (id: string, urlId = id): Post['embed'] => ({
            kind: 'provider',
            provider: 'tiktok',
            id,
            url: canonical(urlId),
          });
          const payload = await prepareUrl(
            canonical(videoA),
            async () => new Response(''),
          );
          const cases: {
            name: string;
            seed: Partial<
              Pick<Post, 'url' | 'source' | 'source_item_id' | 'embed'>
            >;
            status: number;
          }[] = [
            {
              name: 'original without optional metadata',
              seed: {},
              status: 200,
            },
            {
              name: 'all identities agree',
              seed: {
                source: 'tIkToK',
                source_item_id: videoA,
                embed: embed(videoA),
              },
              status: 200,
            },
            {
              name: 'short original with consistent embed',
              seed: {
                url: 'https://vt.tiktok.com/legacy-consistent/',
                embed: embed(videoA),
              },
              status: 200,
            },
            {
              name: 'source ID in another namespace',
              seed: { source: 'Legacy importer', source_item_id: 'import-123' },
              status: 200,
            },
            {
              name: 'fallback link has no provider identity claim',
              seed: {
                embed: { kind: 'link', url: canonical(videoB), label: null },
              },
              status: 200,
            },
            {
              name: 'original A with embed ID and URL B',
              seed: { embed: embed(videoB) },
              status: 400,
            },
            {
              name: 'original A with embed ID B and URL A',
              seed: { embed: embed(videoB, videoA) },
              status: 400,
            },
            {
              name: 'original A with embed ID A and URL B',
              seed: { embed: embed(videoA, videoB) },
              status: 400,
            },
            {
              name: 'original A with TikTok source ID B',
              seed: { source: 'tIkToK', source_item_id: videoB },
              status: 400,
            },
            {
              name: 'short original with embed A and TikTok source ID B',
              seed: {
                url: 'https://vm.tiktok.com/legacy-conflict/',
                source: 'TikTok',
                source_item_id: videoB,
                embed: embed(videoA),
              },
              status: 400,
            },
            {
              name: 'original B with embed A',
              seed: { url: canonical(videoB), embed: embed(videoA) },
              status: 400,
            },
            {
              name: 'source ID alone does not verify an unresolved original',
              seed: {
                url: 'https://vt.tiktok.com/legacy-unresolved/',
                source: 'TikTok',
                source_item_id: videoA,
              },
              status: 400,
            },
          ];
          for (const scenario of cases)
            for (const deleted of [false, true])
              await s.test(
                `${scenario.name} (${deleted ? 'deleted' : 'active'})`,
                async () => {
                  await reset();
                  const id = crypto.randomUUID();
                  const original = scenario.seed.url ?? canonical(videoA);
                  const deletedAt = deleted ? '2026-10-13T00:00:00.000Z' : null;
                  await db
                    .prepare(
                      `INSERT INTO posts (id,type,url,canonical_url,source_item_id,title,source,origin,preview,embed,body,"references",published_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    )
                    .bind(
                      id,
                      'video',
                      original,
                      original,
                      scenario.seed.source_item_id ?? null,
                      'Private legacy review fixture',
                      scenario.seed.source ?? 'www.tiktok.com',
                      'telegram',
                      null,
                      scenario.seed.embed
                        ? JSON.stringify(scenario.seed.embed)
                        : null,
                      null,
                      '[]',
                      '2026-10-12T00:00:00.000Z',
                      deletedAt,
                    )
                    .run();
                  const before = await db
                    .prepare('SELECT * FROM posts WHERE id = ?')
                    .bind(id)
                    .first();
                  const urls = [
                    canonical(videoA),
                    'https://vt.tiktok.com/fix003/',
                    'https://vm.tiktok.com/fix003/',
                  ];
                  const responses = await Promise.all(
                    Array.from({ length: 6 }, (_, index) =>
                      create({ ...payload, url: urls[index % 3]! }),
                    ),
                  );
                  for (const result of responses) {
                    assert.equal(result.status, scenario.status);
                    if (scenario.status === 200) {
                      assert.equal(result.data.outcome, 'duplicate');
                      assert.equal(result.data.post.id, id);
                      assert.equal(result.data.post.url, original);
                      assert.equal(result.data.post.deleted_at, deletedAt);
                    } else
                      assert.deepEqual(result.error, {
                        code: 'VALIDATION_ERROR',
                        message:
                          'Existing TikTok identity requires data review.',
                      });
                  }
                  assert.equal(
                    await db
                      .prepare('SELECT COUNT(*) AS n FROM posts')
                      .first<number>('n'),
                    1,
                    'Concurrent duplicates/conflicts never insert another row',
                  );
                  assert.deepEqual(
                    await db
                      .prepare('SELECT * FROM posts WHERE id = ?')
                      .bind(id)
                      .first(),
                    before,
                    'All legacy fields and deletion state remain unchanged',
                  );
                  assert.equal(
                    (await api<Post>(`/${id}`)).status,
                    deleted ? 404 : 200,
                  );
                  assert.equal(
                    (await api<PostsPage>('')).data.posts.length,
                    deleted ? 0 : 1,
                  );
                },
              );
        },
      );
      await reset();

      await t.test(
        'FIX-002 Reddit adapter HTTP and scoped headers',
        async () => {
          const original =
            'https://old.reddit.com/r/aww/comments/crpjwk/example/';
          const response = await fetch(
            `${base}/embed/reddit?url=${encodeURIComponent(original)}`,
          );
          assert.equal(response.status, 200);
          assert.match(response.headers.get('content-type')!, /text\/html/);
          const csp = response.headers.get('content-security-policy')!;
          assert.match(csp, /sandbox allow-scripts allow-popups/);
          assert.doesNotMatch(csp, /allow-same-origin/);
          assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
          assert.match(
            response.headers.get('permissions-policy')!,
            /autoplay=\(\)/,
          );
          assert.match(
            await response.text(),
            /https:\/\/embed.reddit.com\/widgets.js/,
          );
          const main = await fetch(base);
          assert.doesNotMatch(
            main.headers.get('content-security-policy')!,
            /widgets.js|unsafe-inline/,
          );
          await main.body?.cancel();
          for (const bad of [
            'https://evil.example/',
            'https://reddit.com/r/private/',
            'javascript:alert(1)',
          ]) {
            const response = await fetch(
              `${base}/embed/reddit?url=${encodeURIComponent(bad)}`,
            );
            assert.equal(response.status, 400);
            assert.doesNotMatch(await response.text(), /<script/);
          }
        },
      );

      await t.test(
        'FIX-001 missing originals never insert D1 rows and short video metadata round-trips',
        async () => {
          const publisher = new Publisher(
            new Api(base, 'integration-test-only'),
            new State(join(directory, 'fix-state')),
          );
          const update = (url: string, user = 123) => ({
            message: {
              from: { id: user },
              chat: { id: user, type: 'private' },
              text: url,
            },
          });
          for (const status of [404, 410]) {
            const before = await db
              .prepare('SELECT COUNT(*) AS count FROM posts')
              .first<{ count: number }>();
            const reply = await handleUpdate(
              update(`https://example.com/gone-${status}`),
              new Set(['123']),
              publisher,
              async () => new Response('', { status }),
            );
            assert.match(reply!.text, /^FAILED/);
            assert.match(reply!.text, new RegExp(`HTTP ${status}`));
            assert.match(reply!.text, /No publication payload was saved/);
            const after = await db
              .prepare('SELECT COUNT(*) AS count FROM posts')
              .first<{ count: number }>();
            assert.deepEqual(after, before);
          }
          assert.equal(
            await handleUpdate(
              update('https://example.com/denied', 456),
              new Set(['123']),
              publisher,
              async () => assert.fail('Unauthorized metadata request'),
            ),
            null,
          );
          assert.match(
            (await handleUpdate(
              update('https://127.0.0.1/'),
              new Set(['123']),
              publisher,
              async () => assert.fail('Unsafe metadata request'),
            ))!.text,
            /^FAILED/,
          );
          const original = 'https://vt.tiktok.com/local-fixture/';
          const final =
            'https://www.tiktok.com/@test/video/6718335390845095173';
          const metadata = async () => {
            const response = new Response('');
            Object.defineProperty(response, 'url', { value: final });
            return response;
          };
          const reply = await handleUpdate(
            update(original),
            new Set(['123']),
            publisher,
            metadata,
          );
          assert.match(reply!.text, /^PUBLISHED/);
          const post = (await publisher.api.posts())[0]!;
          assert.equal(post.url, original);
          assert.equal(post.type, 'video');
          assert.equal(post.embed?.url, final);
          assert.match(
            (await handleUpdate(
              update(original),
              new Set(['123']),
              publisher,
              metadata,
            ))!.text,
            /^ALREADY EXISTS/,
          );
          assert.equal((await publisher.api.posts()).length, 1);
        },
      );
      await reset();

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
            2,
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
        'gateway outbox replay is durable even after an uncertain committed D1 write',
        async () => {
          let gatewayFailed = true;
          const state = new State(join(directory, 'gateway-state'));
          const publisher = new Publisher(
            new Api(
              base,
              'integration-test-only',
              async (url, init) => {
                const response = await fetch(url, init);
                if (!gatewayFailed) return response;
                await response.body?.cancel();
                return new Response('', { status: 502 });
              },
              async () => {},
            ),
            state,
          );
          await publisher.setPaused('auto', false);
          await assert.rejects(publisher.submit(fixture));
          assert.equal((await publisher.api.posts().catch(() => [])).length, 0);
          const rows = await db
            .prepare('SELECT COUNT(*) AS count FROM posts')
            .first<{ count: number }>();
          assert.equal(rows!.count, 1);
          assert.equal(
            (await state.names()).filter((name) => name.startsWith('outgoing-'))
              .length,
            1,
          );
          gatewayFailed = false;
          assert.deepEqual(await publisher.replay(), { sent: 1, failed: 0 });
          assert.equal((await publisher.api.posts()).length, 1);
          assert.equal(
            (await state.names()).filter((name) => name.startsWith('outgoing-'))
              .length,
            0,
          );
          assert.equal((await publisher.processed()).length, 1);
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
        'URL-less changelogs/news, all content kinds and provider metadata round-trip',
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
          const bulletin: CreatePostInput = {
            ...fixture,
            type: 'news',
            url: null,
            canonical_url: null,
            source_item_id: 'bulletin:2026-10-19:outage',
            preview: null,
            embed: null,
            body: 'No public link is available yet.',
          };
          const bulletinCreated = await create(bulletin);
          assert.equal(bulletinCreated.status, 201);
          assert.equal(bulletinCreated.data.post.canonical_url, null);
          assert.equal((await create(bulletin)).status, 200);
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
        'tracking variants duplicate atomically and content query parameters remain distinct',
        async () => {
          const original = await create({
            ...fixture,
            url: 'https://example.com/item?v=one&utm_source=a',
            source_item_id: null,
          });
          const duplicate = await create({
            ...fixture,
            url: 'https://example.com/item?v=one&fbclid=b&utm_medium=c',
            source_item_id: null,
          });
          assert.equal(duplicate.status, 200);
          assert.equal(duplicate.data.post.id, original.data.post.id);
          assert.equal(
            original.data.post.canonical_url,
            'https://example.com/item?v=one',
          );
          assert.equal(
            (
              await create({
                ...fixture,
                url: 'https://example.com/item?v=two',
                source_item_id: null,
              })
            ).status,
            201,
          );
          await api(`/${original.data.post.id}`, { method: 'DELETE', headers });
          const tombstone = await create({
            ...fixture,
            url: 'https://example.com/item?utm_campaign=x&v=one',
            source_item_id: null,
          });
          assert.equal(tombstone.data.outcome, 'duplicate');
          assert.ok(tombstone.data.post.deleted_at);
        },
      );
      await reset();
      await t.test(
        'Sprint 6 intents and owner Telegram reach real local Worker/D1',
        async () => {
          const publisher = new Publisher(
            new Api(base, 'integration-test-only'),
            new State(join(directory, 'automation-state')),
            { discoveryIngressToken: 'discovery-ingress-test-token' },
          );
          const discoveryIntent = withPublicationIntentContentHash({
            version: 1 as const,
            intent_id: 'discovery-synthetic-20261019',
            origin: 'auto' as const,
            authorization: {
              kind: 'discovery' as const,
              approved: true as const,
            },
            editorial: {
              decision_id: 'decision-synthetic-20261019',
              source_event_id: 'source-event-1',
              source_attribution: 'Example reporting',
              approved_at: '2026-10-19T00:00:00.000Z',
              publication_policy: {
                version: 'discovery-policy-v1',
                outcome: 'approved' as const,
              },
            },
            post: {
              ...fixture,
              origin: 'auto' as const,
              url: 'https://example.com/discovery-editorial',
              source_item_id: 'discovery-editorial-1',
              title: 'A verified editorial headline',
              body: 'A full synthetic editorial article with source attribution.',
              references: [
                {
                  url: 'https://example.com/discovery-editorial',
                  title: 'Verified source',
                },
              ],
            },
          });
          await publisher.setPaused('auto', false);
          const discoveryResult = await publisher.submitDiscoveryIntent(
            discoveryIntent,
            'discovery-ingress-test-token',
          );
          assert.equal(discoveryResult.outcome, 'created');
          assert.equal(
            (await api<Post>(`/${discoveryResult.post.id}`)).data.body,
            discoveryIntent.post.body,
          );
          await publisher.setPaused('auto', true);
          await assert.rejects(
            publisher.submitDiscoveryIntent(
              withPublicationIntentContentHash({
                ...discoveryIntent,
                intent_id: 'discovery-paused-20261019',
              }),
              'discovery-ingress-test-token',
            ),
            /paused/,
          );
          const input = {
            ...fixture,
            url: 'https://example.com/automation',
            source_item_id: 'automation',
          };
          await publisher.setPaused('auto', false);
          assert.equal((await publisher.submit(input)).outcome, 'created');
          assert.equal((await publisher.submit(input)).outcome, 'duplicate');
          const update = {
            update_id: 5,
            message: {
              message_id: 5,
              from: { id: 123, is_bot: false },
              chat: { id: 123, type: 'private' },
              text: 'An owner text bulletin without a source URL',
            },
          };
          const metadata = async () => new Response('', { status: 403 });
          const reply = await handleUpdate(
            update,
            new Set(['123']),
            publisher,
            metadata,
          );
          assert.match(reply!.text, /^PUBLISHED/);
          const id = reply!.text.match(/post=([0-9a-f-]+)/)![1]!;
          const publication = (await api<Post>(`/${id}`)).data;
          assert.equal(publication.origin, 'telegram');
          assert.equal(
            publication.title,
            'An owner text bulletin without a source URL',
          );
          assert.equal(publication.url, null);
          assert.equal(
            publication.body,
            'An owner text bulletin without a source URL',
          );
          assert.equal(publication.canonical_url, null);
          const redelivery = await handleUpdate(
            update,
            new Set(['123']),
            publisher,
            metadata,
          );
          assert.match(redelivery!.text, /^PUBLISHED/);
          assert.match(redelivery!.text, new RegExp(id));
          const denied = await api(`/${id}`, { method: 'DELETE' });
          assert.equal(denied.status, 401);
          const deletion = await handleUpdate(
            {
              ...update,
              message: { ...update.message, text: `/delete ${id}` },
            },
            new Set(['123']),
            publisher,
          );
          assert.match(deletion!.text, /^DELETED/);
          assert.equal((await api(`/${id}`)).status, 404);
          const discovery = await runDiscovery(
            publisher,
            { run: async () => ({ selected: [] }) },
            [
              {
                name: 'fixture',
                url: 'https://feeds.example/rss',
                enabled: true,
                format: 'feed',
              },
            ],
            new Date('2026-10-12T02:00:00.000Z'),
            async () =>
              new Response(
                '<rss><channel><item><title>Existing source event</title><link>https://example.com/discovery</link><pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
              ),
          );
          assert.equal(discovery.published, 0);
          assert.equal(discovery.candidates, 1);
          const monthly = await runChangelog(
            publisher,
            {
              run: async (_task, data) => {
                const ids = (data as { posts: { id: string }[] }).posts.map(
                  (p) => p.id,
                );
                assert.deepEqual(
                  ids,
                  (await publisher.api.posts()).map((post) => post.id),
                );
                return {
                  body: ids
                    .map(
                      (id) =>
                        `[ADDED] [post:${id}] ${'Supported satire '.repeat(38)}`,
                    )
                    .join('\n'),
                  publication_ids: ids,
                };
              },
            },
            new Date().toISOString().slice(0, 7),
            'UTC',
          );
          assert.equal(monthly.outcome, 'created');
          const rerun = await runChangelog(
            new Publisher(
              new Api(base, 'integration-test-only'),
              new State(join(directory, 'fresh-monthly-state')),
            ),
            {
              run: async () => {
                assert.fail('Existing monthly post must skip AI.');
              },
            },
            new Date().toISOString().slice(0, 7),
            'UTC',
          );
          assert.equal(rerun.outcome, 'already_exists');
          const home = await fetch(base);
          assert.equal(home.status, 200);
          assert.match(await home.text(), /Incoming transmissions/);
        },
      );
      await reset();
      if (process.env.WAAGD_BROWSER_TESTS === '1') {
        await t.test(
          'production frontend, actual API, embeds, pagination, permalinks and deletion in Chromium',
          async () => {
            const browser = async (
              mode: string,
              ids: Record<string, string> = {},
            ) => {
              const { stdout } = await promisify(execFile)(
                process.execPath,
                [
                  join(root, 'tests/mvp.browser.mjs'),
                  JSON.stringify({ base, mode, ids }),
                ],
                { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 },
              );
              assert.match(stdout, /"passed":\d+/);
              console.log(stdout.trim());
            };
            await browser('empty');
            const ids: Record<string, string> = {};
            for (let i = 0; i < 25; i++) {
              const result = await create({
                ...fixture,
                url: `https://example.com/local/${i}`,
                source_item_id: `local-${i}`,
                title: `Local evidence ${i}`,
                preview: null,
                embed: null,
                references: [],
              });
              if (i === 0) ids.target = result.data.post.id;
            }
            const variants: Record<string, CreatePostInput> = {
              video: {
                ...fixture,
                type: 'video',
                url: 'https://youtu.be/abcdefghijk',
                title: 'Local video',
                source_item_id: 'local-video',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'youtube',
                  id: 'abcdefghijk',
                  url: 'https://youtu.be/abcdefghijk',
                },
              },
              fallback: {
                ...fixture,
                type: 'video',
                url: 'https://example.com/unavailable',
                title: 'Local fallback',
                source_item_id: 'local-fallback',
                preview: null,
                embed: {
                  kind: 'link',
                  url: 'https://example.com/unavailable',
                  label: null,
                },
              },
              meme: {
                ...fixture,
                type: 'meme',
                url: 'https://example.com/meme',
                title: 'Local meme',
                source_item_id: 'local-meme',
                preview: {
                  image_url: 'https://example.com/image.png',
                  alt_text: null,
                },
                embed: null,
              },
              log: {
                ...fixture,
                type: 'changelog',
                url: null,
                canonical_url: null,
                title: 'Local changelog',
                source_item_id: 'local-log',
                preview: null,
                embed: null,
                body: '[ADDED]\n- Existing content\n<script>window.pwned=true</script>',
                references: [
                  {
                    url: `${base}/?post=${ids.target}`,
                    title: 'Source publication',
                  },
                ],
              },
            };
            for (const [key, input] of Object.entries(variants))
              ids[key] = (await create(input)).data.post.id;
            assert.ok(
              !(await api<PostsPage>('?limit=20')).data.posts.some(
                (p) => p.id === ids.target,
              ),
            );
            await browser('feed', ids);
            await api(`/${ids.target}`, { method: 'DELETE', headers });
            await browser('deleted', ids);
            ids.short = (
              await create({
                ...fixture,
                url: 'https://vt.tiktok.com/browser-fixture/',
                source_item_id: null,
                type: 'video',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'tiktok',
                  id: '6718335390845095173',
                  url: 'https://www.tiktok.com/@test/video/6718335390845095173',
                },
              })
            ).data.post.id;
            ids.unsafe = (
              await create({
                ...fixture,
                url: 'https://example.com/unsafe-preview',
                source_item_id: 'fix-preview',
                preview: {
                  image_url: 'https://127.0.0.1/private.png',
                  alt_text: null,
                },
                embed: null,
              })
            ).data.post.id;
            ids.reddit = (
              await create({
                ...fixture,
                url: 'https://www.reddit.com/r/test/comments/abc123/title/',
                source: 'Reddit',
                source_item_id: 'fix-reddit',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'reddit',
                  id: 'abc123',
                  url: 'https://www.reddit.com/r/test/comments/abc123/title/',
                },
              })
            ).data.post.id;
            ids.publicPreview = (
              await create({
                ...fixture,
                url: 'https://example.com/public-preview',
                source_item_id: 'fix-public-preview',
                preview: {
                  image_url: 'https://images.example/public.svg',
                  alt_text: null,
                },
                embed: null,
              })
            ).data.post.id;
            await browser('fix', ids);
            for (const [key, input] of Object.entries({
              redditMeme: {
                ...fixture,
                type: 'meme',
                url: 'https://www.reddit.com/r/test/comments/abc124/title/',
                canonical_url: null,
                source: 'Reddit',
                source_item_id: 'media-meme',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'reddit',
                  id: 'abc124',
                  url: 'https://www.reddit.com/r/test/comments/abc124/title/',
                },
              },
              redditNoMetadata: {
                ...fixture,
                url: 'https://old.reddit.com/r/test/comments/abc125/title/',
                canonical_url: null,
                source: 'Reddit',
                source_item_id: 'media-none',
                preview: null,
                embed: null,
              },
              redditInvalid: {
                ...fixture,
                url: 'https://www.reddit.com/r/test/comments/abc126/title/',
                canonical_url: null,
                source: 'Reddit',
                source_item_id: 'media-invalid',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'reddit',
                  id: 'invalid_id',
                  url: 'https://www.reddit.com/r/test/comments/abc126/title/',
                },
              },
              liveReddit: {
                ...fixture,
                url: 'https://www.reddit.com/r/aww/comments/crpjwk/every_year_this_mama_duck_brings_her_babies_to_my/',
                canonical_url: null,
                source: 'Reddit',
                source_item_id: 'media-live',
                preview: null,
                embed: {
                  kind: 'provider',
                  provider: 'reddit',
                  id: 'crpjwk',
                  url: 'https://www.reddit.com/r/aww/comments/crpjwk/every_year_this_mama_duck_brings_her_babies_to_my/',
                },
              },
            }))
              ids[key] = (await create(input as CreatePostInput)).data.post.id;
            for (const live of [
              false,
              ...(process.env.WAAGD_LIVE_REDDIT === '1' ? [true] : []),
            ]) {
              const { stdout } = await promisify(execFile)(
                process.execPath,
                [
                  join(root, 'tests/media.browser.mjs'),
                  JSON.stringify({ base, ids, live }),
                ],
                { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 },
              );
              console.log(stdout.trim());
            }

            const { stdout: legalChecks } = await promisify(execFile)(
              process.execPath,
              [join(root, 'tests/legal.browser.mjs'), base],
              { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 },
            );
            console.log(legalChecks.trim());
            assert.equal(
              (await fetch(base)).status,
              200,
              'Static site needs no automation process',
            );
          },
        );
        await reset();
      }
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
